import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'

// PATCH /api/bank-accounts/:id — atualiza campos da conta bancária
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const id = parseInt(params.id)
  const body = await req.json()

  const data: Record<string, unknown> = {}

  // Permite limpar vínculo OFX
  if ('ofxBankId' in body) data.ofxBankId = body.ofxBankId ?? null
  if ('ofxAcctId' in body) data.ofxAcctId = body.ofxAcctId ?? null
  if ('name' in body) data.name = body.name
  if ('initialBalance' in body) data.initialBalance = parseFloat(body.initialBalance)

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Nenhum campo para atualizar' }, { status: 400 })
  }

  const updated = await prisma.bankAccount.update({
    where: { id },
    data,
  })

  return NextResponse.json(updated)
}
