import { prisma } from '@/lib/prisma'
import { buildMatcher, dateKey } from '@/lib/ofx-dedup'
import { parseOFX } from '@/lib/ofx-parser'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get('file') as File | null

  if (!file) return NextResponse.json({ error: 'Arquivo não enviado' }, { status: 400 })

  const text = await file.text()
  const { transactions: parsed, bankInfo, ledgerBalance } = parseOFX(text)

  if (parsed.length === 0) {
    return NextResponse.json({ error: 'Nenhuma transação encontrada no arquivo OFX' }, { status: 422 })
  }

  // Detect bank account first so fitid check can be scoped to the same account
  let matchedBankAccount: { id: number; name: string; unitId: number; unitName: string } | null = null
  const acctId = bankInfo.acctId
  if (acctId) {
    const candidates = [bankInfo.bankId, bankInfo.org].filter(Boolean) as string[]
    for (const identifier of candidates) {
      const found = await prisma.bankAccount.findFirst({
        where: { ofxBankId: identifier, ofxAcctId: acctId },
        include: { unit: { select: { id: true, name: true } } }
      })
      if (found) {
        matchedBankAccount = {
          id: found.id,
          name: found.name,
          unitId: found.unitId,
          unitName: found.unit.name,
        }
        break
      }
    }
  }

  // Scope duplicate check strictly to the matched bank account.
  // If no account was identified yet, all transactions are new (can't be duplicates for an unknown account).
  // Dedup em duas camadas (mesma lógica da gravação — ver lib/ofx-dedup.ts):
  // fitid+data E conteúdo, para reconhecer reimports mesmo com fitid regenerado.
  let matcher: ReturnType<typeof buildMatcher> | null = null
  if (matchedBankAccount && parsed.length > 0) {
    const minDate = parsed.reduce((m, t) => (t.date < m ? t.date : m), parsed[0].date)
    const maxDate = parsed.reduce((m, t) => (t.date > m ? t.date : m), parsed[0].date)
    const existing = await prisma.transaction.findMany({
      where: { bankAccountId: matchedBankAccount.id, date: { gte: minDate, lte: maxDate } },
      select: { fitid: true, date: true, amount: true, description: true, createdAt: true },
    })
    matcher = buildMatcher(existing)
  }

  const transactions = parsed.map(tx => {
    const rec = matcher ? matcher.match(tx.fitid || null, dateKey(tx.date), tx.amount, tx.memo || '') : null
    return {
      fitid: tx.fitid,
      date: tx.date.toISOString(),
      amount: tx.amount,
      memo: tx.memo,
      alreadyImported: rec != null,
      importedAt: rec?.createdAt?.toISOString() ?? null,
      isBalance: tx.isBalance,
    }
  })

  return NextResponse.json({
    transactions,
    bankInfo,
    ledgerBalance: ledgerBalance
      ? { amount: ledgerBalance.amount, date: ledgerBalance.date?.toISOString() ?? null }
      : null,
    matchedBankAccount,
  })
}
