import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const clientId = searchParams.get('clientId')
  const sales = await prisma.sale.findMany({
    where: clientId ? { clientId: parseInt(clientId) } : {},
    include: { client: true, unit: true },
    orderBy: { date: 'desc' },
  })
  return NextResponse.json(sales)
}

export async function POST(req: Request) {
  const { clientId, description, amount, date, unitId } = await req.json()
  if (!clientId || !description?.trim() || !amount || !date) {
    return NextResponse.json({ error: 'Campos obrigatórios: cliente, descrição, valor, data' }, { status: 400 })
  }
  const d = new Date(date)
  const sale = await prisma.sale.create({
    data: {
      clientId: parseInt(clientId),
      description: description.trim(),
      amount: parseFloat(amount),
      date: d,
      month: d.getMonth() + 1,
      year: d.getFullYear(),
      unitId: unitId ? parseInt(unitId) : null,
    },
    include: { client: true, unit: true },
  })
  return NextResponse.json(sale, { status: 201 })
}
