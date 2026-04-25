import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient; seeded: boolean }

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({ log: ['error'] })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

const UNITS_DATA = [
  { name: 'MATRIZ',     banks: ['ITAU MATRIZ', 'BRADESCO MATRIZ', 'BNB MATRIZ', 'BB MATRIZ'] },
  { name: 'CICERO',     banks: ['ITAU CICERO', 'BRADESCO CICERO'] },
  { name: 'CIPO',       banks: ['ITAU CIPO', 'BRADESCO CIPO'] },
  { name: 'NOVA SOURE', banks: ['ITAU NOVA SOURE', 'CAIXA NOVA SOURE'] },
  { name: 'FERNANDA',   banks: ['ITAU FERNANDA', 'BRADESCO FERNANDA', 'BNB FERNANDA'] },
]

async function seedTransferAccount() {
  try {
    await prisma.account.upsert({
      where: { code: '9.9.01' },
      update: {},
      create: {
        code: '9.9.01',
        name: 'Transferência entre Contas',
        type: 'NEUTRO',
        dreGroup: 'Transferência entre Contas',
        active: true,
      },
    })
  } catch {
    // non-fatal
  }
}

async function seedUnits() {
  if (globalForPrisma.seeded) return
  globalForPrisma.seeded = true
  try {
    for (const ud of UNITS_DATA) {
      const unit = await prisma.unit.upsert({
        where: { name: ud.name },
        update: {},
        create: { name: ud.name },
      })
      for (const bankName of ud.banks) {
        const exists = await prisma.bankAccount.findFirst({ where: { name: bankName, unitId: unit.id } })
        if (!exists) {
          await prisma.bankAccount.create({ data: { name: bankName, unitId: unit.id } })
        }
      }
    }
  } catch {
    // seed errors are non-fatal
  }
}

seedUnits()
seedTransferAccount()
