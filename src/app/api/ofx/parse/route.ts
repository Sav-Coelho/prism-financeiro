import { prisma } from '@/lib/prisma'
import { parseOFX } from '@/lib/ofx-parser'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get('file') as File | null

  if (!file) return NextResponse.json({ error: 'Arquivo não enviado' }, { status: 400 })

  const text = await file.text()
  const parsed = parseOFX(text)

  if (parsed.length === 0) {
    return NextResponse.json({ error: 'Nenhuma transação encontrada no arquivo OFX' }, { status: 422 })
  }

  const fitids = parsed.map(tx => tx.fitid).filter(Boolean) as string[]
  const existing = await prisma.transaction.findMany({
    where: { fitid: { in: fitids } },
    select: { fitid: true }
  })
  const existingSet = new Set(existing.map(e => e.fitid))

  const transactions = parsed.map(tx => ({
    fitid: tx.fitid,
    date: tx.date.toISOString(),
    amount: tx.amount,
    memo: tx.memo,
    alreadyImported: existingSet.has(tx.fitid)
  }))

  return NextResponse.json({ transactions })
}
