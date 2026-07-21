/** Pedidos de compra: listagem e criação. */
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  const pedidos = await prisma.purchaseOrder.findMany({ orderBy: { dataPedido: 'desc' } })
  return NextResponse.json({ pedidos })
}

export async function POST(req: Request) {
  const b = await req.json()
  if (!b.comprador || !b.dataPedido || !(b.valor > 0)) {
    return NextResponse.json({ error: 'Comprador, data e valor são obrigatórios' }, { status: 400 })
  }
  const pedido = await prisma.purchaseOrder.create({
    data: {
      comprador: String(b.comprador),
      fornecedor: b.fornecedor || null,
      tipo: b.tipo || null,
      categoria: b.categoria || null,
      dataPedido: new Date(b.dataPedido),
      valor: Number(b.valor),
      parcelas: Math.max(1, Math.round(Number(b.parcelas) || 1)),
      primeiraDias: Math.max(0, Math.round(Number(b.primeiraDias) || 30)),
      intervaloDias: Math.max(0, Math.round(Number(b.intervaloDias) || 30)),
      status: b.status || 'Pendente',
      observacao: b.observacao || null,
    },
  })
  return NextResponse.json({ pedido })
}
