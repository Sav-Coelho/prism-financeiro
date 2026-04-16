import { prisma } from '@/lib/prisma'
import { calcDRE } from '@/lib/dre'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const month = parseInt(searchParams.get('month') || '0')
  const year = parseInt(searchParams.get('year') || '0')
  const unitId = searchParams.get('unitId')

  if (!month || !year) {
    return NextResponse.json({ error: 'month e year são obrigatórios' }, { status: 400 })
  }

  const unitFilter = unitId ? { unitId: parseInt(unitId) } : {}

  const transactions = await prisma.transaction.findMany({
    where: { month, year, accountId: { not: null }, ...unitFilter },
    include: { account: true }
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dre = calcDRE(transactions as any, month, year)

  const yearData = await Promise.all(
    Array.from({ length: 12 }, async (_, i) => {
      const m = i + 1
      const txs = await prisma.transaction.findMany({
        where: { month: m, year, accountId: { not: null }, ...unitFilter },
        include: { account: true }
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return calcDRE(txs as any, m, year)
    })
  )

  return NextResponse.json({ dre, yearData })
}
