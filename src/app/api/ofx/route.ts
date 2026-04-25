import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'

interface IncomingTx {
  fitid: string
  date: string
  amount: number
  memo: string
  accountId?: string | number | null
  unitId?: string | number | null
}

interface SaveBody {
  transactions: IncomingTx[]
  bankAccountId?: string | number | null
  ledgerBalance?: { amount: number; date: string | null } | null
  bankInfo?: { bankId: string | null; acctId: string | null } | null
}

export async function POST(req: NextRequest) {
  const body = await req.json() as SaveBody
  const { transactions, bankAccountId, ledgerBalance, bankInfo } = body

  if (!Array.isArray(transactions) || transactions.length === 0) {
    return NextResponse.json({ error: 'Nenhuma transação selecionada' }, { status: 400 })
  }

  const bankAccId = bankAccountId ? parseInt(String(bankAccountId)) : null

  let imported = 0
  let skipped = 0

  for (const tx of transactions) {
    try {
      const d = new Date(tx.date)
      await prisma.transaction.create({
        data: {
          fitid: tx.fitid,
          date: d,
          description: tx.memo,
          memo: tx.memo,
          amount: tx.amount,
          month: d.getMonth() + 1,
          year: d.getFullYear(),
          accountId: tx.accountId ? parseInt(String(tx.accountId)) : null,
          unitId: tx.unitId ? parseInt(String(tx.unitId)) : null,
          bankAccountId: bankAccId,
        }
      })
      imported++
    } catch {
      skipped++
    }
  }

  // Save balance snapshot
  if (bankAccId && ledgerBalance?.amount != null && ledgerBalance.date) {
    try {
      const snapDate = new Date(ledgerBalance.date)
      snapDate.setHours(0, 0, 0, 0)
      await prisma.balanceSnapshot.upsert({
        where: { bankAccountId_date: { bankAccountId: bankAccId, date: snapDate } },
        update: { balance: ledgerBalance.amount },
        create: { bankAccountId: bankAccId, date: snapDate, balance: ledgerBalance.amount },
      })
    } catch {
      // non-fatal
    }
  }

  // Link OFX identifiers to bank account if not yet set
  const bankIdentifier = bankInfo?.bankId || bankInfo?.org
  if (bankAccId && bankIdentifier && bankInfo?.acctId) {
    try {
      const acc = await prisma.bankAccount.findUnique({ where: { id: bankAccId } })
      if (acc && !acc.ofxBankId) {
        await prisma.bankAccount.update({
          where: { id: bankAccId },
          data: { ofxBankId: bankIdentifier, ofxAcctId: bankInfo.acctId },
        })
      }
    } catch {
      // non-fatal
    }
  }

  return NextResponse.json({ imported, skipped })
}
