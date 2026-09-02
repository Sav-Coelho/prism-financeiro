/**
 * Aplica correções de classificação contábil calculadas offline:
 *  - contas:     [{ id, dreGroup, type? }]  → atualiza o grupo DRE (e o tipo) da conta
 *  - transacoes: [{ id, accountId }]        → move o lançamento para a conta correta
 * Exige { confirm: "RECLASSIFICAR" }. Com { dryRun: true } só devolve o estado
 * ANTERIOR de tudo que seria alterado (usado como backup restaurável).
 */
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface Body {
  confirm?: string
  dryRun?: boolean
  contas?: { id: number; dreGroup: string; type?: string }[]
  transacoes?: { id: number; accountId: number }[]
}

export async function POST(req: NextRequest) {
  try {
    let b: Body = {}
    try { b = await req.json() } catch { /* validado abaixo */ }
    if (b.confirm !== 'RECLASSIFICAR') {
      return NextResponse.json({ error: 'Confirmação ausente: envie { confirm: "RECLASSIFICAR" }' }, { status: 400 })
    }
    const contas = Array.isArray(b.contas) ? b.contas : []
    const transacoes = Array.isArray(b.transacoes) ? b.transacoes : []

    // Estado anterior (backup)
    const contasAntes = contas.length > 0 ? await prisma.account.findMany({
      where: { id: { in: contas.map(c => c.id) } },
      select: { id: true, code: true, name: true, type: true, dreGroup: true },
    }) : []
    const txAntes = transacoes.length > 0 ? await prisma.transaction.findMany({
      where: { id: { in: transacoes.map(t => t.id) } },
      select: { id: true, accountId: true, date: true, amount: true, description: true },
    }) : []

    if (b.dryRun) {
      return NextResponse.json({ dryRun: true, contasAlvo: contas.length, transacoesAlvo: transacoes.length, contasAntes, txAntes })
    }

    let contasAtualizadas = 0
    for (const c of contas) {
      await prisma.account.update({
        where: { id: c.id },
        data: { dreGroup: c.dreGroup, ...(c.type ? { type: c.type } : {}) },
      })
      contasAtualizadas++
    }

    // Agrupa transações por conta de destino para poucos updateMany
    const porDestino = new Map<number, number[]>()
    transacoes.forEach(t => {
      if (!porDestino.has(t.accountId)) porDestino.set(t.accountId, [])
      porDestino.get(t.accountId)!.push(t.id)
    })
    let transacoesMovidas = 0
    for (const [accountId, ids] of Array.from(porDestino.entries())) {
      for (let i = 0; i < ids.length; i += 500) {
        const r = await prisma.transaction.updateMany({
          where: { id: { in: ids.slice(i, i + 500) } },
          data: { accountId },
        })
        transacoesMovidas += r.count
      }
    }

    return NextResponse.json({ dryRun: false, contasAtualizadas, transacoesMovidas, contasAntes, txAntes })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
