import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const bankAccountIdRaw = searchParams.get('bankAccountId')

  if (!bankAccountIdRaw) {
    return NextResponse.json({ error: 'bankAccountId required' }, { status: 400 })
  }

  const bankAccountId = parseInt(bankAccountIdRaw)

  const [bankAccount, snapshots] = await Promise.all([
    prisma.bankAccount.findUnique({
      where: { id: bankAccountId },
      include: { unit: { select: { name: true } } },
    }),
    prisma.balanceSnapshot.findMany({
      where: { bankAccountId },
      orderBy: { date: 'asc' },
    }),
  ])

  if (!bankAccount) {
    return NextResponse.json({ error: 'Conta bancária não encontrada' }, { status: 404 })
  }

  // --- Fallback: se não há snapshots OFX, computa saldo acumulado a partir das transações ---
  let snapshotsOut: { date: string; balance: number; isComputed?: boolean }[]
  let isComputed = false

  if (snapshots.length > 0) {
    snapshotsOut = snapshots.map(s => ({ date: s.date.toISOString(), balance: s.balance }))
  } else {
    const txs = await prisma.transaction.findMany({
      where: { bankAccountId },
      select: { date: true, amount: true },
      orderBy: { date: 'asc' },
    })

    if (txs.length > 0) {
      isComputed = true
      const byDate: Record<string, number> = {}
      txs.forEach(tx => {
        const key = tx.date.toISOString().split('T')[0]
        byDate[key] = (byDate[key] || 0) + tx.amount
      })

      let balance = bankAccount.initialBalance
      snapshotsOut = Array.from(Object.entries(byDate))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, amount]) => {
          balance += amount
          return { date: `${date}T00:00:00.000Z`, balance, isComputed: true }
        })
    } else {
      snapshotsOut = []
    }
  }

  const currentBalance = snapshotsOut.length > 0
    ? snapshotsOut[snapshotsOut.length - 1].balance
    : bankAccount.initialBalance

  return NextResponse.json({
    bankAccount: { id: bankAccount.id, name: bankAccount.name, unit: bankAccount.unit },
    snapshots: snapshotsOut,
    currentBalance,
    isComputed,
  })
}
