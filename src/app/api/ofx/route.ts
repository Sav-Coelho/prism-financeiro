import { prisma } from '@/lib/prisma'
import { buildMatcher, dateKey } from '@/lib/ofx-dedup'
import { NextRequest, NextResponse } from 'next/server'

interface IncomingTx {
  fitid: string
  date: string
  amount: number
  memo: string
  accountId?: string | number | null
  unitId?: string | number | null
  transferToUnitId?: string | number | null
  transferToBankAccountId?: string | number | null
}

interface SaveBody {
  transactions: IncomingTx[]
  bankAccountId?: string | number | null
  ledgerBalance?: { amount: number; date: string | null } | null
  bankInfo?: { bankId: string | null; acctId: string | null; org: string | null } | null
  balanceTransactions?: { date: string; amount: number }[]
  /** Mês/ano da fatura do cartão — quando presente, todos os lançamentos são contabilizados nesse mês */
  invoiceMonth?: number | null
  invoiceYear?: number | null
}

export async function POST(req: NextRequest) {
  const body = await req.json() as SaveBody
  const { transactions, bankAccountId, ledgerBalance, bankInfo, balanceTransactions, invoiceMonth, invoiceYear } = body

  if (!Array.isArray(transactions) || transactions.length === 0) {
    return NextResponse.json({ error: 'Nenhuma transação selecionada' }, { status: 400 })
  }

  const bankAccId = bankAccountId ? parseInt(String(bankAccountId)) : null

  const data = transactions.map(tx => {
    const d = new Date(tx.date)
    // Para faturas de cartão: contabiliza no mês da fatura, não na data da compra
    const txMonth = invoiceMonth ?? (d.getMonth() + 1)
    const txYear = invoiceYear ?? d.getFullYear()
    return {
      fitid: tx.fitid,
      date: d,
      description: tx.memo,
      memo: tx.memo,
      amount: tx.amount,
      month: txMonth,
      year: txYear,
      accountId: tx.accountId ? parseInt(String(tx.accountId)) : null,
      unitId: tx.unitId ? parseInt(String(tx.unitId)) : null,
      bankAccountId: bankAccId,
      transferToUnitId: tx.transferToUnitId ? parseInt(String(tx.transferToUnitId)) : null,
      transferToBankAccountId: tx.transferToBankAccountId ? parseInt(String(tx.transferToBankAccountId)) : null,
    }
  })

  // Dedup em duas camadas (ver lib/ofx-dedup.ts): fitid+data para bancos que
  // mantêm o fitid, e conteúdo (data+valor+descrição) para bancos que REGENERAM
  // o fitid a cada export (BNB/Itaú/BB) — sem isso, OFX de períodos sobrepostos
  // reimportava tudo. Busca por RANGE de datas para enxergar também fitids novos.
  const minDate = data.reduce((m, d) => (d.date < m ? d.date : m), data[0].date)
  const maxDate = data.reduce((m, d) => (d.date > m ? d.date : m), data[0].date)
  const existing = await prisma.transaction.findMany({
    where: { bankAccountId: bankAccId, date: { gte: minDate, lte: maxDate } },
    select: { fitid: true, date: true, amount: true, description: true },
  })
  const matcher = buildMatcher(existing)

  const toInsert: typeof data = []
  let alreadyImportedCount = 0
  const insertedFitid = new Map<string, number>() // fitid base|data → inserções neste lote
  for (const d of data) {
    const dateStr = dateKey(d.date)
    if (matcher.match(d.fitid || null, dateStr, d.amount, d.description || '')) {
      alreadyImportedCount++
      continue
    }
    if (d.fitid) {
      // Sufixo determinístico #n quando o mesmo fitid+data já existe (Caixa usa o
      // MESMO fitid para todo depósito ATM) — sem isso o unique dropava o 2º
      // depósito legítimo do dia silenciosamente.
      const bk = `${d.fitid}|${dateStr}`
      const jaNoBanco = matcher.baseCount(d.fitid, dateStr)
      const jaNoLote = insertedFitid.get(bk) ?? 0
      insertedFitid.set(bk, jaNoLote + 1)
      const ordem = jaNoBanco + jaNoLote
      if (ordem > 0) d.fitid = `${d.fitid}#${ordem + 1}`
    }
    toInsert.push(d)
  }

  const result = await prisma.transaction.createMany({ data: toInsert, skipDuplicates: true })
  const imported = result.count
  const skipped = alreadyImportedCount + (toInsert.length - imported)

  // Create counterpart entry transactions for transfers
  const transferTxs = transactions.filter(tx => tx.transferToBankAccountId && tx.accountId)
  if (transferTxs.length > 0) {
    const counterparts = transferTxs.map(tx => {
      const d = new Date(tx.date)
      return {
        fitid: tx.fitid + '_entrada',
        date: d,
        description: 'Entrada de Transferência - ' + tx.memo,
        memo: 'Entrada de Transferência - ' + tx.memo,
        amount: Math.abs(tx.amount),
        month: d.getMonth() + 1,
        year: d.getFullYear(),
        accountId: tx.accountId ? parseInt(String(tx.accountId)) : null,
        unitId: tx.transferToUnitId ? parseInt(String(tx.transferToUnitId)) : null,
        bankAccountId: tx.transferToBankAccountId ? parseInt(String(tx.transferToBankAccountId)) : null,
      }
    })
    await prisma.transaction.createMany({ data: counterparts, skipDuplicates: true })
  }

  // Save balance snapshots (daily + ledger) in parallel
  const snapshotOps: Promise<unknown>[] = []

  if (bankAccId && Array.isArray(balanceTransactions)) {
    for (const bt of balanceTransactions) {
      const snapDate = new Date(bt.date)
      snapDate.setHours(0, 0, 0, 0)
      snapshotOps.push(
        prisma.balanceSnapshot.upsert({
          where: { bankAccountId_date: { bankAccountId: bankAccId, date: snapDate } },
          update: { balance: bt.amount },
          create: { bankAccountId: bankAccId, date: snapDate, balance: bt.amount },
        }).catch(() => {})
      )
    }
  }

  if (bankAccId && ledgerBalance?.amount != null && ledgerBalance.date) {
    const snapDate = new Date(ledgerBalance.date)
    snapDate.setHours(0, 0, 0, 0)
    snapshotOps.push(
      prisma.balanceSnapshot.upsert({
        where: { bankAccountId_date: { bankAccountId: bankAccId, date: snapDate } },
        update: { balance: ledgerBalance.amount },
        create: { bankAccountId: bankAccId, date: snapDate, balance: ledgerBalance.amount },
      }).catch(() => {})
    )
  }

  // Link OFX identifiers and save snapshots in parallel.
  // Always move the identifiers to the account the user actually selected —
  // this corrects cases where a previous import linked them to the wrong account.
  const bankIdentifier = bankInfo?.bankId || bankInfo?.org
  const linkOp = bankAccId && bankIdentifier && bankInfo?.acctId
    ? (async () => {
        // Remove the same identifiers from any OTHER account that currently holds them
        await prisma.bankAccount.updateMany({
          where: {
            ofxBankId: bankIdentifier,
            ofxAcctId: bankInfo!.acctId!,
            id: { not: bankAccId },
          },
          data: { ofxBankId: null, ofxAcctId: null },
        }).catch(() => {})
        // Set (or confirm) identifiers on the selected account
        await prisma.bankAccount.update({
          where: { id: bankAccId },
          data: { ofxBankId: bankIdentifier, ofxAcctId: bankInfo!.acctId! },
        }).catch(() => {})
      })()
    : Promise.resolve()

  // Repair: garante que todas as transações desta conta tenham unitId correto.
  // Corrige transações importadas antes desta correção que ficaram com unitId=null.
  const repairOp = bankAccId
    ? prisma.bankAccount.findUnique({ where: { id: bankAccId }, select: { unitId: true } })
        .then(acc => {
          if (acc?.unitId) {
            return prisma.transaction.updateMany({
              where: { bankAccountId: bankAccId, unitId: null },
              data: { unitId: acc.unitId },
            })
          }
        }).catch(() => {})
    : Promise.resolve()

  await Promise.all([...snapshotOps, linkOp, repairOp])

  return NextResponse.json({ imported, skipped })
}
