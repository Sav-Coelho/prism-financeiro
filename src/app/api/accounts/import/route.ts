import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'

interface SectionInfo { type: string; dreGroup: string }

// Maps section header names (as they appear in the Excel) → type + dreGroup
const SECTION_MAP: Record<string, SectionInfo> = {
  'Receita Operacional':              { type: 'RECEITA',  dreGroup: 'Receita Operacional' },
  'Deduções sobre a venda':           { type: 'DEDUCAO',  dreGroup: 'Deduções sobre a Venda' },
  'Deduções sobre a Venda':           { type: 'DEDUCAO',  dreGroup: 'Deduções sobre a Venda' },
  'Custo do Produto/Serviço':         { type: 'CUSTO',    dreGroup: 'Custo do Produto/Serviço' },
  'Despesa Variável':                 { type: 'CUSTO',    dreGroup: 'Despesa Variável' },
  'Investimento em Desenv. Empresarial': { type: 'DESPESA', dreGroup: 'Investimentos' },
  'Despesas Administrativas':         { type: 'DESPESA',  dreGroup: 'Despesas Administrativas' },
  'Despesas Financeiras':             { type: 'DESPESA',  dreGroup: 'Despesas Financeiras' },
  'Despesas com Pessoal':             { type: 'DESPESA',  dreGroup: 'Despesas com Pessoal' },
  'Despesas com Marketing':           { type: 'DESPESA',  dreGroup: 'Despesas com Marketing' },
  'Receita Não Operacional':          { type: 'RECEITA',  dreGroup: 'Receita Não Operacional' },
  'Despesas Não Operacionais':        { type: 'DESPESA',  dreGroup: 'Despesas Não Operacionais' },
  'Impostos':                         { type: 'IMPOSTO',  dreGroup: 'Impostos' },
}

// Code prefix per dreGroup (for auto-generation)
const GROUP_PREFIX: Record<string, string> = {
  'Receita Operacional':       '3.1',
  'Deduções sobre a Venda':    '3.2',
  'Custo do Produto/Serviço':  '4.1',
  'Despesa Variável':          '4.2',
  'Despesas Administrativas':  '5.1',
  'Despesas Financeiras':      '5.2',
  'Despesas com Pessoal':      '5.3',
  'Despesas com Marketing':    '5.4',
  'Investimentos':             '6.1',
  'Receita Não Operacional':   '7.1',
  'Despesas Não Operacionais': '7.2',
  'Impostos':                  '8.1',
}

// Rows that are totalization or structural markers — skip them
const SKIP_PATTERNS = [
  /^\(=\)/,
  /^\(-\)/,
  /^\(\+\/-\)/,
  /^DRE\//i,
  /^Categoria de visão/i,
  /^Custo do Produto\/Serviço$/, // only skip as standalone section label if already a sub-section header
]

function shouldSkip(name: string): boolean {
  return SKIP_PATTERNS.some(p => p.test(name.trim()))
}

function isSection(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(SECTION_MAP, name.trim())
}

async function getNextCode(dreGroup: string): Promise<string> {
  const prefix = GROUP_PREFIX[dreGroup] || '9.9'
  const existing = await prisma.account.findMany({
    where: { code: { startsWith: prefix + '.' } },
    select: { code: true }
  })
  if (existing.length === 0) return `${prefix}.01`
  const nums = existing.map(a => {
    const parts = a.code.split('.')
    return parseInt(parts[parts.length - 1]) || 0
  })
  const next = Math.max(...nums) + 1
  return `${prefix}.${String(next).padStart(2, '0')}`
}

function extractRows(buffer: ArrayBuffer, fileName: string): string[] {
  if (fileName.endsWith('.csv')) {
    const text = new TextDecoder('utf-8').decode(buffer).replace(/^\uFEFF/, '')
    return text
      .split(/\r?\n/)
      .map(line => line.split(/[,;]/)[0].replace(/"/g, '').trim())
      .filter(Boolean)
  }
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const data = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 })
  return data
    .map(row => String((row as unknown[])[0] ?? '').trim())
    .filter(Boolean)
}

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'Arquivo não enviado' }, { status: 400 })

  const buffer = await file.arrayBuffer()
  const rows = extractRows(buffer, file.name.toLowerCase())

  let currentSection: SectionInfo | null = null
  let imported = 0
  let updated = 0
  const errors: string[] = []

  for (const raw of rows) {
    const name = raw.trim()
    if (!name || shouldSkip(name)) continue

    if (isSection(name)) {
      currentSection = SECTION_MAP[name]
      continue
    }

    if (!currentSection) continue

    try {
      // Find by name + dreGroup first to avoid duplicates
      const existing = await prisma.account.findFirst({
        where: { name, dreGroup: currentSection.dreGroup }
      })

      if (existing) {
        await prisma.account.update({
          where: { id: existing.id },
          data: { type: currentSection.type, dreGroup: currentSection.dreGroup }
        })
        updated++
      } else {
        const code = await getNextCode(currentSection.dreGroup)
        await prisma.account.create({
          data: { code, name, type: currentSection.type, dreGroup: currentSection.dreGroup }
        })
        imported++
      }
    } catch (e: unknown) {
      errors.push(`"${name}": ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return NextResponse.json({ imported, updated, errors })
}
