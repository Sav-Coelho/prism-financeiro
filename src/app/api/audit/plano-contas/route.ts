/**
 * Auditoria READ-ONLY do plano de contas e da alocação dos lançamentos.
 * Devolve todas as contas (código, nome, tipo, grupo DRE, nº e soma de lançamentos)
 * e, por conta, as descrições mais frequentes — insumo para detectar lançamentos
 * alocados na conta errada e contas com grupo DRE incorreto.
 */
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    // ?full=1 → devolve também TODAS as transações classificadas (para análise offline)
    const full = req.nextUrl.searchParams.get('full') === '1'
    const transacoes = full ? await prisma.$queryRaw`
      SELECT t.id::int AS id, t."accountId"::int AS account_id, t.amount,
             t.date::date::text AS data, t.description
      FROM "Transaction" t WHERE t."accountId" IS NOT NULL
      ORDER BY t.id` : undefined
    const contas = await prisma.$queryRaw`
      SELECT a.id::int AS id, a.code, a.name, a.type, a."dreGroup" AS dre_group,
             COUNT(t.id)::int AS lancamentos,
             COALESCE(ROUND(SUM(t.amount)::numeric, 2), 0)::float AS soma
      FROM "Account" a
      LEFT JOIN "Transaction" t ON t."accountId" = a.id
      GROUP BY a.id, a.code, a.name, a.type, a."dreGroup"
      ORDER BY a.code`

    const descricoes = await prisma.$queryRaw`
      SELECT account_id, description, n, soma FROM (
        SELECT t."accountId"::int AS account_id, t.description,
               COUNT(*)::int AS n,
               ROUND(SUM(t.amount)::numeric, 2)::float AS soma,
               ROW_NUMBER() OVER (PARTITION BY t."accountId" ORDER BY COUNT(*) DESC) AS rk
        FROM "Transaction" t
        WHERE t."accountId" IS NOT NULL
        GROUP BY t."accountId", t.description
      ) x WHERE rk <= 60
      ORDER BY account_id, rk`

    const semConta = await prisma.$queryRaw`
      SELECT COUNT(*)::int AS n FROM "Transaction" WHERE "accountId" IS NULL`

    return NextResponse.json({ contas, descricoes, semConta, transacoes })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
