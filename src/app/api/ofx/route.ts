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
  bankInfo?: { bankId: string | null; acctId: string | null; org: string | null } | null
  balanceTransactions?: { date: string; amount: number }[]
}

export async function POST(req: NextRequest) {
  const body = await req.json() as SaveBody
  const { transactions, bankAccountId, ledgerBalance, bankInfo, balanceTransactions } = body

  if (!Array.isArray(transactions) || transactions.length === 0) {
    return NextResponse.json({ error: 'Nenhuma transação selecionada' }, { status: 400 })
  }

  const bankAccId = bankAccountId ? parseInt(String(bankAccountId)) : null

  const data = transactions.map(tx => {
    const d = new Date(tx.date)
    return {
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

  const result = await prisma.transaction.createMany({ data, skipDuplicates: true })
  const imported = result.count
  const skipped = transactions.length - imported

  // Save balance snapshots (daily + ledger) in parallel
  const snapshotOps: Promise<unknown>[] = []

  if (bankAccId && Array.isArray(balanceTransactions)) {
    for (const bt of balanceTransactions) {
      const snapDate = new Date(bt.date)
      snapDate.setHours(0, 0, 0, 0)
      snapshotOps.push(
        prisma.balanceSnapshot.upsert({
          where: { bankAccountId_date: { bankAccountId: bankAccId, date: snapDate } },
          update: { balance: bt.amount },
          create: { bankAccountId: bankAccId, date: snapDate, balance: bt.amount },
        }).catch(() => {})
      )
    }
  }

  if (bankAccId && ledgerBalance?.amount != null && ledgerBalance.date) {
    const snapDate = new Date(ledgerBalance.date)
    snapDate.setHours(0, 0, 0, 0)
    snapshotOps.push(
      prisma.balanceSnapshot.upsert({
        where: { bankAccountId_date: { bankAccountId: bankAccId, date: snapDate } },
        update: { balance: ledgerBalance.amount },
        create: { bankAccountId: bankAccId, date: snapDate, balance: ledgerBalance.amount },
      }).catch(() => {})
    )
  }

  // Link OFX identifiers and save snapshots in parallel
  const bankIdentifier = bankInfo?.bankId || bankInfo?.org
  const linkOp = bankAccId && bankIdentifier && bankInfo?.acctId
    ? prisma.bankAccount.findUnique({ where: { id: bankAccId } }).then(acc => {
        if (acc && !acc.ofxBankId) {
          return prisma.bankAccount.update({
            where: { id: bankAccId },
            data: { ofxBankId: bankIdentifier, ofxAcctId: bankInfo!.acctId! },
          })
        }
      }).catch(() => {})
    : Promise.resolve()

  await Promise.all([...snapshotOps, linkOp])

  return NextResponse.json({ imported, skipped })
}
