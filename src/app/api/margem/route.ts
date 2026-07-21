import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { readSheetMatrix, findCol, parseNumberBR } from '@/lib/spreadsheet'

export const runtime = 'nodejs'

// Análise de Margem de Contribuição por produto (Opção B):
// a planilha traz Produto · Preço de Venda · Custo de Reposição · Qtd (e opc. SKU/Categoria).
// O rateio de Despesas Administrativas e Financeiras é calculado no cliente a partir
// da DRE do período. Re-upload do mesmo mês/ano/unidade substitui os dados.

const PRODUCT_NAMES = ['produto', 'descrição', 'descricao', 'item', 'mercadoria', 'nome']
const PRICE_NAMES = ['preço de venda', 'preco de venda', 'preço venda', 'preco venda', 'preço unitário', 'preco unitario', 'preço', 'preco', 'valor de venda', 'pv', 'valor unitário', 'valor unitario', 'valor']
const COST_NAMES = ['custo de reposição', 'custo de reposicao', 'custo reposição', 'custo reposicao', 'custo de compra', 'cmv unitário', 'cmv unitario', 'custo unitário', 'custo unitario', 'custo médio', 'custo medio', 'custo']
const QTY_NAMES = ['quantidade vendida', 'qtd vendida', 'quantidade total', 'qtd total', 'qtd. total', 'quantidade', 'qtd', 'qtde', 'volume']
const SKU_NAMES = ['código', 'codigo', 'sku', 'cod', 'ref', 'referência', 'referencia']
const CATEGORY_NAMES = ['categoria', 'grupo', 'família', 'familia', 'linha', 'departamento', 'setor']

const CATEGORY_RE = /^(.+?)\s*\(\s*\d+\s*ite[mn]s?\s*\)\s*$/i

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const month = searchParams.get('month')
  const year = searchParams.get('year')
  const unitId = searchParams.get('unitId')

  const where: Record<string, unknown> = {}
  if (month) where.month = parseInt(month)
  if (year) where.year = parseInt(year)
  if (unitId) where.unitId = parseInt(unitId)

  const products = await prisma.marginProduct.findMany({ where, orderBy: { salePrice: 'desc' } })
  return NextResponse.json(products)
}

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
  const cPrice = findCol(headers, PRICE_NAMES)
  const cCost = findCol(headers, COST_NAMES)
  const cQty = findCol(headers, QTY_NAMES)
  const cSku = findCol(headers, SKU_NAMES)
  const cCategory = findCol(headers, CATEGORY_NAMES)

  const missing: string[] = []
  if (cProduct < 0) missing.push('produto')
  if (cPrice < 0) missing.push('preço de venda')
  if (missing.length > 0) {
    return NextResponse.json({
      error: `Colunas obrigatórias não encontradas: ${missing.join(', ')}. Cabeçalhos: ${headers.join(', ')}`,
    }, { status: 422 })
  }

  const products: {
    product: string; sku: string | null; category: string | null
    salePrice: number; replacementCost: number; quantity: number
    unitId: number | null; month: number; year: number
  }[] = []
  const errors: string[] = []
  let headerCategory: string | null = null

  for (let i = 1; i < matrix.length; i++) {
    const row = matrix[i]
    const product = (row[cProduct] || '').trim()

    // Cabeçalho de categoria embutido (ex: "Baterias  (9 itens)")
    if (!product) {
      const first = (row[0] || '').trim()
      const catM = first.match(CATEGORY_RE)
      if (catM) headerCategory = catM[1].trim()
      continue
    }

    const salePrice = parseNumberBR(row[cPrice])
    if (isNaN(salePrice) || salePrice <= 0) {
      errors.push(`Linha ${i + 1}: preço de venda inválido "${row[cPrice]}"`)
      continue
    }
    const replacementCost = cCost >= 0 ? (parseNumberBR(row[cCost]) || 0) : 0
    const quantity = cQty >= 0 ? (parseNumberBR(row[cQty]) || 0) : 0
    const category = (cCategory >= 0 && (row[cCategory] || '').trim()) ? row[cCategory].trim() : headerCategory

    products.push({
      product,
      sku: cSku >= 0 ? (row[cSku] || '').trim() || null : null,
      category,
      salePrice,
      replacementCost: isNaN(replacementCost) ? 0 : replacementCost,
      quantity: isNaN(quantity) ? 0 : quantity,
      unitId, month, year,
    })
  }

  if (products.length === 0) {
    return NextResponse.json({ error: errors[0] || 'Nenhuma linha de produto válida encontrada' }, { status: 422 })
  }

  await prisma.$transaction([
    prisma.marginProduct.deleteMany({ where: { month, year, unitId } }),
    prisma.marginProduct.createMany({ data: products }),
  ])

  return NextResponse.json({ imported: products.length, warnings: errors })
}
