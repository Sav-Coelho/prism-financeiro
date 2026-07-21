/**
 * Analytics do Controle de Compras:
 *  - Dashboard: limite total, comprado no mês, saldo, CMV% atual vs meta.
 *  - Resumo por comprador (limite × comprado no mês × saldo × status).
 *  - Projeção de pagamentos por MÊS × CATEGORIA (parcelas espalhadas) — p/ gráficos.
 *  - Limite mensal de compras pelo CMV (meta% × receita de referência da DRE).
 *
 * Adaptado do prism-vale-sol: a receita de referência vem da DRE do MPF
 * (transações com dreGroup 'Receita Operacional'), não de um DreEntry de ERP.
 */
import { prisma } from '@/lib/prisma'
import { installments, ymKey, ymLabel, monthRange } from '@/lib/compras'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  const [pedidos, compradores, settings, receitaRows] = await Promise.all([
    prisma.purchaseOrder.findMany(),
    prisma.comprador.findMany({ orderBy: { nome: 'asc' } }),
    prisma.purchaseSetting.findMany(),
    prisma.transaction.findMany({
      where: { account: { dreGroup: 'Receita Operacional' } },
      select: { year: true, month: true, amount: true },
    }),
  ])

  const metaCmvPct = settings.find(s => s.key === 'metaCmvPct')?.value ?? 0.70

  // receita de referência = último mês da DRE (Receita Operacional)
  const recByMonth = new Map<string, number>()
  receitaRows.forEach(r => { const k = `${r.year}-${String(r.month).padStart(2, '0')}`; recByMonth.set(k, (recByMonth.get(k) ?? 0) + Math.abs(r.amount)) })
  const recYm = Array.from(recByMonth.keys()).sort().pop() ?? null
  const receitaRef = recYm ? recByMonth.get(recYm)! : 0
  const limiteCmvMensal = receitaRef * metaCmvPct

  // mês de referência = mês corrente (servidor, UTC)
  const now = new Date()
  const curStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const refYm = ymKey(curStart)

  // ── Resumo por comprador (comprado NO MÊS pela data do pedido) ──
  const compradoNoMes = new Map<string, number>()
  pedidos.forEach(p => {
    if (ymKey(p.dataPedido) === refYm) compradoNoMes.set(p.comprador, (compradoNoMes.get(p.comprador) ?? 0) + p.valor)
  })
  const resumoCompradores = compradores.map(c => {
    const comprado = compradoNoMes.get(c.nome) ?? 0
    const saldo = c.limite - comprado
    const util = c.limite > 0 ? comprado / c.limite : 0
    const status = c.limite <= 0 ? '—' : saldo < 0 ? '🔴 Estourado' : util > 0.9 ? '⚠️ Quase no limite' : '✅ OK'
    return { nome: c.nome, setor: c.setor, ativo: c.ativo, limite: c.limite, comprado, saldo, util, status }
  })
  const limiteTotal = compradores.filter(c => c.ativo).reduce((s, c) => s + c.limite, 0)
  const compradoTotalMes = Array.from(compradoNoMes.values()).reduce((s, v) => s + v, 0)
  const cmvAtualPct = receitaRef > 0 ? compradoTotalMes / receitaRef : 0

  // ── Projeção de pagamentos (parcelas espalhadas) por mês × categoria ──
  const catOf = (p: typeof pedidos[number]) => p.categoria || 'Sem categoria'
  // bucket: ym -> categoria -> valor
  const bucket = new Map<string, Map<string, number>>()
  let maxDue = curStart
  pedidos.forEach(p => {
    installments(p).forEach(({ due, amount }) => {
      if (due < curStart) return                          // parcelas já vencidas ficam fora da projeção futura
      if (due > maxDue) maxDue = due
      const k = ymKey(due), cat = catOf(p)
      if (!bucket.has(k)) bucket.set(k, new Map())
      const cm = bucket.get(k)!
      cm.set(cat, (cm.get(cat) ?? 0) + amount)
    })
  })
  const monthsSpan = (maxDue.getUTCFullYear() - curStart.getUTCFullYear()) * 12 + (maxDue.getUTCMonth() - curStart.getUTCMonth()) + 1
  const horizon = Math.min(24, Math.max(12, monthsSpan))
  const months = monthRange(curStart, horizon)

  const categorias = Array.from(new Set(pedidos.map(catOf))).sort()
  const projecao = months.map(k => {
    const cm = bucket.get(k) ?? new Map<string, number>()
    const row: Record<string, number | string> = { ym: k, mes: ymLabel(k) }
    let total = 0
    categorias.forEach(cat => { const v = cm.get(cat) ?? 0; row[cat] = v; total += v })
    row.total = total
    row.limite = limiteCmvMensal
    return row
  })

  // comprometido total por categoria (no horizonte) — p/ ranking/pizza
  const porCategoria = categorias.map(cat => ({
    categoria: cat,
    total: months.reduce((s, k) => s + (bucket.get(k)?.get(cat) ?? 0), 0),
  })).sort((a, b) => b.total - a.total)

  const comprometidoTotal = porCategoria.reduce((s, c) => s + c.total, 0)

  return NextResponse.json({
    refYm, refLabel: ymLabel(refYm),
    receitaRef: { ym: recYm, value: receitaRef },
    metaCmvPct, limiteCmvMensal,
    limiteTotal, compradoTotalMes, saldoTotal: limiteTotal - compradoTotalMes, cmvAtualPct,
    resumoCompradores,
    categorias, months, projecao, porCategoria, comprometidoTotal,
    nPedidos: pedidos.length,
  })
}
