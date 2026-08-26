/**
 * Dados salvos da aba "Sugestão de Compra": o import ATIVO de cada loja,
 * com os SKUs no formato compacto que a página consome.
 */
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const imports = await prisma.compraImport.findMany({
    where: { active: true },
    include: { skus: { select: { cod: true, nome: true, estoque: true, q: true, v: true } } },
    orderBy: { createdAt: 'desc' },
  })
  const stores = imports.map(i => ({
    loja: i.loja,
    importId: i.id,
    fileName: i.fileName,
    janela: i.janela,
    periodo: i.periodo,
    produtos: i.produtos,
    createdAt: i.createdAt,
    rows: i.skus.map(s => [s.cod, s.nome, s.estoque, s.q, s.v]),
  }))
  return NextResponse.json({ stores })
}
