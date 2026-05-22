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
  // Chave composta: fitid + date (YYYY-MM-DD) — Bradesco reutiliza FITIDs entre períodos
  const existingMap = new Map<string, string>() // "fitid|YYYY-MM-DD" → importedAt ISO
  if (matchedBankAccount && fitids.length > 0) {
    const existing = await prisma.transaction.findMany({
      where: { fitid: { in: fitids }, bankAccountId: matchedBankAccount.id },
      select: { fitid: true, date: true, createdAt: true }
    })
    existing.forEach(e => {
      if (e.fitid) {
        const key = `${e.fitid}|${e.date.toISOString().slice(0, 10)}`
        existingMap.set(key, e.createdAt.toISOString())
      }
    })
  }

  const transactions = parsed.map(tx => {
    const dateStr = tx.date.toISOString().slice(0, 10)
    const key = `${tx.fitid}|${dateStr}`
    return {
      fitid: tx.fitid,
      date: tx.date.toISOString(),
      amount: tx.amount,
      memo: tx.memo,
      alreadyImported: existingMap.has(key),
      importedAt: existingMap.get(key) ?? null,
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
