import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json()
  const account = await prisma.account.update({
    where: { id: parseInt(params.id) },
    data: body
  })
  return NextResponse.json(account)
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  await prisma.account.delete({ where: { id: parseInt(params.id) } })
  return NextResponse.json({ ok: true })
}
