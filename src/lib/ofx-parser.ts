export interface OFXTransaction {
  fitid: string
  date: Date
  amount: number
  memo: string
}

export function parseOFX(content: string): OFXTransaction[] {
  const transactions: OFXTransaction[] = []

  // Normaliza quebras de linha
  const text = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  // Extrai blocos <STMTTRN>
  const stmtRegex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi
  let match

  while ((match = stmtRegex.exec(text)) !== null) {
    const block = match[1]

    const fitid = extractTag(block, 'FITID') || `auto_${Date.now()}_${Math.random()}`
    const dateRaw = extractTag(block, 'DTPOSTED') || ''
    const amountRaw = extractTag(block, 'TRNAMT') || '0'
    const memo = extractTag(block, 'MEMO') || extractTag(block, 'NAME') || 'Sem descrição'

    const date = parseOFXDate(dateRaw)
    const amount = parseFloat(amountRaw.replace(',', '.'))

    if (date && !isNaN(amount)) {
      transactions.push({ fitid, date, amount, memo })
    }
  }

  return transactions
}

function extractTag(block: string, tag: string): string | null {
  // Suporta tanto <TAG>valor\n quanto <TAG>valor</TAG>
  const re = new RegExp(`<${tag}>([^<\\n\\r]+)`, 'i')
  const m = block.match(re)
  return m ? m[1].trim() : null
}

function parseOFXDate(raw: string): Date | null {
  // Formatos: 20240315120000 ou 20240315
  const clean = raw.replace(/\[.*\]/, '').trim()
  if (clean.length < 8) return null
  const y = parseInt(clean.slice(0, 4))
  const mo = parseInt(clean.slice(4, 6)) - 1
  const d = parseInt(clean.slice(6, 8))
  const date = new Date(y, mo, d)
  return isNaN(date.getTime()) ? null : date
}
