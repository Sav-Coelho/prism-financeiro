import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json()
  const tx = await prisma.transaction.update({
    where: { id: parseInt(params.id) },
    data: { accountId: body.accountId ? parseInt(body.accountId) : null },
    include: { account: true }
  })
  return NextResponse.json(tx)
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  await prisma.transaction.delete({ where: { id: parseInt(params.id) } })
  return NextResponse.json({ ok: true })
}
