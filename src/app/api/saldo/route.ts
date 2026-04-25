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

  const currentBalance = snapshots.length > 0
    ? snapshots[snapshots.length - 1].balance
    : bankAccount.initialBalance

  return NextResponse.json({
    bankAccount: { id: bankAccount.id, name: bankAccount.name, unit: bankAccount.unit },
    snapshots: snapshots.map(s => ({ date: s.date.toISOString(), balance: s.balance })),
    currentBalance,
  })
}
