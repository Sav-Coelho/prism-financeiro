import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const month = searchParams.get('month')
  const year = searchParams.get('year')

  const where: Record<string, unknown> = {}
  if (month) where.month = parseInt(month)
  if (year) where.year = parseInt(year)

  const transactions = await prisma.transaction.findMany({
    where,
    include: { account: true },
    orderBy: { date: 'desc' },
    take: 500
  })
  return NextResponse.json(transactions)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { date, description, amount, accountId, memo } = body

  const d = new Date(date)
  const tx = await prisma.transaction.create({
    data: {
      date: d,
      description,
      amount: parseFloat(amount),
      memo,
      accountId: accountId ? parseInt(accountId) : null,
      month: d.getMonth() + 1,
      year: d.getFullYear()
    },
    include: { account: true }
  })
  return NextResponse.json(tx, { status: 201 })
}
