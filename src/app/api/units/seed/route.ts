import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

const UNITS_DATA = [
  { name: 'MATRIZ',      banks: ['ITAU MATRIZ', 'BRADESCO MATRIZ', 'BNB MATRIZ', 'BB MATRIZ'] },
  { name: 'CICERO',      banks: ['ITAU CICERO', 'BRADESCO CICERO'] },
  { name: 'CIPO',        banks: ['ITAU CIPO', 'BRADESCO CIPO'] },
  { name: 'NOVA SOURE',  banks: ['ITAU NOVA SOURE', 'CAIXA NOVA SOURE'] },
  { name: 'FERNANDA',    banks: ['ITAU FERNANDA', 'BRADESCO FERNANDA', 'BNB FERNANDA'] },
]

export async function POST() {
  let created = 0

  for (const ud of UNITS_DATA) {
    const unit = await prisma.unit.upsert({
      where: { name: ud.name },
      update: {},
      create: { name: ud.name }
    })
    for (const bankName of ud.banks) {
      const exists = await prisma.bankAccount.findFirst({ where: { name: bankName, unitId: unit.id } })
      if (!exists) {
        await prisma.bankAccount.create({ data: { name: bankName, unitId: unit.id } })
        created++
      }
    }
  }

  return NextResponse.json({ ok: true, created })
}
