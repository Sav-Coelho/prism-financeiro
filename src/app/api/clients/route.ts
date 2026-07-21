import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export async function GET() {
  const clients = await prisma.client.findMany({
    include: {
      unit: true,
      sales: { select: { amount: true, date: true } },
    },
    orderBy: { name: 'asc' },
  })
  return NextResponse.json(clients)
}

export async function POST(req: Request) {
  const { name, email, phone, cpf, unitId } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'Nome obrigatório' }, { status: 400 })
  const client = await prisma.client.create({
    data: {
      name: name.trim(),
      email: email?.trim() || null,
      phone: phone?.trim() || null,
      cpf: cpf?.trim() || null,
      unitId: unitId ? parseInt(unitId) : null,
    },
    include: { unit: true, sales: true },
  })
  return NextResponse.json(client, { status: 201 })
}
