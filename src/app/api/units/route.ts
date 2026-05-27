import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  const units = await prisma.unit.findMany({
    include: { bankAccounts: { orderBy: { name: 'asc' } } },
    orderBy: { name: 'asc' }
  })
  return NextResponse.json(units)
}

// POST /api/units — creates a unit (and optional bank accounts)
// body: { name: string, banks?: string[] }
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { name, banks = [] } = body as { name: string; banks?: string[] }

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Nome da unidade é obrigatório' }, { status: 400 })
  }

  const unit = await prisma.unit.upsert({
    where: { name: name.trim() },
    update: {},
    create: { name: name.trim() },
  })

  let created = 0
  for (const bankName of banks) {
    const exists = await prisma.bankAccount.findFirst({ where: { name: bankName, unitId: unit.id } })
    if (!exists) {
      await prisma.bankAccount.create({ data: { name: bankName, unitId: unit.id } })
      created++
    }
  }

  const result = await prisma.unit.findUnique({
    where: { id: unit.id },
    include: { bankAccounts: { orderBy: { name: 'asc' } } },
  })

  return NextResponse.json({ unit: result, banksCreated: created })
}
