/**
 * Gera o Excel "Ferramenta de Compra Rede" (7 abas, fórmulas + formatação),
 * replicando a configuração do arquivo-alvo. Stateless — nada é salvo.
 * Recebe { store, diasAlvo, rows } e devolve o .xlsx para download.
 */
import { NextRequest, NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import type { AnalysisRow } from '@/lib/compra-rede'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NAVY = 'FF1F3864', WHITE = 'FFFFFFFF', YELLOW = 'FFFFFF00', BLUE = 'FF0000FF', RED = 'FFC00000'
const ARIAL = { name: 'Arial', size: 9 } as const

interface StoreMeta { key: string; tab: string; diasCol: string; titulo: string; nome: string; aviso: string | null }
const STORES: StoreMeta[] = [
  { key: 'matriz', tab: 'Matriz', diasCol: 'B', titulo: 'MATRIZ / DISTRIBUIDORA (Pombal) — filial 1', nome: 'Matriz / Distribuidora (filial 1)', aviso: 'OBSERVAÇÃO: a Matriz opera como cross-dock; a maior parte da saída é transferência para as lojas (não capturada aqui).' },
  { key: 'cicero', tab: 'Cicero', diasCol: 'C', titulo: 'CICERO DANTAS — filial 2', nome: 'Cicero Dantas (filial 2)', aviso: null },
  { key: 'cipo', tab: 'Cipo', diasCol: 'D', titulo: 'CIPÓ — filial 3', nome: 'Cipó (filial 3)', aviso: null },
  { key: 'soure', tab: 'Soure', diasCol: 'E', titulo: 'SOURE — filial 4', nome: 'Soure (filial 4)', aviso: null },
  { key: 'fernanda', tab: 'Fernanda', diasCol: 'F', titulo: 'FERNANDA — filial 10', nome: 'Fernanda (filial 10)', aviso: 'ATENÇÃO: 60% dos SKUs desta loja estão sem custo e sem categoria (falta o Relatório de Entrada).' },
]

const CATS: [string, number][] = [
  ['ALIMENTOS', 12], ['BAZAR GERAL', 20], ['BEBIDAS', 10], ['COSMETICOS/ PERFUMARIA', 20],
  ['DIVERSOS', 15], ['DOCES', 12], ['FRUTOS DO MAR', 5], ['HIGIENE', 12], ['ILUMINACAO', 12],
  ['LIMPEZA', 15], ['MERCEARIA DOCE', 12], ['MERCEARIA SALGADA', 12], ['MERCEARIA SECA', 7],
  ['PERECÍVEIS', 5], ['PERFUMARIA', 20], ['SEM CATEGORIA', 10], ['TABACO E FUMO', 12], ['UTENSILIOS', 20],
]

type Cell = ExcelJS.Cell
const solid = (argb: string) => ({ type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb } })
const hdr = (c: Cell, t: string) => { c.value = t; c.font = { ...ARIAL, bold: true, color: { argb: WHITE } }; c.fill = solid(NAVY); c.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' } }
const yel = (c: Cell, v: number) => { c.value = v; c.font = { ...ARIAL, bold: true, color: { argb: BLUE } }; c.fill = solid(YELLOW); c.alignment = { horizontal: 'center' } }
const body = (c: Cell, v: ExcelJS.CellValue) => { c.value = v; c.font = { ...ARIAL } }
const title = (c: Cell, t: string) => { c.value = t; c.font = { ...ARIAL, size: 12, bold: true, color: { argb: NAVY } } }
const warn = (c: Cell, t: string) => { c.value = t; c.font = { ...ARIAL, bold: true, color: { argb: RED } } }
const round1 = (n: number) => Math.round(n * 10) / 10

function situacaoFormula(r: number): string {
  return `IF(J${r}="","ESTOQUE NÃO INFORMADO",IF(J${r}<0,"ERRO DE CADASTRO",IF(I${r}=0,"PARADO",IF(AND(J${r}<=0,F${r}>0),"COMPRAR - URGENTE",IF(J${r}<=0,"SUMIU DA PRATELEIRA",IF(N${r}>0,"COMPRAR",IF(K${r}>L${r}*3,"SOBRANDO","OK")))))))`
}

function buildDiasEstoque(ws: ExcelJS.Worksheet) {
  title(ws.getCell('A1'), 'PASSO 1 — QUANTOS DIAS DE ESTOQUE VOCÊ QUER DE CADA CATEGORIA?')
  warn(ws.getCell('A2'), 'Esta é a ÚNICA aba que você edita. Mude só os números (células amarelas).')
  body(ws.getCell('A3'), 'Os valores abaixo são um ponto de partida — ajuste com o cliente. A quantidade a comprar é consequência.')
  hdr(ws.getCell('A5'), 'Categoria')
  STORES.forEach((s, i) => hdr(ws.getCell(5, i + 2), s.nome))
  CATS.forEach(([cat, dias], i) => {
    const r = 6 + i
    body(ws.getCell(r, 1), cat)
    for (let c = 2; c <= 6; c++) yel(ws.getCell(r, c), dias)
  })
  ws.getColumn(1).width = 26
  for (let c = 2; c <= 6; c++) ws.getColumn(c).width = 20
  ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 5 }]
}

function buildResumo(ws: ExcelJS.Worksheet, ranges: { ds: number; le: number }[], up: { idx: number; faturamento: number; growth: number } | null) {
  title(ws.getCell('A1'), 'RESUMO DA REDE — TODAS AS LOJAS')
  body(ws.getCell('A2'), 'Calculado a partir das abas de cada loja. Nada é digitado aqui.')
  const heads = ['Loja', 'Produtos', 'Faturamento\n1º sem. (R$)', 'Cresceu\njan → jun', 'Estoque hoje\n(R$)', 'FALTA DE VERDADE\n(comprar urgente)', 'Sumiu da\nprateleira', 'Estoque não\ninformado', 'Sobrando +\nParado (R$)', 'Compra sugerida\n(R$)', 'Estoque\nnegativo']
  heads.forEach((t, i) => hdr(ws.getCell(4, i + 1), t))

  STORES.forEach((s, i) => {
    const r = 5 + i
    const { ds, le } = ranges[i]
    const R = `${s.tab}!$R$${ds}:$R$${le}`, J = `${s.tab}!$J$${ds}:$J$${le}`, O = `${s.tab}!$O$${ds}:$O$${le}`
    body(ws.getCell(r, 1), s.nome)
    ws.getCell(r, 2).value = { formula: `COUNTA(${s.tab}!$A$${ds}:$A$${le})` }
    if (up && up.idx === i) { body(ws.getCell(r, 3), Math.round(up.faturamento * 100) / 100); ws.getCell(r, 4).value = up.growth; ws.getCell(r, 4).numFmt = '0.0%' }
    ws.getCell(r, 5).value = { formula: `SUMPRODUCT(MAX(0,1)*IF(N(${J})>0,N(${J})*N(${O}),0))` }
    ws.getCell(r, 6).value = { formula: `COUNTIF(${R},"COMPRAR - URGENTE")` }
    ws.getCell(r, 7).value = { formula: `COUNTIF(${R},"SUMIU DA PRATELEIRA")` }
    ws.getCell(r, 8).value = { formula: `COUNTIF(${R},"ESTOQUE NÃO INFORMADO")` }
    ws.getCell(r, 9).value = { formula: `SUMPRODUCT((${R}="SOBRANDO")+(${R}="PARADO"),IF(N(${J})>0,N(${J}),0)*N(${O}))` }
    ws.getCell(r, 10).value = { formula: `SUM(${s.tab}!$P$${ds}:$P$${le})` }
    ws.getCell(r, 11).value = { formula: `COUNTIF(${R},"ERRO DE CADASTRO")` }
    for (let c = 1; c <= 11; c++) if (!ws.getCell(r, c).font) ws.getCell(r, c).font = { ...ARIAL }
  })
  // REDE
  const rr = 10
  const T = (col: string) => ({ formula: `SUM(${col}5:${col}9)` })
  body(ws.getCell(rr, 1), 'REDE'); ws.getCell(rr, 1).font = { ...ARIAL, bold: true }
  ;['B', 'C', 'E', 'F', 'G', 'H', 'I', 'J', 'K'].forEach(col => { ws.getCell(`${col}${rr}`).value = T(col); ws.getCell(`${col}${rr}`).font = { ...ARIAL, bold: true } })

  body(ws.getCell('A13'), 'A LEITURA DA TABELA:')
  ws.getCell('A13').font = { ...ARIAL, bold: true }
  body(ws.getCell('B14'), '"Comprar urgente" = estoque zerado e ainda vendendo. É a falta que custa venda.')
  body(ws.getCell('B15'), '"Sumiu da prateleira" = estoque zerado e sem venda recente — verificar antes de comprar.')
  body(ws.getCell('B16'), 'Compare "Sobrando + Parado" com "Compra sugerida": o dinheiro da falta já está dentro da loja.')
  warn(ws.getCell('A18'), 'O QUE ESTA FERRAMENTA NÃO SABE')
  body(ws.getCell('B19'), '1. O tamanho da compra em R$ depende do custo unitário (vem do Relatório de Entrada).')
  body(ws.getCell('B20'), '2. O custo não inclui ICMS-ST/frete rateados por item.')
  body(ws.getCell('B21'), '3. Se as filiais transferem entre si, a demanda pode estar subestimada.')
  body(ws.getCell('B22'), '4. Falta o Relatório de Entrada da Fernanda (60% dos SKUs sem custo/categoria).')

  ws.getColumn(1).width = 24
  for (let c = 2; c <= 11; c++) ws.getColumn(c).width = 15
  ws.views = [{ state: 'frozen', ySplit: 4 }]
}

function buildStore(ws: ExcelJS.Worksheet, meta: StoreMeta, rows: AnalysisRow[] | null, diasAlvo: number) {
  const aviso = !!meta.aviso
  const headerRow = aviso ? 10 : 9
  const dataStart = headerRow + 1
  const resHdr = aviso ? 7 : 6
  const resVal = aviso ? 8 : 7

  title(ws.getCell('A1'), meta.titulo)
  body(ws.getCell('A2'), 'Vendas mês a mês (jan–jun) e estoque atual. A lista está ordenada por prioridade.')
  if (aviso) warn(ws.getCell('A3'), meta.aviso!)

  const n = rows?.length ?? 0
  const le = n > 0 ? dataStart + n - 1 : dataStart
  const Rr = `$R$${dataStart}:$R$${le}`, Jr = `$J$${dataStart}:$J$${le}`, Or = `$O$${dataStart}:$O$${le}`
  ws.getCell(resHdr - 1, 1).value = 'RESUMO DESTA LOJA'; ws.getCell(resHdr - 1, 1).font = { ...ARIAL, size: 10, bold: true }
  const miniHdr = ['COMPRAR - URGENTE', 'COMPRAR', 'SUMIU DA PRATELEIRA', 'ESTOQUE NÃO INFORMADO', 'ERRO DE CADASTRO', 'OK', 'SOBRANDO', 'PARADO']
  miniHdr.forEach((t, i) => hdr(ws.getCell(resHdr, i + 1), t))
  hdr(ws.getCell(resHdr, 10), 'Valor em estoque (R$)')
  const sit = ['COMPRAR - URGENTE', 'COMPRAR', 'SUMIU DA PRATELEIRA', 'ESTOQUE NÃO INFORMADO', 'ERRO DE CADASTRO', 'OK', 'SOBRANDO', 'PARADO']
  sit.forEach((s, i) => { ws.getCell(resVal, i + 1).value = { formula: `COUNTIF(${Rr},"${s}")` } })
  ws.getCell(resVal, 10).value = { formula: `SUMPRODUCT(MAX(0,1)*IF(N(${Jr})>0,N(${Jr})*N(${Or}),0))` }

  body(ws.getCell(headerRow - 1, 1), 'A lista está ordenada: o que exige ação e dinheiro vem primeiro.')

  const cols = ['Código', 'Produto', 'Categoria', 'Vendeu por mês\n(jan-fev-mar)', 'Vendeu por mês\n(abr-mai-jun)', 'Vendeu em\njunho', 'Tendência', 'Transferiu p/\nlojas/mês', 'Sai por dia\n(un)', 'Estoque hoje\n(un)', 'Dias de\nestoque', 'Dias que\nvocê quer', 'Estoque ideal\n(un)', 'COMPRAR\n(un)', 'Custo un.\n(R$)', 'Valor da\ncompra (R$)', 'Confiança', 'Situação']
  cols.forEach((t, i) => hdr(ws.getCell(headerRow, i + 1), t))

  ;(rows ?? []).forEach((r, idx) => {
    const rr = dataStart + idx
    ws.getCell(rr, 1).value = r.cod
    ws.getCell(rr, 2).value = r.nome
    // C (categoria) em branco — sem o Relatório de Entrada
    ws.getCell(rr, 4).value = round1(r.p3)
    ws.getCell(rr, 5).value = round1(r.u3)
    ws.getCell(rr, 6).value = round1(r.junho)
    ws.getCell(rr, 7).value = { formula: `IF(D${rr}=0,"",ROUND(E${rr}/D${rr},2))` }
    ws.getCell(rr, 8).value = 0
    ws.getCell(rr, 9).value = { formula: `ROUND((E${rr}+H${rr})/30.4,2)` }
    if (r.estoque != null) ws.getCell(rr, 10).value = r.estoque
    ws.getCell(rr, 11).value = { formula: `IF(OR(J${rr}="",I${rr}<=0),"",IF(J${rr}<=0,0,ROUND(J${rr}/I${rr},0)))` }
    ws.getCell(rr, 12).value = { formula: `IFERROR(INDEX('Dias de Estoque'!$${meta.diasCol}$6:$${meta.diasCol}$23,MATCH(C${rr},'Dias de Estoque'!$A$6:$A$23,0)),${diasAlvo})` }
    ws.getCell(rr, 13).value = { formula: `ROUND(I${rr}*L${rr},0)` }
    ws.getCell(rr, 14).value = { formula: `IF(OR(J${rr}="",J${rr}<0),"",MAX(0,ROUND(M${rr}-J${rr},0)))` }
    // O (custo) em branco
    ws.getCell(rr, 16).value = { formula: `IFERROR(N${rr}*O${rr},"")` }
    ws.getCell(rr, 17).value = r.confianca
    ws.getCell(rr, 18).value = { formula: situacaoFormula(rr) }
    for (let c = 1; c <= 18; c++) { const cell = ws.getCell(rr, c); cell.font = { ...ARIAL } }
    ;[4, 5, 6, 9].forEach(c => ws.getCell(rr, c).numFmt = '#,##0.0')
    ;[10, 13, 14].forEach(c => ws.getCell(rr, c).numFmt = '#,##0')
  })

  ws.getColumn(1).width = 10
  ws.getColumn(2).width = 34
  for (let c = 3; c <= 18; c++) ws.getColumn(c).width = 11
  ws.views = [{ state: 'frozen', xSplit: 2, ySplit: headerRow }]
  ws.autoFilter = { from: { row: headerRow, column: 1 }, to: { row: Math.max(headerRow, le), column: 18 } }
}

export async function POST(req: NextRequest) {
  let body: { store?: string; diasAlvo?: number; rows?: AnalysisRow[] }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }
  const storeKey = String(body.store || '')
  const diasAlvo = Math.max(1, Math.round(Number(body.diasAlvo) || 10))
  const rows = Array.isArray(body.rows) ? body.rows : []
  const upIdx = STORES.findIndex(s => s.key === storeKey)
  if (upIdx < 0) return NextResponse.json({ error: 'Loja inválida' }, { status: 400 })

  const wb = new ExcelJS.Workbook()
  wb.calcProperties.fullCalcOnLoad = true

  buildDiasEstoque(wb.addWorksheet('Dias de Estoque'))
  const resumo = wb.addWorksheet('Resumo')
  const storeSheets = STORES.map(s => wb.addWorksheet(s.tab))

  const ranges = STORES.map((s, i) => {
    const aviso = !!s.aviso
    const ds = (aviso ? 10 : 9) + 1
    const n = i === upIdx ? rows.length : 0
    return { ds, le: n > 0 ? ds + n - 1 : ds }
  })

  STORES.forEach((s, i) => buildStore(storeSheets[i], s, i === upIdx ? rows : null, diasAlvo))

  const totalP3 = rows.reduce((a, r) => a + r.p3, 0)
  const totalU3 = rows.reduce((a, r) => a + r.u3, 0)
  const faturamento = rows.reduce((a, r) => a + r.faturamento6, 0)
  const growth = totalP3 > 0 ? (totalU3 - totalP3) / totalP3 : 0
  buildResumo(resumo, ranges, { idx: upIdx, faturamento, growth })

  const buf = await wb.xlsx.writeBuffer()
  const fname = `Ferramenta_Compra_${STORES[upIdx].tab}.xlsx`
  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${fname}"`,
    },
  })
}
