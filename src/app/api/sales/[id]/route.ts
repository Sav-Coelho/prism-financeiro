import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const id = parseInt(params.id)
  await prisma.sale.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
