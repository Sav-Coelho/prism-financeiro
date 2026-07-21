/** Pedido individual: atualizar / remover. */
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  await prisma.purchaseOrder.delete({ where: { id: Number(params.id) } })
  return NextResponse.json({ ok: true })
}

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const b = await req.json()
  const data: Record<string, unknown> = {}
  if (b.comprador != null) data.comprador = String(b.comprador)
  if (b.fornecedor !== undefined) data.fornecedor = b.fornecedor || null
  if (b.tipo !== undefined) data.tipo = b.tipo || null
  if (b.categoria !== undefined) data.categoria = b.categoria || null
  if (b.dataPedido != null) data.dataPedido = new Date(b.dataPedido)
  if (b.valor != null) data.valor = Number(b.valor)
  if (b.parcelas != null) data.parcelas = Math.max(1, Math.round(Number(b.parcelas)))
  if (b.primeiraDias != null) data.primeiraDias = Math.max(0, Math.round(Number(b.primeiraDias)))
  if (b.intervaloDias != null) data.intervaloDias = Math.max(0, Math.round(Number(b.intervaloDias)))
  if (b.status != null) data.status = b.status
  if (b.observacao !== undefined) data.observacao = b.observacao || null
  const pedido = await prisma.purchaseOrder.update({ where: { id: Number(params.id) }, data })
  return NextResponse.json({ pedido })
}
