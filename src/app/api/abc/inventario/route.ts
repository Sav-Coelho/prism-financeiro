import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { readSheetMatrix, findCol, parseNumberBR } from '@/lib/spreadsheet'

export const runtime = 'nodejs'

// Importador de INVENTÁRIO (StockItem com custo). Alimenta a Curva ABC de Estoque
// em R$ e os indicadores de giro/cobertura/GMROI em R$.
// Formato: Código · Produto · [Situação] · Preço de Custo · Qtd. Estoque.
// Cabeçalhos de categoria em texto (ex: "  LANTERNA TRASEIRA", sem "(N itens)").
// Re-upload do mesmo mês/ano/unidade substitui os dados.

const PRODUCT_NAMES = ['produto', 'descrição', 'descricao', 'item', 'mercadoria', 'nome']
const SKU_NAMES = ['código', 'codigo', 'cod', 'sku', 'ref', 'referência', 'referencia']
const COST_NAMES = ['preço de custo', 'preco de custo', 'custo de reposição', 'custo de reposicao', 'custo unitário', 'custo unitario', 'preço de compra', 'preco de compra', 'custo médio', 'custo medio', 'custo']
const QTY_NAMES = ['qtd. estoque', 'qtd estoque', 'quantidade em estoque', 'estoque atual', 'estoque', 'saldo', 'quantidade', 'qtd']

const CATEGORY_ITENS_RE = /^(.+?)\s*\(\s*\d+\s*ite[mn]s?\s*\)\s*$/i

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const month = parseInt(String(formData.get('month') || ''))
  const year = parseInt(String(formData.get('year') || ''))
  const unitRaw = formData.get('unitId')
  const unitId = unitRaw ? parseInt(String(unitRaw)) : null

  if (!file) return NextResponse.json({ error: 'Arquivo não enviado' }, { status: 400 })
  if (!month || !year) return NextResponse.json({ error: 'Mês e ano são obrigatórios' }, { status: 400 })

  let matrix: string[][]
  try {
    matrix = readSheetMatrix(await file.arrayBuffer(), file.name)
  } catch {
    return NextResponse.json({ error: 'Não foi possível ler a planilha' }, { status: 422 })
  }
  if (matrix.length < 2) {
    return NextResponse.json({ error: 'Planilha vazia ou sem dados' }, { status: 422 })
  }

  const headers = matrix[0]
  const cProduct = findCol(headers, PRODUCT_NAMES)
  const cSku = findCol(headers, SKU_NAMES)
  const cCost = findCol(headers, COST_NAMES)
  const cQty = findCol(headers, QTY_NAMES)

  const missing: string[] = []
  if (cProduct < 0) missing.push('produto')
  if (cQty < 0) missing.push('quantidade em estoque')
  if (missing.length > 0) {
    return NextResponse.json({
      error: `Colunas obrigatórias não encontradas: ${missing.join(', ')}. Cabeçalhos: ${headers.join(', ')}`,
    }, { status: 422 })
  }

  const items: { product: string; sku: string | null; category: string | null; quantity: number; unitCost: number; unitId: number | null; month: number; year: number }[] = []
  const errors: string[] = []
  let currentCategory: string | null = null

  for (let i = 1; i < matrix.length; i++) {
    const row = matrix[i]
    const product = (row[cProduct] || '').trim()

    // Cabeçalho de categoria: "Produto" vazio e 1ª coluna com texto (não é código numérico)
    if (!product) {
      const first = (row[0] || '').trim()
      if (!first) continue
      const catM = first.match(CATEGORY_ITENS_RE)
      if (catM) { currentCategory = catM[1].trim(); continue }
      if (!/^\d/.test(first)) { currentCategory = first; continue } // texto que não começa com dígito
      continue
    }

    const quantity = parseNumberBR(row[cQty])
    if (isNaN(quantity) || quantity <= 0) continue // sem estoque → ignora
    const unitCost = cCost >= 0 ? (parseNumberBR(row[cCost]) || 0) : 0

    items.push({
      product,
      sku: cSku >= 0 ? (row[cSku] || '').trim() || null : null,
      category: currentCategory,
      quantity,
      unitCost: isNaN(unitCost) ? 0 : unitCost,
      unitId, month, year,
    })
  }

  if (items.length === 0) {
    return NextResponse.json({ error: errors[0] || 'Nenhum item com estoque encontrado na planilha' }, { status: 422 })
  }

  await prisma.$transaction([
    prisma.stockItem.deleteMany({ where: { month, year, unitId } }),
    prisma.stockItem.createMany({ data: items }),
  ])

  const semCusto = items.filter(i => i.unitCost <= 0).length
  return NextResponse.json({ imported: items.length, semCusto })
}
