import { prisma } from '@/lib/prisma'
import { tokenize, jaccardSimilarity } from '@/lib/classifier'
import { NextRequest, NextResponse } from 'next/server'

const HISTORY_THRESHOLD = 0.35

export async function POST(req: NextRequest) {
  const { memos } = await req.json() as { memos: { fitid: string; memo: string }[] }

  if (!Array.isArray(memos) || memos.length === 0) {
    return NextResponse.json([])
  }

  // Load historical classified transactions
  const history = await prisma.transaction.findMany({
    where: { accountId: { not: null } },
    select: {
      memo: true,
      accountId: true,
      account: { select: { id: true, name: true, code: true, dreGroup: true } },
    },
    take: 10000,
    orderBy: { createdAt: 'desc' },
  })

  // Deduplicate: for each unique memo, find the most frequently used account
  const memoAccountFreq = new Map<string, Map<number, { account: NonNullable<(typeof history)[0]['account']>; count: number }>>()
  for (const tx of history) {
    if (!tx.account || !tx.memo || tx.account.dreGroup === 'Transferência entre Contas') continue
    const existing = memoAccountFreq.get(tx.memo) ?? new Map()
    const entry = existing.get(tx.accountId!) ?? { account: tx.account, count: 0 }
    entry.count++
    existing.set(tx.accountId!, entry)
    memoAccountFreq.set(tx.memo, existing)
  }

  // Build reference list: unique memo → best account (most frequent)
  const references: { tokens: string[]; account: { id: number; name: string; code: string } }[] = []
  Array.from(memoAccountFreq.entries()).forEach(([memo, accountMap]) => {
    const best = Array.from(accountMap.values()).sort((a, b) => b.count - a.count)[0]
    references.push({ tokens: tokenize(memo), account: { id: best.account.id, name: best.account.name, code: best.account.code } })
  })

  if (references.length === 0) return NextResponse.json([])

  // For each input memo, find the best matching reference
  const suggestions: { fitid: string; accountId: number; accountName: string; accountCode: string; confidence: number }[] = []

  for (const { fitid, memo } of memos) {
    const inputTokens = tokenize(memo)
    let bestScore = 0
    let bestAccount: { id: number; name: string; code: string } | null = null

    for (const ref of references) {
      const score = jaccardSimilarity(inputTokens, ref.tokens)
      if (score > bestScore) {
        bestScore = score
        bestAccount = ref.account
      }
    }

    if (bestScore >= HISTORY_THRESHOLD && bestAccount) {
      suggestions.push({
        fitid,
        accountId: bestAccount.id,
        accountName: bestAccount.name,
        accountCode: bestAccount.code,
        confidence: Math.round(bestScore * 100),
      })
    }
  }

  return NextResponse.json(suggestions)
}
