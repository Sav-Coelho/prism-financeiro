/**
 * Lógica do Controle de Compras (modelo SamFarma adaptado, com parcelas).
 * Um pedido gera N parcelas: a 1ª vence `primeiraDias` após o pedido, as demais
 * a cada `intervaloDias`. A projeção de pagamentos soma as parcelas por mês.
 */
export interface OrderLike {
  dataPedido: Date
  valor: number
  parcelas: number
  primeiraDias: number
  intervaloDias: number
}

export const ymKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
export const ymLabel = (key: string) => { const [y, m] = key.split('-'); return `${MONTHS[+m - 1]}/${y.slice(2)}` }

// datas/valores de cada parcela de um pedido
export function installments(o: OrderLike): { due: Date; amount: number }[] {
  const n = Math.max(1, Math.round(o.parcelas || 1))
  const per = o.valor / n
  const base = o.dataPedido.getTime()
  const out: { due: Date; amount: number }[] = []
  for (let k = 0; k < n; k++) {
    const days = (o.primeiraDias || 0) + k * (o.intervaloDias || 0)
    out.push({ due: new Date(base + days * 86400000), amount: per })
  }
  return out
}

// gera lista de chaves YYYY-MM de `start` por `count` meses
export function monthRange(start: Date, count: number): string[] {
  const keys: string[] = []
  for (let i = 0; i < count; i++) {
    const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1))
    keys.push(ymKey(d))
  }
  return keys
}
