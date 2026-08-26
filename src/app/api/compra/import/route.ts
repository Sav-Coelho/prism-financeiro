/**
 * Persiste um relatório importado na aba "Sugestão de Compra".
 * - Trava de duplicidade por SHA-256 do arquivo: se o MESMO arquivo já foi
 *   importado (em qualquer loja, ativo ou substituído), retorna 409 dizendo quando.
 * - Um import ATIVO por loja: o anterior é desativado e seus SKUs apagados
 *   (o histórico mantém os metadados).
 * Body: { loja, filial, janela, periodo, fileName, fileHash, rows: [cod, nome, estoque|null, q[6], v[6]][] }
 */
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const LOJAS = ['matriz', 'cicero', 'cipo', 'soure', 'fernanda']
const fmtData = (d: Date) => d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

type PackedSku = [string, string, number | null, number[], number[]]

export async function POST(req: NextRequest) {
  let b: { loja?: string; filial?: number | null; janela?: string; periodo?: unknown; fileName?: string; fileHash?: string; rows?: PackedSku[] }
  try { b = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const loja = String(b.loja || '')
  if (!LOJAS.includes(loja)) return NextResponse.json({ error: 'Loja inválida' }, { status: 400 })
  const rows = Array.isArray(b.rows) ? b.rows : []
  if (rows.length === 0) return NextResponse.json({ error: 'Nenhum produto no relatório' }, { status: 400 })
  const fileHash = b.fileHash ? String(b.fileHash) : null

  // Trava de duplicidade: mesmo conteúdo de arquivo já importado antes
  if (fileHash) {
    const dup = await prisma.compraImport.findFirst({
      where: { fileHash }, orderBy: { createdAt: 'desc' },
      select: { loja: true, createdAt: true, active: true, fileName: true },
    })
    if (dup) {
      const lojaNome = dup.loja.charAt(0).toUpperCase() + dup.loja.slice(1)
      const quando = fmtData(dup.createdAt)
      const msg = dup.active
        ? `Este arquivo já é o import ATUAL da loja ${lojaNome} (importado em ${quando}).`
        : `Este arquivo já foi importado em ${quando} (loja ${lojaNome}) e substituído depois. Confira se você não está subindo um relatório antigo.`
      return NextResponse.json({ error: msg, duplicate: true }, { status: 409 })
    }
  }

  // Substitui o import ativo da loja (mantém metadados no histórico, remove os SKUs)
  const antigos = await prisma.compraImport.findMany({ where: { loja, active: true }, select: { id: true } })
  const antigosIds = antigos.map(a => a.id)

  const novo = await prisma.$transaction(async tx => {
    if (antigosIds.length > 0) {
      await tx.compraSku.deleteMany({ where: { importId: { in: antigosIds } } })
      await tx.compraImport.updateMany({ where: { id: { in: antigosIds } }, data: { active: false } })
    }
    const imp = await tx.compraImport.create({
      data: {
        loja,
        filial: b.filial ?? null,
        janela: b.janela ? String(b.janela) : null,
        periodo: (b.periodo ?? undefined) as never,
        fileName: b.fileName ? String(b.fileName).slice(0, 200) : null,
        fileHash,
        produtos: rows.length,
        active: true,
      },
    })
    await tx.compraSku.createMany({
      data: rows.map(r => ({
        importId: imp.id,
        cod: String(r[0]),
        nome: String(r[1] ?? ''),
        estoque: r[2] == null ? null : Number(r[2]),
        q: (Array.isArray(r[3]) ? r[3] : []) as never,
        v: (Array.isArray(r[4]) ? r[4] : []) as never,
      })),
    })
    return imp
  }, { timeout: 30000 })

  return NextResponse.json({ ok: true, importId: novo.id, createdAt: novo.createdAt })
}
