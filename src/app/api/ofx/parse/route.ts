import { prisma } from '@/lib/prisma'
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
  const fitids = parsed.map(tx => tx.fitid).filter(Boolean) as string[]
  const existingSet = new Set<string>()
  if (matchedBankAccount && fitids.length > 0) {
    const existing = await prisma.transaction.findMany({
      where: { fitid: { in: fitids }, bankAccountId: matchedBankAccount.id },
      select: { fitid: true }
    })
    existing.forEach(e => { if (e.fitid) existingSet.add(e.fitid) })
  }

  const transactions = parsed.map(tx => ({
    fitid: tx.fitid,
    date: tx.date.toISOString(),
    amount: tx.amount,
    memo: tx.memo,
    alreadyImported: existingSet.has(tx.fitid),
    isBalance: tx.isBalance,
  }))

  return NextResponse.json({
    transactions,
    bankInfo,
    ledgerBalance: ledgerBalance
      ? { amount: ledgerBalance.amount, date: ledgerBalance.date?.toISOString() ?? null }
      : null,
    matchedBankAccount,
  })
}
