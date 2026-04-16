import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const month = searchParams.get('month')
  const year = searchParams.get('year')
  const unitId = searchParams.get('unitId')

  const where: Record<string, unknown> = {}
  if (month) where.month = parseInt(month)
  if (year) where.year = parseInt(year)
  if (unitId) where.unitId = parseInt(unitId)

  const transactions = await prisma.transaction.findMany({
    where,
    include: { account: true, unit: true },
    orderBy: { date: 'desc' },
  })
  return NextResponse.json(transactions)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { date, description, amount, accountId, memo, unitId } = body

  const d = new Date(date)
  const tx = await prisma.transaction.create({
    data: {
      date: d,
      description,
      amount: parseFloat(amount),
      memo,
      accountId: accountId ? parseInt(accountId) : null,
      unitId: unitId ? parseInt(unitId) : null,
      month: d.getMonth() + 1,
      year: d.getFullYear()
    },
    include: { account: true, unit: true }
  })
  return NextResponse.json(tx, { status: 201 })
}
