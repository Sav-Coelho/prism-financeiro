/**
 * Parser para extrato de cartão de crédito Sicoob (PDF → transações)
 *
 * Formato real extraído pelo pdf-parse:
 *   - Cabeçalho: "Fatura de ABRILVencimento: 03/04/2026" (sem espaço entre mês e Vencimento)
 *   - Transações com data e descrição colados: "06/12AMAZON BR 04/04 SAO PAULO34,29"
 *   - Transações multi-linha: data sozinha "24/06", descrição na próxima linha, cidade depois, valor por último
 *   - Moeda estrangeira: "V.DOL 5,138256,52" (taxa colada ao valor BRL — strip da taxa antes de extrair)
 *   - Seções "GASTOS DE [NOME]" e nomes de portador "SANTOS (0074)" — ignoradas
 *   - Linha "-SALDO ANTERIOR" — ignorada (não começa com DD/MM)
 *   - Ano inferido: se mês da transação > mês da fatura → ano anterior
 *   - Sinal invertido: positivo no extrato → negativo no sistema (despesa)
 */

export interface SicoobTransaction {
  fitid: string
  date: Date
  amount: number
  memo: string
  isBalance: false
}

export interface SicoobParseResult {
  transactions: SicoobTransaction[]
  invoiceMonth: number
  invoiceYear: number
  cardNumber: string
  clientName: string
  errors: string[]
}

// ── Constantes ──────────────────────────────────────────────────────────────

const MONTH_PT: Record<string, number> = {
  JANEIRO: 1, FEVEREIRO: 2, MARCO: 3, MARÇO: 3, ABRIL: 4, MAIO: 5, JUNHO: 6,
  JULHO: 7, AGOSTO: 8, SETEMBRO: 9, OUTUBRO: 10, NOVEMBRO: 11, DEZEMBRO: 12,
  JAN: 1, FEV: 2, MAR: 3, ABR: 4, MAI: 5, JUN: 6,
  JUL: 7, AGO: 8, SET: 9, OUT: 10, NOV: 11, DEZ: 12,
}

// Padrão: valor BRL no final da linha — "1.234,56" ou "-1.234,56"
const AMT_TAIL = /(-?\d{1,3}(?:\.\d{3})*,\d{2})$/

// Início de transação: DD/MM no início da linha (sem espaço obrigatório após a data)
const TX_HEAD = /^(\d{2})\/(\d{2})/

// Remove anotação de câmbio: "V.DOL 5,1382" colada ao valor BRL ("56,52")
// Ex: "V.DOL 5,138256,52" → "56,52" (strip de "V.DOL " + taxa com 4 decimais)
const VDOL_RE = /V\.DOL\s+\d[\d.]*,\d{4}/i

// Linhas que devem ser ignoradas inteiramente (sem valor de transação)
const SKIP_RE = [
  /^MOVIMENTOS$/i,
  /^DEMONSTRATIVO/i,
  /^LIMITES\s*(TOTAIS|DISPON)/i,
  /^ENCARGOS FINANCEIROS/i,
  /^RESUMO$/i,
  /^PERFIL DE CONSUMO/i,
  /^CANAIS DE ATENDIMENTO/i,
  /^SICOOB$/i,
  /^SISTEMA DE COOPERATIVAS/i,
  /^PLATAFORMA DE SERVI/i,
  /^Cliente:/i,
  /^Conta Cart/i,
  /^Fatura de/i,
  /^O pagamento/i,
  /^Total da Fatura/i,
  /^Pagamento M/i,          // Pagamento Mínimo
  /^Limite\b/i,
  /^Rotativo\b/i,
  /^Saque\b/i,
  /^Cr[eé]dito Internacional/i,
  /^D[eé]bitos?\b/i,
  /^Encargos\b/i,
  /^Pagamento\b/i,
  /^Saldo\b/i,
  /^Tipo Estabelecimento/i,
  /^GASTOS DE\b/i,          // seção de gastos de portador adicional
  /^\d{2}\/\d{2}\/\d{4}\s/, // linha de data do cabeçalho (ex: 13/04/2026 EXTRATO...)
  /^EXTRATO DE CART/i,
  /^24 horas/i,
  /^Central de/i,
  /^Regi[oõ]es Metropolitanas/i,
  /^Demais regi/i,
  /^Exterior:/i,
  /^Ouvidoria:/i,
  /^Deficiente/i,
  /^SAC:/i,
  /^Site:/i,
  /^4007/,                  // telefone
  /^0800/,                  // telefone
  /^55 \d{2}/,              // telefone internacional
  // Nome de portador adicional: "SANTOS (0074)" — palavra(s) + "(DDDD)"
  /^[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ][A-ZÁÀÂÃÉÊÍÓÔÕÚÇa-záàâãéêíóôõúç\s]+\(\d{4}\)$/,
]

// Linhas que começam com "-S" sem espaço (SALDO ANTERIOR colado) — ignorar
const SKIP_DASH = /^-\s*\D/

// Linha de pagamento do cartão — ignorar (não é despesa, é liquidação da fatura)
const SKIP_PAYMENT = /PAGAMENTO DEBITO EM CONTA/i

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseBRL(s: string): number {
  const neg = s.trimStart().startsWith('-')
  const abs = s.replace(/^-/, '').replace(/\./g, '').replace(',', '.')
  const v = parseFloat(abs)
  return neg ? -v : v
}

function shouldSkip(line: string): boolean {
  if (SKIP_DASH.test(line)) return true
  if (SKIP_PAYMENT.test(line)) return true
  for (const re of SKIP_RE) {
    if (re.test(line)) return true
  }
  return false
}

function inferYear(txMonth: number, stmtMonth: number, stmtYear: number): number {
  // Se o mês da compra é posterior ao mês de fechamento → compra foi no ano anterior
  return txMonth > stmtMonth ? stmtYear - 1 : stmtYear
}

/**
 * Remove a anotação de câmbio estrangeiro da linha.
 * "US$ 11,00 U$ 11,00 V.DOL 5,138256,52" → "US$ 11,00 U$ 11,00 56,52"
 * A taxa tem 4 casas decimais (ex: 5,1382) e fica colada ao valor BRL (ex: 56,52).
 */
function stripVDOL(line: string): string {
  return line.replace(VDOL_RE, '')
}

function extractHeader(lines: string[]): {
  stmtMonth: number
  stmtYear: number
  cardNumber: string
  clientName: string
} {
  let stmtMonth = new Date().getMonth() + 1
  let stmtYear = new Date().getFullYear()
  let cardNumber = ''
  let clientName = ''

  for (const line of lines) {
    // "Fatura de ABRILVencimento: 03/04/2026" — espaço entre mês e Vencimento pode estar ausente
    const faturaM = line.match(/Fatura de\s+(\w+)\s*Vencimento:\s*\d{2}\/\d{2}\/(\d{4})/i)
    if (faturaM) {
      const key = faturaM[1].toUpperCase().replace(/Ç/g, 'C').replace(/Ã/g, 'A').replace(/Á/g, 'A')
      stmtMonth = MONTH_PT[key] ?? stmtMonth
      stmtYear = parseInt(faturaM[2])
    }
    // "Conta Cartão: 7564406017028"
    const cardM = line.match(/Conta Cart[aã]o:\s*(\d+)/i)
    if (cardM) cardNumber = cardM[1]
    // "Cliente: TIOCHICOSHOP C V A E"
    const clientM = line.match(/^Cliente:\s*(.+)/i)
    if (clientM) clientName = clientM[1].trim()
  }

  return { stmtMonth, stmtYear, cardNumber, clientName }
}

// ── Parser principal ─────────────────────────────────────────────────────────

export function parseSicoobPDF(text: string): SicoobParseResult {
  // Normaliza quebras de linha e espaços múltiplos
  const lines = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map(l => l.replace(/\s+/g, ' ').trim())
    .filter(l => l.length > 0)

  const { stmtMonth, stmtYear, cardNumber, clientName } = extractHeader(lines)

  // Localiza seção MOVIMENTOS
  const movIdx = lines.findIndex(l => /^MOVIMENTOS$/i.test(l))
  if (movIdx < 0) {
    return {
      transactions: [],
      invoiceMonth: stmtMonth,
      invoiceYear: stmtYear,
      cardNumber,
      clientName,
      errors: ['Seção MOVIMENTOS não encontrada. Confirme que o PDF é um extrato Sicoob.'],
    }
  }

  // Localiza TOTAL (fim das transações)
  let totalIdx = lines.findIndex((l, i) => i > movIdx && /^TOTAL\b/i.test(l))
  if (totalIdx < 0) totalIdx = lines.length

  const section = lines.slice(movIdx + 1, totalIdx)

  // ── Montagem de linhas completas ────────────────────────────────────────────
  // Formato real do Sicoob:
  //   - Data+descrição colados na mesma linha: "06/12AMAZON BR SAO PAULO34,29"
  //   - Data sozinha, descrição e valor em linhas separadas:
  //       "24/06" / "BR1*CHINA*LINK*DO*BR SAO" / "PAULO" / "1.000,00"
  // Acumula até encontrar valor BRL no final.

  const complete: Array<{ raw: string; lineIdx: number }> = []
  let pending = ''
  let pendingLineIdx = 0

  section.forEach((rawLine, i) => {
    // Strip da anotação de câmbio antes de qualquer teste
    const line = stripVDOL(rawLine).replace(/\s+/g, ' ').trim()

    if (shouldSkip(line)) {
      pending = ''
      return
    }

    if (TX_HEAD.test(line)) {
      // Nova transação: flush pendente (se completo)
      if (pending && AMT_TAIL.test(pending)) {
        complete.push({ raw: pending, lineIdx: pendingLineIdx })
      }
      pending = line
      pendingLineIdx = i

      // Já completo na mesma linha?
      if (AMT_TAIL.test(line)) {
        complete.push({ raw: pending, lineIdx: pendingLineIdx })
        pending = ''
      }
    } else if (pending) {
      // Linha de continuação (cidade, moeda estrangeira, etc.)
      pending = pending + ' ' + line
      if (AMT_TAIL.test(pending)) {
        complete.push({ raw: pending, lineIdx: pendingLineIdx })
        pending = ''
      }
    }
    // linha sem data e sem pending → cabeçalho/rodapé residual, ignorar
  })

  // Flush final
  if (pending && AMT_TAIL.test(pending)) {
    complete.push({ raw: pending, lineIdx: section.length })
  }

  // ── Parsing de cada linha completa ──────────────────────────────────────────
  const transactions: SicoobTransaction[] = []
  const errors: string[] = []

  complete.forEach(({ raw }, txIdx) => {
    const dateM = raw.match(TX_HEAD)
    if (!dateM) return

    const day = parseInt(dateM[1])
    const month = parseInt(dateM[2])

    const amtM = raw.match(AMT_TAIL)
    if (!amtM) return

    const rawAmt = parseBRL(amtM[1])
    if (isNaN(rawAmt)) {
      errors.push(`Valor inválido: "${amtM[1]}" em "${raw.slice(0, 40)}"`)
      return
    }

    // Extrai descrição: tudo entre "DD/MM" e o valor no final
    // dateM[0].length = 5 (exatamente "DD/MM")
    const afterDate = raw.slice(5)
    const amtEscaped = amtM[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const memo = afterDate
      .replace(new RegExp(amtEscaped + '$'), '')
      .replace(/\s+/g, ' ')
      .trim()

    // Inverte sinal: compras (positivo no extrato) → negativo no sistema (despesa)
    const amount = -rawAmt

    const year = inferYear(month, stmtMonth, stmtYear)
    const date = new Date(year, month - 1, day)

    const dateKey = `${year}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}`
    const amtKey = String(Math.round(Math.abs(rawAmt) * 100)).padStart(10, '0')
    const idxKey = String(txIdx).padStart(4, '0')
    const fitid = `sicoob_${dateKey}_${amtKey}_${idxKey}`

    transactions.push({ fitid, date, amount, memo, isBalance: false })
  })

  return { transactions, invoiceMonth: stmtMonth, invoiceYear: stmtYear, cardNumber, clientName, errors }
}
