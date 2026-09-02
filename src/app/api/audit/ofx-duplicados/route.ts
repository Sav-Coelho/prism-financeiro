/**
 * Auditoria READ-ONLY de duplicidade nos lançamentos importados por OFX.
 * O unique é (fitid, bankAccountId, date) e o dedup do import usa fitid+data
 * (Bradesco reutiliza FITIDs entre períodos), então duplicatas podem existir por:
 *  1. fitid NULL repetido (o unique do Postgres não cobre NULL)
 *  2. mesmo lançamento com fitids DIFERENTES (banco regenerou o id entre exports)
 *  3. mesmo fitid com DATA deslocada (mesmo valor+descrição em datas distintas)
 *  4. contas bancárias cadastradas em duplicidade (mesmo ofxBankId/ofxAcctId)
 *  5. contrapartes de transferência (_entrada) órfãs
 * Nada é alterado — apenas SELECT.
 */
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
  // 1. fitid NULL: mesma conta, data, valor e descrição repetidos — duplicata quase certa
  const semFitid = await prisma.$queryRaw`
    SELECT t."bankAccountId" AS conta_id, b.name AS banco, t.date::date::text AS data,
           t.amount, t.description, COUNT(*)::int AS n,
           array_agg(t.id ORDER BY t.id) AS ids
    FROM "Transaction" t LEFT JOIN "BankAccount" b ON b.id = t."bankAccountId"
    WHERE t.fitid IS NULL
    GROUP BY 1, 2, 3, 4, 5
    HAVING COUNT(*) > 1
    ORDER BY n DESC, data DESC
    LIMIT 300`

  // 2. fitids DIFERENTES com mesma conta+data+valor+descrição — reimport com id regenerado
  //    (pode haver falso positivo: vendas idênticas no mesmo dia)
  //    Sinal decisivo: grupo legítimo entra todo no MESMO import (createdAt igual);
  //    duplicata por reimport entra em imports DIFERENTES.
  const fitidsDiferentes = await prisma.$queryRaw`
    SELECT t."bankAccountId" AS conta_id, b.name AS banco, t.date::date::text AS data,
           t.amount, t.description, COUNT(*)::int AS n,
           COUNT(DISTINCT t.fitid)::int AS fitids_distintos,
           COUNT(DISTINCT date_trunc('minute', t."createdAt"))::int AS imports_distintos,
           array_agg(DISTINCT to_char(date_trunc('minute', t."createdAt"), 'YYYY-MM-DD HH24:MI')) AS importado_em,
           array_agg(t.id ORDER BY t.id) AS ids,
           array_agg(t.fitid ORDER BY t.id) AS fitids
    FROM "Transaction" t LEFT JOIN "BankAccount" b ON b.id = t."bankAccountId"
    WHERE t.fitid IS NOT NULL AND RIGHT(t.fitid, 8) <> '_entrada'
    GROUP BY 1, 2, 3, 4, 5
    HAVING COUNT(DISTINCT t.fitid) > 1
    ORDER BY imports_distintos DESC, n DESC, data DESC
    LIMIT 300`

  // Totais do bucket acima SEM o LIMIT, separando por nº de imports envolvidos
  const totaisSuspeitos = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS grupos_totais,
           COALESCE(SUM(n), 0)::int AS lancamentos_envolvidos,
           COUNT(*) FILTER (WHERE imports > 1)::int AS grupos_em_imports_distintos,
           COALESCE(SUM(n) FILTER (WHERE imports > 1), 0)::int AS lancamentos_em_imports_distintos
    FROM (
      SELECT COUNT(*)::int AS n,
             COUNT(DISTINCT date_trunc('minute', t."createdAt"))::int AS imports
      FROM "Transaction" t
      WHERE t.fitid IS NOT NULL AND RIGHT(t.fitid, 8) <> '_entrada'
      GROUP BY t."bankAccountId", t.date::date, t.amount, t.description
      HAVING COUNT(DISTINCT t.fitid) > 1
    ) x`

  // 3. MESMO fitid na mesma conta com datas distintas E mesmo valor+descrição
  //    (fitid reutilizado pelo banco é normal quando o lançamento é outro;
  //     valor+descrição iguais em datas próximas indicam reimport deslocado)
  const mesmoFitidDatas = await prisma.$queryRaw`
    SELECT t."bankAccountId" AS conta_id, b.name AS banco, t.fitid, t.amount, t.description,
           COUNT(*)::int AS n,
           array_agg(t.date::date::text ORDER BY t.date) AS datas,
           array_agg(t.id ORDER BY t.date) AS ids,
           (MAX(t.date::date) - MIN(t.date::date))::int AS intervalo_dias
    FROM "Transaction" t LEFT JOIN "BankAccount" b ON b.id = t."bankAccountId"
    WHERE t.fitid IS NOT NULL AND RIGHT(t.fitid, 8) <> '_entrada'
    GROUP BY 1, 2, 3, 4, 5
    HAVING COUNT(*) > 1
    ORDER BY intervalo_dias ASC, n DESC
    LIMIT 300`

  // 4. Contas bancárias em duplicidade (mesmo par OFX)
  const contasDuplicadas = await prisma.$queryRaw`
    SELECT "ofxBankId", "ofxAcctId", COUNT(*)::int AS n,
           array_agg(id) AS ids, array_agg(name) AS nomes
    FROM "BankAccount"
    WHERE "ofxBankId" IS NOT NULL AND "ofxAcctId" IS NOT NULL
    GROUP BY 1, 2
    HAVING COUNT(*) > 1`

  // 5. Contrapartes _entrada cuja transação de origem não existe mais
  const entradasOrfas = await prisma.$queryRaw`
    SELECT t.id, t.date::date::text AS data, t.amount, t.description, t.fitid, b.name AS banco
    FROM "Transaction" t LEFT JOIN "BankAccount" b ON b.id = t."bankAccountId"
    WHERE RIGHT(t.fitid, 8) = '_entrada'
      AND NOT EXISTS (
        SELECT 1 FROM "Transaction" o
        WHERE o.fitid = LEFT(t.fitid, LENGTH(t.fitid) - 8)
      )
    ORDER BY t.date DESC
    LIMIT 100`

  // Estatísticas gerais por conta
  const estatisticas = await prisma.$queryRaw`
    SELECT COALESCE(b.name, '(sem conta)') AS banco, COUNT(t.id)::int AS transacoes,
           COUNT(*) FILTER (WHERE t.fitid IS NULL)::int AS sem_fitid,
           COUNT(*) FILTER (WHERE RIGHT(t.fitid, 8) = '_entrada')::int AS contrapartes,
           MIN(t.date)::date::text AS de, MAX(t.date)::date::text AS ate
    FROM "Transaction" t LEFT JOIN "BankAccount" b ON b.id = t."bankAccountId"
    GROUP BY 1 ORDER BY 2 DESC`

  return NextResponse.json({
    geradoEm: new Date().toISOString(),
    estatisticas,
    duplicatas_sem_fitid: semFitid,
    totais_suspeitos: totaisSuspeitos,
    suspeitos_fitids_diferentes: fitidsDiferentes,
    mesmo_fitid_datas_distintas: mesmoFitidDatas,
    contas_bancarias_duplicadas: contasDuplicadas,
    contrapartes_transferencia_orfas: entradasOrfas,
  })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
