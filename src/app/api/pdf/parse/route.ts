import { NextRequest, NextResponse } from 'next/server'
import { parseSicoobPDF } from '@/lib/sicoob-pdf-parser'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) {
      return NextResponse.json({ error: 'Nenhum arquivo enviado' }, { status: 400 })
    }

    const ext = file.name.split('.').pop()?.toLowerCase()
    if (ext !== 'pdf') {
      return NextResponse.json({ error: 'Somente arquivos PDF são aceitos neste endpoint' }, { status: 400 })
    }

    // pdf-parse/lib/pdf-parse.js evita o bug do index.js que tenta carregar
    // arquivos de teste e falha em ambientes de produção (Vercel, etc.)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse/lib/pdf-parse.js')

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    let pdfText: string
    try {
      const data = await pdfParse(buffer)
      pdfText = data.text as string
    } catch (pdfErr) {
      console.error('pdf-parse error:', pdfErr)
      return NextResponse.json(
        { error: 'Não foi possível ler o PDF. Verifique se o arquivo não está protegido por senha.' },
        { status: 422 }
      )
    }

    const result = parseSicoobPDF(pdfText)

    if (result.transactions.length === 0) {
      const errMsg = result.errors.length > 0
        ? result.errors[0]
        : 'Nenhuma transação encontrada. Confirme que o PDF é um extrato de cartão Sicoob.'
      // Inclui amostra do texto para diagnóstico
      return NextResponse.json({
        error: errMsg,
        _debug_text: pdfText.slice(0, 4000),
      }, { status: 422 })
    }

    // Converte datas para ISO string (serialização JSON)
    const transactions = result.transactions.map(t => ({
      fitid: t.fitid,
      date: t.date.toISOString(),
      amount: t.amount,
      memo: t.memo,
      alreadyImported: false,
      isBalance: false,
    }))

    return NextResponse.json({
      transactions,
      invoiceMonth: result.invoiceMonth,
      invoiceYear: result.invoiceYear,
      cardNumber: result.cardNumber,
      clientName: result.clientName,
      warnings: result.errors,
    })
  } catch (err) {
    console.error('/api/pdf/parse error:', err)
    return NextResponse.json({ error: 'Erro interno ao processar o PDF' }, { status: 500 })
  }
}
