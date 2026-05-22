import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'

// POST /api/debug/repair — corrige month/year de transações com valor errado (off-by-1)
export async function POST() {
  const all = await prisma.transaction.findMany({
    select: { id: true, date: true, month: true, year: true },
  })

  const toFix = all.filter(tx => {
    const correctMonth = tx.date.getMonth() + 1
    const correctYear  = tx.date.getFullYear()
    return tx.month !== correctMonth || tx.year !== correctYear
  })

  let fixed = 0
  for (const tx of toFix) {
    await prisma.transaction.update({
      where: { id: tx.id },
      data: {
        month: tx.date.getMonth() + 1,
        year:  tx.date.getFullYear(),
      },
    })
    fixed++
  }

  return NextResponse.json({ total: all.length, fixed, sample: toFix.slice(0, 5).map(t => ({
    id: t.id, storedMonth: t.month, storedYear: t.year,
    correctMonth: t.date.getMonth() + 1, correctYear: t.date.getFullYear(),
    date: t.date,
  })) })
}

// GET /api/debug?bankAccountId=X  — diagnóstico de transações por conta bancária
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const bankAccountId = searchParams.get('bankAccountId')
  const fitid = searchParams.get('fitid')

  // Busca por fitid específico
  if (fitid) {
    const txs = await prisma.transaction.findMany({
      where: { fitid },
      select: { id: true, fitid: true, date: true, month: true, year: true, unitId: true, bankAccountId: true, amount: true, createdAt: true },
    })
    return NextResponse.json({ fitid, results: txs })
  }

  // Busca todas as contas bancárias com seus ofxBankId/ofxAcctId
  if (!bankAccountId) {
    const bankAccounts = await prisma.bankAccount.findMany({
      select: { id: true, name: true, unitId: true, ofxBankId: true, ofxAcctId: true, unit: { select: { name: true } } },
      orderBy: { name: 'asc' },
    })
    const counts = await Promise.all(bankAccounts.map(async b => {
      const count = await prisma.transaction.count({ where: { bankAccountId: b.id } })
      const nullUnit = await prisma.transaction.count({ where: { bankAccountId: b.id, unitId: null } })
      return { ...b, transactionCount: count, nullUnitCount: nullUnit }
    }))
    return NextResponse.json(counts)
  }

  const id = parseInt(bankAccountId)
  const bankAccount = await prisma.bankAccount.findUnique({
    where: { id },
    select: { id: true, name: true, unitId: true, ofxBankId: true, ofxAcctId: true },
  })

  const byMonthYear = await prisma.transaction.groupBy({
    by: ['month', 'year', 'unitId'],
    where: { bankAccountId: id },
    _count: true,
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
  })

  const nullUnitCount = await prisma.transaction.count({ where: { bankAccountId: id, unitId: null } })
  const totalCount = await prisma.transaction.count({ where: { bankAccountId: id } })

  return NextResponse.json({
    bankAccount,
    totalCount,
    nullUnitCount,
    byMonthYear,
  })
}
