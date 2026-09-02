/**
 * Dedup de importação OFX em duas camadas (multiconjunto):
 *
 *  1. fitid+data — bancos que MANTÊM o fitid entre exports (a chave inclui a
 *     data porque o Bradesco reutiliza fitids entre períodos distintos).
 *  2. conteúdo (data+valor+descrição) — bancos que REGENERAM o fitid a cada
 *     export (BNB/Itaú/BB): o mesmo lançamento volta com id novo e a camada 1
 *     não o reconhece.
 *
 * Cada registro já existente no banco é um "slot" que absorve NO MÁXIMO uma
 * linha do arquivo (primeiro por fitid, senão por conteúdo). Assim, lotes
 * legítimos (ex.: 26 depósitos de R$ 2.000 no mesmo dia) nunca são
 * confundidos com duplicata: se o banco tem 26 e o arquivo traz 30, entram 4.
 */

export interface DedupRec {
  fitid: string | null
  date: Date
  amount: number
  description: string | null
  createdAt?: Date
}

interface Slot { rec: DedupRec; used: boolean }

export const dateKey = (d: Date) => d.toISOString().slice(0, 10)
export const contentKey = (dateStr: string, amount: number, desc: string) =>
  `${dateStr}|${amount.toFixed(2)}|${desc.trim()}`

export function buildMatcher(existing: DedupRec[]) {
  const byFitid = new Map<string, Slot[]>()
  const byContent = new Map<string, Slot[]>()
  // total por fitid BASE (sem sufixo #n) + data — para calcular o próximo sufixo
  const baseFitidTotal = new Map<string, number>()

  for (const rec of existing) {
    const slot: Slot = { rec, used: false }
    const dk = dateKey(rec.date)
    if (rec.fitid) {
      const fk = `${rec.fitid}|${dk}`
      if (!byFitid.has(fk)) byFitid.set(fk, [])
      byFitid.get(fk)!.push(slot)
      const base = rec.fitid.split('#')[0]
      const bk = `${base}|${dk}`
      baseFitidTotal.set(bk, (baseFitidTotal.get(bk) ?? 0) + 1)
    }
    const ck = contentKey(dk, rec.amount, rec.description ?? '')
    if (!byContent.has(ck)) byContent.set(ck, [])
    byContent.get(ck)!.push(slot)
  }

  return {
    /** Tenta casar uma linha do arquivo com um registro livre do banco. */
    match(fitid: string | null, dateStr: string, amount: number, desc: string): DedupRec | null {
      if (fitid) {
        const slots = byFitid.get(`${fitid}|${dateStr}`)
        const free = slots?.find(s => !s.used)
        if (free) { free.used = true; return free.rec }
      }
      const slots = byContent.get(contentKey(dateStr, amount, desc))
      const free = slots?.find(s => !s.used)
      if (free) { free.used = true; return free.rec }
      return null
    },
    /** Quantos registros o banco JÁ tem com este fitid base nesta data (p/ sufixo #n). */
    baseCount(fitid: string, dateStr: string): number {
      return baseFitidTotal.get(`${fitid.split('#')[0]}|${dateStr}`) ?? 0
    },
  }
}
