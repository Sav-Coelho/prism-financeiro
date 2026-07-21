/**
 * Utilitários genéricos de leitura de planilha (xlsx/csv) com detecção
 * tolerante de colunas por sinônimos. Usado pelos importadores de Curva ABC
 * (Vendas e Estoque). O parsing numérico aceita formato BR ("1.234,56") e
 * internacional ("1,234.56" / "1234.56").
 */
import * as XLSX from 'xlsx'

function detectDelimiter(line: string): string {
  const semi = (line.match(/;/g) || []).length
  const comma = (line.match(/,/g) || []).length
  const tab = (line.match(/\t/g) || []).length
  if (semi >= comma && semi >= tab) return ';'
  if (tab >= comma) return '\t'
  return ','
}

/** Lê a primeira aba (ou o CSV) e devolve uma matriz de strings já aparadas. */
export function readSheetMatrix(buffer: ArrayBuffer, fileName: string): string[][] {
  if (fileName.toLowerCase().endsWith('.csv')) {
    const text = new TextDecoder('utf-8').decode(buffer).replace(/^﻿/, '')
    const rows = text.split(/\r?\n/).filter(l => l.trim().length > 0)
    const delim = detectDelimiter(rows[0] || '')
    return rows.map(l => l.split(delim).map(c => c.replace(/^["']|["']$/g, '').trim()))
  }
  const wb = XLSX.read(buffer, { type: 'buffer' })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const data = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: '' })
  return data.map(row => (row as unknown[]).map(c => String(c ?? '').trim()))
}

/** Índice da coluna cujo cabeçalho casa (exato, depois parcial) com algum sinônimo. */
export function findCol(headers: string[], names: string[]): number {
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

/** Converte "1.234,56", "1,234.56", "1234.56", "R$ 10,00" → number (NaN se inválido). */
export function parseNumberBR(s: string): number {
  if (s == null) return NaN
  const clean = String(s).replace(/r\$/i, '').replace(/\s/g, '').trim()
  if (clean === '') return NaN
  const neg = clean.startsWith('-')
  const abs = clean.replace(/^-/, '')
  const lastComma = abs.lastIndexOf(',')
  const lastDot = abs.lastIndexOf('.')
  let normalized: string
  if (lastComma > lastDot) {
    normalized = abs.replace(/\./g, '').replace(',', '.')
  } else if (lastDot > lastComma) {
    normalized = abs.replace(/,/g, '')
  } else {
    normalized = abs.replace(',', '.')
  }
  const v = parseFloat(normalized)
  return neg ? -v : v
}

// Sinônimos de cabeçalho aceitos nos templates de planilha
export const COL_SYNONYMS = {
  product:  ['produto', 'descrição', 'descricao', 'item', 'mercadoria', 'nome', 'produto/serviço', 'produto servico'],
  sku:      ['sku', 'código', 'codigo', 'cod', 'ean', 'referência', 'referencia', 'ref'],
  category: ['categoria', 'grupo', 'família', 'familia', 'departamento', 'setor', 'linha'],
  quantity: ['quantidade', 'qtd', 'qtde', 'qty', 'unidades vendidas', 'volume', 'estoque'],
  revenue:  ['faturamento', 'receita', 'valor', 'total', 'venda', 'vendas', 'valor total', 'faturamento (r$)'],
  cost:     ['custo', 'custo total', 'cmv', 'custo produto', 'custo da venda'],
  unitCost: ['custo unitário', 'custo unitario', 'custo unit', 'preço de custo', 'preco de custo', 'custo médio', 'custo medio', 'preço unitário', 'preco unitario', 'custo'],
  unit:     ['unidade', 'loja', 'filial', 'estabelecimento'],
}
