/** Histórico de importações da aba "Sugestão de Compra" (metadados, mais recentes primeiro). */
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const historico = await prisma.compraImport.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: { id: true, loja: true, filial: true, janela: true, fileName: true, produtos: true, active: true, createdAt: true },
  })
  return NextResponse.json({ historico })
}
