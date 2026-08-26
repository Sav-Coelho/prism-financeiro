/**
 * Ferramenta de Compra / Reposição por SKU.
 *
 * Porta a lógica validada do handoff (HANDOFF_Ferramenta_Compra_Rede.md) e a
 * configuração do entregável Ferramenta_Compra_Rede.xlsx:
 *  - parseVendas(): lê o relatório "Vendas - Vários Períodos" (formato do ERP),
 *    que NÃO é uma tabela: cada produto ocupa 2–3 linhas e as colunas de mês
 *    estão fora de ordem (jun=col10 … jan=col17, 1-based).
 *  - analyze(): demanda dos últimos 3 meses, estoque ideal, quanto comprar,
 *    confiança e situação por SKU (mesma lógica das fórmulas da planilha).
 *
 * O parsing roda no navegador (usa a lib `xlsx`); o export Excel é gerado no
 * servidor (/api/compra/export) com exceljs, replicando as 7 abas.
 */
import * as XLSX from 'xlsx'

// Colunas 0-based por mês — handoff §3.1: jun=9, mai=10, abr=11, mar=12,
// fev=13, jan=16. Estoque Atual = 8. Código/Nome = 0.
const COL_ESTOQUE = 8
const MES_IDX: Record<string, number> = { jan: 16, fev: 13, mar: 12, abr: 11, mai: 10, jun: 9 }
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun'] as const

export interface SkuRow {
  cod: string
  nome: string
  estoque: number | null // null = célula em branco no relatório
  q: number[]            // [jan..jun] — quantidades
  v: number[]            // [jan..jun] — valores (R$)
}

const MES_ABBR = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const MES_FULL = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

// Rótulos de coluna derivados da janela real do relatório (ex.: mar–ago/26).
export interface Periodo {
  p3: string        // ex.: "mar-abr-mai"
  u3: string        // ex.: "jun-jul-ago"
  recente: string   // nome do mês mais recente, ex.: "agosto"
  recenteAbbr: string
  janela: string    // ex.: "mar–ago/26"
}

function extractPeriodo(rows: unknown[][]): Periodo {
  const fb: Periodo = { p3: '1º trimestre', u3: 'trimestre recente', recente: 'mês recente', recenteAbbr: 'recente', janela: '' }
  for (let r = 0; r < Math.min(14, rows.length); r++) {
    const row = rows[r] || []
    const cells = [9, 10, 11, 12, 13, 14].map(c => row[c])
    if (cells.every(x => typeof x === 'string' && /\d{2}\/\d{2}\/\d{2}/.test(x as string))) {
      // colunas 9..14 = mais recente → mais antigo; cronológico = reverso
      const meses = cells.map(x => { const m = String(x).match(/\d{2}\/(\d{2})\/(\d{2})/)!; return { mes: parseInt(m[1], 10), ano: m[2] } }).reverse()
      const ab = meses.map(m => MES_ABBR[m.mes - 1] ?? '?')
      return {
        p3: ab.slice(0, 3).join('-'),
        u3: ab.slice(3, 6).join('-'),
        recente: MES_FULL[meses[5].mes - 1] ?? 'mês recente',
        recenteAbbr: ab[5],
        janela: `${ab[0]}–${ab[5]}/${meses[5].ano}`,
      }
    }
  }
  return fb
}

export interface ParseResult {
  rows: SkuRow[]
  warnings: string[]
  totalProdutos: number
  periodo: Periodo
  filial: number | null // nº da filial detectado no cabeçalho do relatório (null se não achou)
}

// Detecta o nº da filial no cabeçalho. Formatos reais:
//  - "Filial :" | "1 - SS Distribuidora Matriz"   (Matriz, Fernanda)
//  - "2 - 2-SS Atacado e Varejo - Filial Cicero"  (valor direto na célula)
function extractFilial(rows: unknown[][]): number | null {
  for (let r = 0; r < Math.min(10, rows.length); r++) {
    const row = rows[r] || []
    for (let c = 0; c < Math.min(10, row.length); c++) {
      const cell = row[c]
      if (typeof cell !== 'string') continue
      if (/^filial\s*:?\s*$/i.test(cell.trim())) {
        for (let k = c + 1; k < row.length; k++) {
          const v = row[k]
          if (v == null || String(v).trim() === '') continue
          const m = String(v).trim().match(/^(\d{1,3})\s*-/)
          return m ? parseInt(m[1], 10) : null
        }
      }
      const m2 = cell.trim().match(/^(\d{1,3})\s*-\s*.*(atacado|varejo|distribuidora|filial)/i)
      if (m2) return parseInt(m2[1], 10)
    }
  }
  return null
}

const toNum = (x: unknown): number => {
  if (x == null || x === '') return 0
  if (typeof x === 'number') return isNaN(x) ? 0 : x
  const s = String(x).trim().replace(/\s/g, '')
  const lastComma = s.lastIndexOf(','), lastDot = s.lastIndexOf('.')
  let norm = s
  if (lastComma > lastDot) norm = s.replace(/\./g, '').replace(',', '.')
  else if (lastDot > lastComma) norm = s.replace(/,/g, '')
  else norm = s.replace(',', '.')
  const n = parseFloat(norm)
  return isNaN(n) ? 0 : n
}

const isCod = (x: unknown): boolean => {
  if (x == null) return false
  const t = String(x).trim().replace(/\./g, '').replace(/-/g, '')
  return t.length > 0 && /^\d+$/.test(t)
}

const maxNull = (a: number | null, b: number | null): number | null => {
  if (a == null) return b
  if (b == null) return a
  return Math.max(a, b)
}

export function parseVendas(data: ArrayBuffer): ParseResult {
  const wb = XLSX.read(new Uint8Array(data), { type: 'array' })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: true, defval: null })

  const warnings: string[] = []
  const recs: SkuRow[] = []
  let i = 0
  while (i < rows.length) {
    const r = rows[i] || []
    if (r[0] == null || !isCod(r[0])) { i++; continue }

    const cod = String(parseInt(String(r[0]).trim().replace(/\./g, ''), 10))
    const estRaw = r[COL_ESTOQUE]
    const estoque = (estRaw == null || estRaw === '') ? null : toNum(estRaw)
    const v = MESES.map(m => toNum(r[MES_IDX[m]]))
    let nome = ''
    let q = MESES.map(() => 0)

    const next = rows[i + 1]
    if (next && next[0] != null && !isCod(next[0])) {
      nome = String(next[0]).trim()
      q = MESES.map(m => toNum(next[MES_IDX[m]]))
      let k = i + 2
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

  const filtered = recs.filter(r => !/vários períodos|varios periodos/i.test(r.nome))

  const byCod = new Map<string, SkuRow>()
  for (const r of filtered) {
    const ex = byCod.get(r.cod)
    if (ex) {
      for (let k = 0; k < 6; k++) { ex.q[k] += r.q[k]; ex.v[k] += r.v[k] }
      ex.estoque = maxNull(ex.estoque, r.estoque)
      if (!ex.nome && r.nome) ex.nome = r.nome
    } else {
      byCod.set(r.cod, { ...r, q: [...r.q], v: [...r.v] })
    }
  }

  const out = Array.from(byCod.values())
  if (out.length === 0) warnings.push('Nenhum produto reconhecido — confira se o arquivo é o relatório "Vendas - Vários Períodos".')
  const dup = recs.length - filtered.length
  if (dup > 0) warnings.push(`${dup} linha(s) de cabeçalho de quebra de página ignorada(s).`)

  return { rows: out, warnings, totalProdutos: out.length, periodo: extractPeriodo(rows), filial: extractFilial(rows) }
}

// ─────────────────────────── Análise ───────────────────────────

export type Confianca = 'ESTÁVEL' | 'IRREGULAR' | 'ESPORÁDICO' | 'MUITO IRREGULAR'
export type Situacao =
  | 'ESTOQUE NÃO INFORMADO' | 'ERRO DE CADASTRO' | 'PARADO'
  | 'COMPRAR - URGENTE' | 'SUMIU DA PRATELEIRA' | 'COMPRAR' | 'SOBRANDO' | 'OK'

export interface AnalysisRow {
  cod: string
  nome: string
  p3: number                 // média jan-fev-mar (por mês)
  u3: number                 // média abr-mai-jun (por mês) — base do cálculo
  junho: number              // quantidade de junho
  tendencia: number | null   // u3/p3
  saiDia: number             // demanda diária = u3/30.4
  estoque: number | null
  diasEstoque: number | null // estoque / saiDia
  diasAlvo: number
  estoqueIdeal: number
  comprar: number | null     // null quando estoque em branco ou negativo
  faturamento6: number
  confianca: Confianca
  situacao: Situacao
  prioridade: number
}

export interface AnalysisSummary {
  totalSkus: number
  comprarUrgente: number
  sumiu: number
  comprar: number
  parados: number
  sobrando: number
  semEstoque: number
  negativos: number
  totalComprarUn: number
  faturamento6: number
}

const mean = (a: number[]) => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0
const stdSample = (a: number[]) => {
  if (a.length < 2) return 0
  const m = mean(a)
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1))
}

function confiancaDe(nmes: number, cv: number | null): Confianca {
  if (nmes <= 1) return 'ESPORÁDICO'
  if (nmes <= 3) return 'IRREGULAR'
  if (cv == null) return 'IRREGULAR'
  if (cv < 0.6) return 'ESTÁVEL'
  if (cv < 1.0) return 'IRREGULAR'
  return 'MUITO IRREGULAR'
}

const PRIO: Record<Situacao, number> = {
  'COMPRAR - URGENTE': 1, 'SUMIU DA PRATELEIRA': 2, 'COMPRAR': 3, 'OK': 4,
  'ERRO DE CADASTRO': 5, 'SOBRANDO': 6, 'PARADO': 7, 'ESTOQUE NÃO INFORMADO': 8,
}

/** Calcula a análise de reposição. `diasAlvo` = dias de cobertura desejados (global). */
export function analyze(rows: SkuRow[], diasAlvo: number): { rows: AnalysisRow[]; summary: AnalysisSummary } {
  const out: AnalysisRow[] = rows.map(r => {
    const p3 = mean(r.q.slice(0, 3))
    const u3 = mean(r.q.slice(3, 6))
    const junho = r.q[5]
    const tendencia = p3 > 0 ? u3 / p3 : null
    const mean6 = mean(r.q)
    const cv = mean6 > 0 ? stdSample(r.q) / mean6 : null
    const nmes = r.q.filter(x => x > 0).length
    const saiDia = u3 / 30.4
    const estoqueIdeal = saiDia * diasAlvo
    const est = r.estoque
    const comprar = est == null || est < 0 ? null : Math.max(0, estoqueIdeal - est)
    const diasEstoque = est != null && saiDia > 0 ? est / saiDia : null
    const faturamento6 = r.v.reduce((s, x) => s + x, 0)

    let situacao: Situacao
    if (est == null) situacao = 'ESTOQUE NÃO INFORMADO'
    else if (est < 0) situacao = 'ERRO DE CADASTRO'
    else if (saiDia === 0) situacao = 'PARADO'
    else if (est <= 0 && junho > 0) situacao = 'COMPRAR - URGENTE'
    else if (est <= 0) situacao = 'SUMIU DA PRATELEIRA'
    else if ((comprar ?? 0) > 0) situacao = 'COMPRAR'
    else if (diasEstoque != null && diasEstoque > diasAlvo * 3) situacao = 'SOBRANDO'
    else situacao = 'OK'

    return {
      cod: r.cod, nome: r.nome, p3, u3, junho, tendencia, saiDia,
      estoque: est, diasEstoque, diasAlvo, estoqueIdeal, comprar,
      faturamento6, confianca: confiancaDe(nmes, cv), situacao, prioridade: PRIO[situacao],
    }
  })

  out.sort((a, b) => a.prioridade - b.prioridade || b.faturamento6 - a.faturamento6)

  const count = (s: Situacao) => out.filter(r => r.situacao === s).length
  const summary: AnalysisSummary = {
    totalSkus: out.length,
    comprarUrgente: count('COMPRAR - URGENTE'),
    sumiu: count('SUMIU DA PRATELEIRA'),
    comprar: count('COMPRAR'),
    parados: count('PARADO'),
    sobrando: count('SOBRANDO'),
    semEstoque: count('ESTOQUE NÃO INFORMADO'),
    negativos: count('ERRO DE CADASTRO'),
    totalComprarUn: out.reduce((s, r) => s + (r.comprar ?? 0), 0),
    faturamento6: out.reduce((s, r) => s + r.faturamento6, 0),
  }

  return { rows: out, summary }
}

// ── Payload compacto para o export (limite de ~4,5 MB por request na Vercel) ──
// Só o que o Excel precisa como DADO; todo o resto é fórmula recalculada.
// [cod, nome, p3, u3, junho, estoque(null = em branco), confIdx, faturamento6]
export type CompactRow = [string, string, number, number, number, number | null, number, number]
export const CONF_LIST: Confianca[] = ['ESTÁVEL', 'IRREGULAR', 'MUITO IRREGULAR', 'ESPORÁDICO']

const r1c = (n: number) => Math.round(n * 10) / 10
export function packRows(rows: AnalysisRow[]): CompactRow[] {
  return rows.map(r => [
    r.cod, r.nome, r1c(r.p3), r1c(r.u3), r1c(r.junho),
    r.estoque, Math.max(0, CONF_LIST.indexOf(r.confianca)),
    Math.round(r.faturamento6 * 100) / 100,
  ])
}

// Lojas do arquivo-alvo — a ordem/nome define a coluna na aba "Dias de Estoque"
export const LOJAS = [
  { key: 'matriz', tab: 'Matriz', diasCol: 'B', filial: 1, titulo: 'MATRIZ / DISTRIBUIDORA (Pombal) — filial 1', aviso: true },
  { key: 'cicero', tab: 'Cicero', diasCol: 'C', filial: 2, titulo: 'CICERO DANTAS — filial 2', aviso: false },
  { key: 'cipo', tab: 'Cipo', diasCol: 'D', filial: 3, titulo: 'CIPÓ — filial 3', aviso: false },
  { key: 'soure', tab: 'Soure', diasCol: 'E', filial: 4, titulo: 'SOURE — filial 4', aviso: false },
  { key: 'fernanda', tab: 'Fernanda', diasCol: 'F', filial: 10, titulo: 'FERNANDA — filial 10', aviso: true },
] as const

export type LojaKey = typeof LOJAS[number]['key']
