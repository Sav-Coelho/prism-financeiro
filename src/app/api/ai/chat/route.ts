import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '@/lib/prisma'
import { calcDRE } from '@/lib/dre'
import { NextRequest, NextResponse } from 'next/server'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json()

    const now = new Date()
    const month = now.getMonth() + 1
    const year = now.getFullYear()

    const [accounts, transactions] = await Promise.all([
      prisma.account.findMany({ orderBy: { code: 'asc' } }),
      prisma.transaction.findMany({
        where: { month, year, accountId: { not: null } },
        include: { account: true },
        take: 100
      })
    ])

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dre = calcDRE(transactions as any, month, year)

    const fmt = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`

    const systemPrompt = `Você é o assistente financeiro do Brave DRE System - Prism.
Responda sempre em português do Brasil de forma clara, objetiva e profissional.

Contexto financeiro atual (${month}/${year}):
- Total de contas no plano de contas: ${accounts.length}
- Receita Bruta: ${fmt(dre.receitaBruta)}
- Receita Líquida: ${fmt(dre.receitaLiquida)}
- Resultado Bruto: ${fmt(dre.resultadoBruto)}
- Resultado Operacional: ${fmt(dre.resultadoOperacional)}
- Resultado Líquido: ${fmt(dre.resultadoLiquido)}

Contas cadastradas: ${accounts.map(a => `${a.code} ${a.name} (${a.type})`).join('; ')}

Você pode responder perguntas sobre DRE, análise de resultados, contas, lançamentos e gestão financeira.`

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: systemPrompt,
      messages: messages.map((m: { role: string; content: string }) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content
      }))
    })

    const content = response.content[0].type === 'text' ? response.content[0].text : ''
    return NextResponse.json({ content })
  } catch (error) {
    console.error('AI chat error:', error)
    return NextResponse.json({ error: 'Erro ao processar mensagem' }, { status: 500 })
  }
}
