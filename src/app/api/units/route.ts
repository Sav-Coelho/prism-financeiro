import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export async function GET() {
  const units = await prisma.unit.findMany({
    include: { bankAccounts: { orderBy: { name: 'asc' } } },
    orderBy: { name: 'asc' }
  })
  return NextResponse.json(units)
}
