export interface CSVTransaction {
  fitid: string
  date: Date
  amount: number
  memo: string
  isBalance: false
}

export interface CSVParseResult {
  transactions: CSVTransaction[]
  errors: string[]
}

function detectDelimiter(line: string): string {
  const semi = (line.match(/;/g) || []).length
  const comma = (line.match(/,/g) || []).length
  const tab = (line.match(/\t/g) || []).length
  if (semi >= comma && semi >= tab) return ';'
  if (tab >= comma) return '\t'
  return ','
}

function parseBRLAmount(s: string): number {
  const clean = s.trim().replace(/^-?\s*R?\$\s*/, m => m.startsWith('-') ? '-' : '').trim()
  const neg = clean.startsWith('-')
  const abs = clean.replace(/^-/, '').trim()

  let normalized: string
  const lastComma = abs.lastIndexOf(',')
  const lastDot = abs.lastIndexOf('.')
  if (lastComma > lastDot) {
    // BRL format "1.234,56"
    normalized = abs.replace(/\./g, '').replace(',', '.')
  } else if (lastDot > lastComma) {
    // "1,234.56" or "1234.56"
    normalized = abs.replace(/,/g, '')
  } else {
    // only commas "1234,56"
    normalized = abs.replace(',', '.')
  }

  const val = parseFloat(normalized)
  return neg ? -val : val
}

function parseDate(s: string): Date | null {
  const clean = s.trim()
  // YYYY-MM-DD
  let m = clean.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return new Date(+m[1], +m[2] - 1, +m[3])
  // DD/MM/YYYY
  m = clean.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (m) return new Date(+m[3], +m[2] - 1, +m[1])
  // DD/MM/YY
  m = clean.match(/^(\d{2})\/(\d{2})\/(\d{2})$/)
  if (m) {
    const y = +m[3] + (+m[3] > 50 ? 1900 : 2000)
    return new Date(y, +m[2] - 1, +m[1])
  }
  return null
}

const DATE_NAMES = ['data', 'date', 'dt', 'data lançamento', 'data compra', 'data pagamento', 'data vencimento']
const DESC_NAMES = ['título', 'titulo', 'histórico', 'historico', 'descrição', 'descricao', 'description', 'memo', 'estabelecimento', 'lançamento', 'lancamento', 'name', 'comercio']
const AMT_NAMES = ['valor', 'value', 'amount', 'vlr', 'montante', 'valor (r$)', 'valor r$', 'total']

function findCol(headers: string[], names: string[]): number {
  const lower = headers.map(h => h.toLowerCase().trim())
  for (const n of names) {
    const i = lower.indexOf(n)
    if (i >= 0) return i
  }
  for (const n of names) {
    const i = lower.findIndex(h => h.includes(n))
    if (i >= 0) return i
  }
  return -1
}

function unquote(s: string): string {
  return s.trim().replace(/^["']|["']$/g, '')
}

export function parseCSV(content: string, filename: string, invertSign = true): CSVParseResult {
  const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0)

  if (lines.length < 2) {
    return { transactions: [], errors: ['Arquivo CSV vazio ou sem dados suficientes'] }
  }

  const delim = detectDelimiter(lines[0])
  const headers = lines[0].split(delim).map(unquote)

  const dateCol = findCol(headers, DATE_NAMES)
  const descCol = findCol(headers, DESC_NAMES)
  const amtCol = findCol(headers, AMT_NAMES)

  const missing: string[] = []
  if (dateCol < 0) missing.push('data')
  if (descCol < 0) missing.push('descrição')
  if (amtCol < 0) missing.push('valor')

  if (missing.length > 0) {
    return {
      transactions: [],
      errors: [
        `Colunas não encontradas: ${missing.join(', ')}. ` +
        `Cabeçalhos detectados: ${headers.join(', ')}`,
      ],
    }
  }

  const slug = filename.replace(/[^a-zA-Z0-9]/g, '').slice(0, 16)
  const transactions: CSVTransaction[] = []
  const errors: string[] = []

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(delim).map(unquote)
    const maxCol = Math.max(dateCol, descCol, amtCol)
    if (cols.length <= maxCol) continue

    const date = parseDate(cols[dateCol])
    if (!date) {
      errors.push(`Linha ${i + 1}: data inválida "${cols[dateCol]}"`)
      continue
    }

    const rawAmt = parseBRLAmount(cols[amtCol])
    if (isNaN(rawAmt)) {
      errors.push(`Linha ${i + 1}: valor inválido "${cols[amtCol]}"`)
      continue
    }

    // For credit card: positive amounts are purchases (outflows) — negate them
    const amount = invertSign ? -Math.abs(rawAmt) : rawAmt

    const dateKey = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`
    const amtKey = String(Math.round(Math.abs(rawAmt) * 100)).padStart(10, '0')
    const idx = String(i).padStart(4, '0')
    const fitid = `csv_${slug}_${dateKey}_${amtKey}_${idx}`

    transactions.push({
      fitid,
      date,
      amount,
      memo: cols[descCol] || 'Sem descrição',
      isBalance: false,
    })
  }

  if (transactions.length === 0 && errors.length === 0) {
    errors.push('Nenhuma transação válida encontrada no arquivo')
  }

  return { transactions, errors }
}
