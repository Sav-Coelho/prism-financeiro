import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const bankAccountIdRaw = searchParams.get('bankAccountId')

  if (!bankAccountIdRaw) {
    return NextResponse.json({ error: 'bankAccountId required' }, { status: 400 })
  }

  const bankAccountId = parseInt(bankAccountIdRaw)

  const [bankAccount, snapshots, transactions] = await Promise.all([
    prisma.bankAccount.findUnique({
      where: { id: bankAccountId },
      include: { unit: { select: { name: true } } }
    }),
    prisma.balanceSnapshot.findMany({
      where: { bankAccountId },
      orderBy: { date: 'asc' }
    }),
    prisma.transaction.findMany({
      where: { bankAccountId },
      orderBy: { date: 'asc' },
      select: { date: true, amount: true }
    })
  ])

  if (!bankAccount) {
    return NextResponse.json({ error: 'Conta bancária não encontrada' }, { status: 404 })
  }

  const dailyBalances = calcDailyBalances(transactions, snapshots, bankAccount.initialBalance)

  const currentBalance = dailyBalances.length > 0
    ? dailyBalances[dailyBalances.length - 1].balance
    : snapshots.length > 0
      ? snapshots[snapshots.length - 1].balance
      : bankAccount.initialBalance

  return NextResponse.json({
    bankAccount: { id: bankAccount.id, name: bankAccount.name, unit: bankAccount.unit },
    snapshots: snapshots.map(s => ({ date: s.date.toISOString(), balance: s.balance })),
    dailyBalances,
    currentBalance,
    transactionCount: transactions.length,
  })
}

function dateKey(d: Date): string {
  return d.toISOString().split('T')[0]
}

function calcDailyBalances(
  transactions: { date: Date; amount: number }[],
  snapshots: { date: Date; balance: number }[],
  initialBalance: number
): { date: string; balance: number }[] {
  if (transactions.length === 0 && snapshots.length === 0) return []

  let anchorDate: Date
  let anchorBalance: number

  if (snapshots.length > 0) {
    const latest = snapshots[snapshots.length - 1]
    anchorDate = latest.date
    anchorBalance = latest.balance
  } else {
    anchorDate = transactions[0].date
    anchorBalance = initialBalance
  }

  const anchorKey = dateKey(anchorDate)

  const txByDate = new Map<string, number>()
  for (const tx of transactions) {
    const key = dateKey(tx.date)
    txByDate.set(key, (txByDate.get(key) ?? 0) + tx.amount)
  }

  const allDates = [...new Set([...txByDate.keys(), anchorKey])].sort()
  const anchorIdx = allDates.indexOf(anchorKey)
  const balanceAtDate = new Map<string, number>()
  balanceAtDate.set(anchorKey, anchorBalance)

  // Forward pass
  let bal = anchorBalance
  for (let i = anchorIdx + 1; i < allDates.length; i++) {
    bal += txByDate.get(allDates[i]) ?? 0
    balanceAtDate.set(allDates[i], bal)
  }

  // Backward pass
  bal = anchorBalance
  for (let i = anchorIdx - 1; i >= 0; i--) {
    bal -= txByDate.get(allDates[i + 1]) ?? 0
    balanceAtDate.set(allDates[i], bal)
  }

  return allDates.map(date => ({
    date,
    balance: Math.round((balanceAtDate.get(date) ?? 0) * 100) / 100,
  }))
}
