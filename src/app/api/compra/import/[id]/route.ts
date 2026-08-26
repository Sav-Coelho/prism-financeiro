/** Remove um import da aba "Sugestão de Compra" (SKUs saem em cascata). */
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const id = parseInt(params.id)
  if (!id) return NextResponse.json({ error: 'id inválido' }, { status: 400 })
  await prisma.compraSku.deleteMany({ where: { importId: id } })
  await prisma.compraImport.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
