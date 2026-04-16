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

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { transactions } = body as { transactions: IncomingTx[] }

  if (!Array.isArray(transactions) || transactions.length === 0) {
    return NextResponse.json({ error: 'Nenhuma transação selecionada' }, { status: 400 })
  }

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
        }
      })
      imported++
    } catch {
      skipped++
    }
  }

  return NextResponse.json({ imported, skipped })
}
