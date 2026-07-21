import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { readSheetMatrix, findCol, parseNumberBR, COL_SYNONYMS } from '@/lib/spreadsheet'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const month = searchParams.get('month')
  const year = searchParams.get('year')
  const unitId = searchParams.get('unitId')

  const where: Record<string, unknown> = {}
  if (month) where.month = parseInt(month)
  if (year) where.year = parseInt(year)
  if (unitId) where.unitId = parseInt(unitId)

  const items = await prisma.stockItem.findMany({ where })
  // Ordena por valor de estoque (qtd × custo) decrescente
  items.sort((a, b) => b.quantity * b.unitCost - a.quantity * a.unitCost)
  return NextResponse.json(items)
}

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const monthRaw = formData.get('month')
  const yearRaw = formData.get('year')
  const unitRaw = formData.get('unitId')

  if (!file) return NextResponse.json({ error: 'Arquivo não enviado' }, { status: 400 })
  const month = parseInt(String(monthRaw || ''))
  const year = parseInt(String(yearRaw || ''))
  if (!month || !year) return NextResponse.json({ error: 'Mês e ano são obrigatórios' }, { status: 400 })
  const unitId = unitRaw ? parseInt(String(unitRaw)) : null

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
  const cProduct = findCol(headers, COL_SYNONYMS.product)
  const cQty = findCol(headers, COL_SYNONYMS.quantity)
  const cUnitCost = findCol(headers, COL_SYNONYMS.unitCost)
  const cSku = findCol(headers, COL_SYNONYMS.sku)
  const cCategory = findCol(headers, COL_SYNONYMS.category)

  const missing: string[] = []
  if (cProduct < 0) missing.push('produto')
  if (cQty < 0) missing.push('quantidade')
  if (cUnitCost < 0) missing.push('custo unitário')
  if (missing.length > 0) {
    return NextResponse.json({
      error: `Colunas obrigatórias não encontradas: ${missing.join(', ')}. Cabeçalhos detectados: ${headers.join(', ')}`,
    }, { status: 422 })
  }

  const items: {
    product: string; sku: string | null; category: string | null
    quantity: number; unitCost: number
    unitId: number | null; month: number; year: number
  }[] = []
  const errors: string[] = []

  for (let i = 1; i < matrix.length; i++) {
    const row = matrix[i]
    const product = (row[cProduct] || '').trim()
    if (!product) continue
    const quantity = parseNumberBR(row[cQty])
    const unitCost = parseNumberBR(row[cUnitCost])
    if (isNaN(quantity) || isNaN(unitCost)) {
      errors.push(`Linha ${i + 1}: quantidade/custo inválido`)
      continue
    }
    items.push({
      product,
      sku: cSku >= 0 ? (row[cSku] || null) : null,
      category: cCategory >= 0 ? (row[cCategory] || null) : null,
      quantity,
      unitCost,
      unitId,
      month,
      year,
    })
  }

  if (items.length === 0) {
    return NextResponse.json({
      error: errors[0] || 'Nenhuma linha válida encontrada na planilha',
    }, { status: 422 })
  }

  await prisma.$transaction([
    prisma.stockItem.deleteMany({ where: { month, year, unitId } }),
    prisma.stockItem.createMany({ data: items }),
  ])

  return NextResponse.json({ imported: items.length, warnings: errors })
}
