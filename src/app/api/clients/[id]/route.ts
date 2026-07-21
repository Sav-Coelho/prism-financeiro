import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const id = parseInt(params.id)
  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      unit: true,
      sales: { orderBy: { date: 'desc' } },
    },
  })
  if (!client) return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 })
  return NextResponse.json(client)
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const id = parseInt(params.id)
  const { name, email, phone, cpf, unitId, active } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'Nome obrigatório' }, { status: 400 })
  const client = await prisma.client.update({
    where: { id },
    data: {
      name: name.trim(),
      email: email?.trim() || null,
      phone: phone?.trim() || null,
      cpf: cpf?.trim() || null,
      unitId: unitId ? parseInt(unitId) : null,
      active: active !== undefined ? Boolean(active) : undefined,
    },
    include: { unit: true, sales: true },
  })
  return NextResponse.json(client)
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const id = parseInt(params.id)
  await prisma.sale.deleteMany({ where: { clientId: id } })
  await prisma.client.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
