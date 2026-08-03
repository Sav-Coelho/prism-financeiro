/**
 * Ferramenta de Compra / Reposição por SKU.
 *
 * Porta a lógica validada do handoff (HANDOFF_Ferramenta_Compra_Rede.md):
 *  - parseVendas(): lê o relatório "Vendas - Vários Períodos" (formato do ERP),
 *    que NÃO é uma tabela: cada produto ocupa 2–3 linhas e as colunas de mês
 *    estão fora de ordem (jun=col10 … jan=col17, 1-based).
 *  - analyze(): calcula demanda dos últimos 3 meses, estoque ideal, quanto
 *    comprar, confiança e situação por SKU.
 *
 * Roda no navegador (a página é client-side) — usa a lib `xlsx`.
 */
import * as XLSX from 'xlsx'

// Colunas 0-based (índice no array da linha) por mês — do handoff §3.1:
// jun=9, mai=10, abr=11, mar=12, fev=13, jan=16. Estoque Atual = 8. Código/Nome = 0.
const COL_ESTOQUE = 8
const MES_IDX: Record<string, number> = { jan: 16, fev: 13, mar: 12, abr: 11, mai: 10, jun: 9 }
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun'] as const

export interface SkuRow {
  cod: string
  nome: string
  estoque: number
  q: number[] // [jan, fev, mar, abr, mai, jun] — quantidades
  v: number[] // [jan..jun] — valores (R$)
}

export interface ParseResult {
  rows: SkuRow[]
  warnings: string[]
  totalProdutos: number
}

const toNum = (x: unknown): number => {
  if (x == null || x === '') return 0
  if (typeof x === 'number') return isNaN(x) ? 0 : x
  const s = String(x).trim().replace(/\s/g, '')
  // formato BR "1.234,56" ou internacional "1234.56"
  const lastComma = s.lastIndexOf(','), lastDot = s.lastIndexOf('.')
  let norm = s
  if (lastComma > lastDot) norm = s.replace(/\./g, '').replace(',', '.')
  else if (lastDot > lastComma) norm = s.replace(/,/g, '')
  else norm = s.replace(',', '.')
  const n = parseFloat(norm)
  return isNaN(n) ? 0 : n
}

// "é um código?" — replica isnum() do handoff: strip '.' e '-', resto só dígitos
const isCod = (x: unknown): boolean => {
  if (x == null) return false
  const t = String(x).trim().replace(/\./g, '').replace(/-/g, '')
  return t.length > 0 && /^\d+$/.test(t)
}

export function parseVendas(data: ArrayBuffer): ParseResult {
  const wb = XLSX.read(new Uint8Array(data), { type: 'array' })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: true, defval: null })

  const warnings: string[] = []
  // Máquina de estados: linha A (código) → linha B (nome + qtd) → linhas C (continuação do nome)
  const recs: SkuRow[] = []
  let i = 0
  while (i < rows.length) {
    const r = rows[i] || []
    if (r[0] == null) { i++; continue }
    if (!isCod(r[0])) { i++; continue }

    const cod = String(parseInt(String(r[0]).trim().replace(/\./g, ''), 10))
    const estoque = toNum(r[COL_ESTOQUE])
    const v = MESES.map(m => toNum(r[MES_IDX[m]]))
    let nome = ''
    let q = MESES.map(() => 0)

    const next = rows[i + 1]
    if (next && next[0] != null && !isCod(next[0])) {
      nome = String(next[0]).trim()
      q = MESES.map(m => toNum(next[MES_IDX[m]]))
      let k = i + 2
      // linhas de continuação do nome: col0 preenchida, não-código, colunas de mês vazias
      while (
        k < rows.length && rows[k] && rows[k][0] != null && !isCod(rows[k][0]) &&
        MESES.every(m => rows[k][MES_IDX[m]] == null)
      ) {
        nome += ' ' + String(rows[k][0]).trim()
        k++
      }
      i = k
    } else {
      i++
    }

    recs.push({ cod, nome, estoque, q, v })
  }

  // Remove blocos de cabeçalho de quebra de página (nome contém "Vários Períodos")
  const filtered = recs.filter(r => !/vários períodos|varios periodos/i.test(r.nome))

  // Deduplica por código (soma qtd/valor, max estoque, primeiro nome)
  const byCod = new Map<string, SkuRow>()
  for (const r of filtered) {
    const ex = byCod.get(r.cod)
    if (ex) {
      for (let k = 0; k < 6; k++) { ex.q[k] += r.q[k]; ex.v[k] += r.v[k] }
      ex.estoque = Math.max(ex.estoque, r.estoque)
      if (!ex.nome && r.nome) ex.nome = r.nome
    } else {
      byCod.set(r.cod, { ...r, q: [...r.q], v: [...r.v] })
    }
  }

  const out = Array.from(byCod.values())
  if (out.length === 0) warnings.push('Nenhum produto reconhecido — confira se o arquivo é o relatório "Vendas - Vários Períodos".')
  const dup = recs.length - filtered.length
  if (dup > 0) warnings.push(`${dup} linha(s) de cabeçalho de quebra de página ignorada(s).`)

  return { rows: out, warnings, totalProdutos: out.length }
}

// ─────────────────────────── Análise ───────────────────────────

export type Confianca = 'ESTÁVEL' | 'IRREGULAR' | 'ESPORÁDICO' | 'MUITO IRREGULAR'
export type Situacao = 'ERRO DE CADASTRO' | 'PARADO' | 'COMPRAR - URGENTE' | 'COMPRAR' | 'SOBRANDO' | 'OK'

export interface AnalysisRow {
  cod: string
  nome: string
  p3: number          // média jan-fev-mar
  u3: number          // média abr-mai-jun (base do cálculo)
  tendencia: number | null // u3/p3
  saiDia: number      // demanda diária (u3+transf)/30.4
  estoque: number
  diasEstoque: number | null // estoque / saiDia
  diasAlvo: number
  estoqueIdeal: number
  comprar: number | null     // null quando estoque < 0
  faturamento6: number
  confianca: Confianca
  situacao: Situacao
  prioridade: number
}

export interface AnalysisSummary {
  totalSkus: number
  comprarUrgente: number
  comprar: number
  parados: number
  sobrando: number
  zerados: number          // estoque <= 0 com demanda
  negativos: number        // estoque < 0
  totalComprarUn: number
  faturamento6: number
}

const mean = (a: number[]) => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0
const stdSample = (a: number[]) => {
  if (a.length < 2) return 0
  const m = mean(a)
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1))
}

function confianca(nmes: number, cv: number | null): Confianca {
  if (nmes <= 1) return 'ESPORÁDICO'
  if (nmes <= 3) return 'IRREGULAR'
  if (cv == null) return 'IRREGULAR'
  if (cv < 0.6) return 'ESTÁVEL'
  if (cv < 1.0) return 'IRREGULAR'
  return 'MUITO IRREGULAR'
}

/** Calcula a análise de reposição. `diasAlvo` = dias de cobertura desejados (global). */
export function analyze(rows: SkuRow[], diasAlvo: number): { rows: AnalysisRow[]; summary: AnalysisSummary } {
  const out: AnalysisRow[] = rows.map(r => {
    const p3 = mean(r.q.slice(0, 3))
    const u3 = mean(r.q.slice(3, 6))
    const tendencia = p3 > 0 ? u3 / p3 : null
    const mean6 = mean(r.q)
    const cv = mean6 > 0 ? stdSample(r.q) / mean6 : null
    const nmes = r.q.filter(x => x > 0).length
    const saiDia = u3 / 30.4 // sem transferência (só a Matriz tem, arquivo à parte)
    const estoqueIdeal = saiDia * diasAlvo
    const comprar = r.estoque < 0 ? null : Math.max(0, estoqueIdeal - r.estoque)
    const diasEstoque = saiDia > 0 ? r.estoque / saiDia : null
    const faturamento6 = r.v.reduce((s, x) => s + x, 0)

    let situacao: Situacao, prioridade: number
    if (r.estoque < 0) { situacao = 'ERRO DE CADASTRO'; prioridade = 4 }
    else if (saiDia === 0) { situacao = 'PARADO'; prioridade = 6 }
    else if (r.estoque <= 0) { situacao = 'COMPRAR - URGENTE'; prioridade = 1 }
    else if ((comprar ?? 0) > 0) { situacao = 'COMPRAR'; prioridade = 2 }
    else if (diasEstoque != null && diasEstoque > diasAlvo * 3) { situacao = 'SOBRANDO'; prioridade = 5 }
    else { situacao = 'OK'; prioridade = 3 }

    return {
      cod: r.cod, nome: r.nome, p3, u3, tendencia, saiDia,
      estoque: r.estoque, diasEstoque, diasAlvo, estoqueIdeal, comprar,
      faturamento6, confianca: confianca(nmes, cv), situacao, prioridade,
    }
  })

  // Ordena: prioridade asc, depois faturamento desc (mais ação e mais dinheiro no topo)
  out.sort((a, b) => a.prioridade - b.prioridade || b.faturamento6 - a.faturamento6)

  const summary: AnalysisSummary = {
    totalSkus: out.length,
    comprarUrgente: out.filter(r => r.situacao === 'COMPRAR - URGENTE').length,
    comprar: out.filter(r => r.situacao === 'COMPRAR').length,
    parados: out.filter(r => r.situacao === 'PARADO').length,
    sobrando: out.filter(r => r.situacao === 'SOBRANDO').length,
    zerados: out.filter(r => r.estoque <= 0 && r.saiDia > 0).length,
    negativos: out.filter(r => r.estoque < 0).length,
    totalComprarUn: out.reduce((s, r) => s + (r.comprar ?? 0), 0),
    faturamento6: out.reduce((s, r) => s + r.faturamento6, 0),
  }

  return { rows: out, summary }
}

/** Gera e baixa o relatório em Excel (2 abas: Análise + Resumo). */
export function exportXlsx(rows: AnalysisRow[], summary: AnalysisSummary, diasAlvo: number, fileLabel: string) {
  const r1 = (n: number | null) => n == null ? '' : Math.round(n * 10) / 10
  const r0 = (n: number | null) => n == null ? '' : Math.round(n)

  const header = [
    'Código', 'Produto',
    'Vendeu/mês jan-fev-mar', 'Vendeu/mês abr-mai-jun', 'Tendência',
    'Sai por dia', 'Estoque hoje', 'Dias de estoque',
    'Dias que você quer', 'Estoque ideal (un)', 'COMPRAR (un)',
    'Faturamento 6m (R$)', 'Confiança', 'Situação',
  ]
  const body = rows.map(r => [
    r.cod, r.nome,
    r1(r.p3), r1(r.u3), r.tendencia == null ? '' : r1(r.tendencia),
    r1(r.saiDia), r0(r.estoque), r.diasEstoque == null ? '' : r0(r.diasEstoque),
    r.diasAlvo, r0(r.estoqueIdeal), r.comprar == null ? '' : r0(r.comprar),
    Math.round(r.faturamento6 * 100) / 100, r.confianca, r.situacao,
  ])
  const wsAnalise = XLSX.utils.aoa_to_sheet([header, ...body])

  const resumo = [
    ['Resumo da análise de compra'],
    [''],
    ['Dias de cobertura desejados (global)', diasAlvo],
    ['Total de SKUs', summary.totalSkus],
    ['COMPRAR - URGENTE', summary.comprarUrgente],
    ['COMPRAR', summary.comprar],
    ['Zerados com demanda', summary.zerados],
    ['Parados', summary.parados],
    ['Sobrando', summary.sobrando],
    ['Estoque negativo (erro de cadastro)', summary.negativos],
    ['Total a comprar (unidades)', Math.round(summary.totalComprarUn)],
    ['Faturamento 6 meses (R$)', Math.round(summary.faturamento6 * 100) / 100],
    [''],
    ['O QUE ESTA FERRAMENTA NÃO SABE'],
    ['— Custo unitário e categoria (vêm do Relatório de Entrada, não deste relatório).'],
    ['— Transferências entre lojas (só a Matriz tem o Acompanhamento de Estoque).'],
    ['— Múltiplo de embalagem / lead time por fornecedor.'],
    ['— O estoque é a posição do instante em que o relatório foi gerado.'],
  ]
  const wsResumo = XLSX.utils.aoa_to_sheet(resumo)

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, wsResumo, 'Resumo')
  XLSX.utils.book_append_sheet(wb, wsAnalise, 'Análise')
  const safe = fileLabel.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40) || 'relatorio'
  XLSX.writeFile(wb, `analise_compra_${safe}.xlsx`)
}
