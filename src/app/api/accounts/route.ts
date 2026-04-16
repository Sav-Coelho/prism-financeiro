import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  const accounts = await prisma.account.findMany({
    orderBy: { code: 'asc' }
  })
  return NextResponse.json(accounts)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { code, name, type, dreGroup } = body

  if (!code || !name || !type || !dreGroup) {
    return NextResponse.json({ error: 'Campos obrigatórios' }, { status: 400 })
  }

  try {
    const account = await prisma.account.create({
      data: { code, name, type, dreGroup }
    })
    return NextResponse.json(account, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Código já existe' }, { status: 409 })
  }
}
