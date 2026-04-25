export interface OFXTransaction {
  fitid: string
  date: Date
  amount: number
  memo: string
  isBalance: boolean
}

export interface OFXBankInfo {
  bankId: string | null
  acctId: string | null
  acctType: string | null
}

export interface OFXBalance {
  amount: number
  date: Date | null
}

export interface OFXParseResult {
  transactions: OFXTransaction[]
  bankInfo: OFXBankInfo
  ledgerBalance: OFXBalance | null
}

export function parseOFX(content: string): OFXParseResult {
  const text = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  const bankInfo = extractBankInfo(text)
  const ledgerBalance = extractLedgerBalance(text)

  const transactions: OFXTransaction[] = []
  const stmtRegex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi
  let match

  while ((match = stmtRegex.exec(text)) !== null) {
    const block = match[1]

    const fitid = extractTag(block, 'FITID') || `auto_${Date.now()}_${Math.random()}`
    const dateRaw = extractTag(block, 'DTPOSTED') || ''
    const amountRaw = extractTag(block, 'TRNAMT') || '0'
    const memo = extractTag(block, 'MEMO') || extractTag(block, 'NAME') || 'Sem descrição'
    const trntype = extractTag(block, 'TRNTYPE') || ''

    const date = parseOFXDate(dateRaw)
    const amount = parseFloat(amountRaw.replace(',', '.'))

    if (date && !isNaN(amount)) {
      const isBalance = trntype.toUpperCase() === 'BALANCE' || /^saldo\b/i.test(memo.trim())
      transactions.push({ fitid, date, amount, memo, isBalance })
    }
  }

  return { transactions, bankInfo, ledgerBalance }
}

function extractBankInfo(text: string): OFXBankInfo {
  const acctBlock = text.match(/<BANKACCTFROM>([\s\S]*?)<\/BANKACCTFROM>/i)?.[1] ?? ''
  return {
    bankId: extractTag(acctBlock, 'BANKID'),
    acctId: extractTag(acctBlock, 'ACCTID'),
    acctType: extractTag(acctBlock, 'ACCTTYPE'),
  }
}

function extractLedgerBalance(text: string): OFXBalance | null {
  const block = text.match(/<LEDGERBAL>([\s\S]*?)<\/LEDGERBAL>/i)?.[1]
  if (!block) return null
  const amountRaw = extractTag(block, 'BALAMT')
  const dateRaw = extractTag(block, 'DTASOF')
  if (!amountRaw) return null
  const amount = parseFloat(amountRaw.replace(',', '.'))
  if (isNaN(amount)) return null
  return { amount, date: dateRaw ? parseOFXDate(dateRaw) : null }
}

function extractTag(block: string, tag: string): string | null {
  const re = new RegExp(`<${tag}>([^<\\n\\r]+)`, 'i')
  const m = block.match(re)
  return m ? m[1].trim() : null
}

function parseOFXDate(raw: string): Date | null {
  const clean = raw.replace(/\[.*\]/, '').trim()
  if (clean.length < 8) return null
  const y = parseInt(clean.slice(0, 4))
  const mo = parseInt(clean.slice(4, 6)) - 1
  const d = parseInt(clean.slice(6, 8))
  const date = new Date(y, mo, d)
  return isNaN(date.getTime()) ? null : date
}
