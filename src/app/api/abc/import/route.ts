import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { readSheetMatrix, findCol, parseNumberBR } from '@/lib/spreadsheet'

export const runtime = 'nodejs'

// Importador do "Relatório de Saída de Produtos" (Bling). Uma planilha alimenta
// AMBAS as curvas ABC: "Quantidade Total" → Vendas; "Estoque atual" → Estoque.
// Linhas de cabeçalho de categoria (ex: "Baterias  (9 itens)") definem a categoria
// dos produtos seguintes. Re-upload do mesmo mês/ano/unidade substitui os dados.

const PRODUCT_NAMES = ['produto', 'descrição', 'descricao', 'item', 'mercadoria', 'nome']
const SKU_NAMES = ['código', 'codigo', 'cod', 'sku', 'ref', 'referência', 'referencia']
const SOLD_NAMES = ['quantidade total', 'qtd total', 'qtd. total', 'quantidade', 'qtd vendida', 'total vendido', 'saída', 'saida', 'vendas']

// "Baterias  (9 itens)" / "Outros / Acessórios (5 itens)"
const CATEGORY_RE = /^(.+?)\s*\(\s*\d+\s*ite[mn]s?\s*\)\s*$/i

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
  const cSold = findCol(headers, SOLD_NAMES)

  if (cProduct < 0) {
    return NextResponse.json({
      error: `Coluna "Produto" não encontrada. Cabeçalhos: ${headers.join(', ')}`,
    }, { status: 422 })
  }
  if (cSold < 0) {
    return NextResponse.json({
      error: `Coluna de quantidade vendida não encontrada (esperado "Quantidade Total"). Cabeçalhos: ${headers.join(', ')}`,
    }, { status: 422 })
  }

  // Este importador alimenta apenas VENDAS (Quantidade Total). O ESTOQUE vem do
  // importador de inventário (/api/abc/inventario), que traz custo unitário.
  const sales: { product: string; sku: string | null; category: string | null; quantity: number; revenue: number; cost: number; unitId: number | null; month: number; year: number }[] = []
  let currentCategory: string | null = null
  const warnings: string[] = []

  for (let i = 1; i < matrix.length; i++) {
    const row = matrix[i]
    const product = (row[cProduct] || '').trim()

    // Linha de cabeçalho de categoria: nome do grupo na 1ª coluna, "Produto" vazio
    if (!product) {
      const first = (row[0] || '').trim()
      const catM = first.match(CATEGORY_RE)
      if (catM) currentCategory = catM[1].trim()
      continue
    }

    if (cSold < 0) continue
    const sku = cSku >= 0 ? (row[cSku] || '').trim() || null : null
    const soldQty = parseNumberBR(row[cSold])
    if (!isNaN(soldQty) && soldQty > 0) {
      sales.push({ product, sku, category: currentCategory, quantity: soldQty, revenue: 0, cost: 0, unitId, month, year })
    }
  }

  if (sales.length === 0) {
    return NextResponse.json({ error: 'Nenhuma venda válida encontrada (esperado coluna "Quantidade Total").' }, { status: 422 })
  }

  await prisma.$transaction([
    prisma.salesRecord.deleteMany({ where: { month, year, unitId } }),
    prisma.salesRecord.createMany({ data: sales }),
  ])

  return NextResponse.json({ imported: sales.length, warnings })
}
