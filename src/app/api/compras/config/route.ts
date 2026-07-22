/**
 * Config do Controle de Compras: compradores, categorias, parâmetros (meta CMV)
 * e a receita de referência puxada da DRE (último mês fechado).
 * Cria defaults na primeira leitura. Mutações via POST { kind, op, data }.
 *
 * Adaptado do prism-vale-sol: a receita de referência vem da DRE do MPF
 * (transações com dreGroup 'Receita Operacional'), não de um DreEntry de ERP.
 */
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const DEFAULT_CATEGORIAS = [
  'Material / Insumos', 'Serviços', 'Infraestrutura', 'Marketing', 'Frete', 'Outros',
]

async function seedIfEmpty() {
  if (await prisma.purchaseCategoria.count() === 0)
    await prisma.purchaseCategoria.createMany({ data: DEFAULT_CATEGORIAS.map(nome => ({ nome })), skipDuplicates: true })
  if (await prisma.purchaseSetting.findUnique({ where: { key: 'metaCmvPct' } }) === null)
    await prisma.purchaseSetting.create({ data: { key: 'metaCmvPct', value: 0.70 } })
}

// receita de referência = Receita Operacional do MÊS ANTERIOR (último mês fechado).
// Sempre o mês anterior ao atual — ex.: em julho, a referência é junho.
async function receitaRef(): Promise<{ ym: string | null; value: number }> {
  const now = new Date()
  const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
  const refYear = prev.getUTCFullYear()
  const refMonth = prev.getUTCMonth() + 1
  const rows = await prisma.transaction.findMany({
    where: { year: refYear, month: refMonth, account: { dreGroup: 'Receita Operacional' } },
    select: { amount: true },
  })
  const value = rows.reduce((s, r) => s + Math.abs(r.amount), 0)
  return { ym: `${refYear}-${String(refMonth).padStart(2, '0')}`, value }
}

export async function GET() {
  await seedIfEmpty()
  const [compradores, categorias, settings, rec] = await Promise.all([
    prisma.comprador.findMany({ orderBy: { nome: 'asc' } }),
    prisma.purchaseCategoria.findMany({ orderBy: { nome: 'asc' } }),
    prisma.purchaseSetting.findMany(),
    receitaRef(),
  ])
  const settingsMap: Record<string, number> = {}
  settings.forEach(s => settingsMap[s.key] = s.value)
  return NextResponse.json({ compradores, categorias: categorias.map(c => c.nome), settings: settingsMap, receitaRef: rec })
}

export async function POST(req: Request) {
  const { kind, op, data } = await req.json()
  try {
    if (kind === 'comprador') {
      if (op === 'delete') await prisma.comprador.delete({ where: { id: data.id } })
      else if (data.id) await prisma.comprador.update({ where: { id: data.id }, data: { nome: data.nome, limite: data.limite, setor: data.setor, ativo: data.ativo } })
      else await prisma.comprador.create({ data: { nome: data.nome, limite: data.limite ?? 0, setor: data.setor, ativo: data.ativo ?? true } })
    } else if (kind === 'categoria') {
      if (op === 'delete') await prisma.purchaseCategoria.deleteMany({ where: { nome: data.nome } })
      else await prisma.purchaseCategoria.create({ data: { nome: data.nome } })
    } else if (kind === 'setting') {
      await prisma.purchaseSetting.upsert({ where: { key: data.key }, create: { key: data.key, value: data.value }, update: { value: data.value } })
    } else {
      return NextResponse.json({ error: 'kind inválido' }, { status: 400 })
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'falha' }, { status: 400 })
  }
}
