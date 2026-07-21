/**
 * Curva ABC (classificação de Pareto) e indicadores de estoque.
 *
 * Curva ABC: itens ordenados por valor decrescente; classe pela % acumulada.
 *   A = até 80% acumulado · B = até 95% · C = restante.
 *
 * Estoque (cruzando com o CMV da DRE):
 *   Giro       = CMV / Estoque médio (a custo)            → vezes no período
 *   Cobertura  = Estoque médio / (CMV / dias do período)  → dias
 *   GMROI      = Margem Bruta / Estoque médio (a custo)   → R$ de margem por R$ investido
 */

export type ABCClass = 'A' | 'B' | 'C'

export interface ABCItem {
  key: string
  label: string
  value: number
  sublabel?: string
  quantity?: number
}

export interface ABCRow extends ABCItem {
  rank: number
  pct: number       // participação individual (% do total)
  cumPct: number    // participação acumulada
  class: ABCClass
}

export interface ABCSummary {
  total: number
  count: number
  byClass: Record<ABCClass, { count: number; value: number; valuePct: number }>
}

export function calcABC(items: ABCItem[]): { rows: ABCRow[]; summary: ABCSummary } {
  const sorted = items
    .filter(i => i.value > 0)
    .sort((a, b) => b.value - a.value)
  const total = sorted.reduce((s, i) => s + i.value, 0)

  let cum = 0
  const rows: ABCRow[] = sorted.map((it, i) => {
    cum += it.value
    const cumPct = total > 0 ? (cum / total) * 100 : 0
    const cls: ABCClass = cumPct <= 80 ? 'A' : cumPct <= 95 ? 'B' : 'C'
    return {
      ...it,
      rank: i + 1,
      pct: total > 0 ? (it.value / total) * 100 : 0,
      cumPct,
      class: cls,
    }
  })

  const byClass: Record<ABCClass, { count: number; value: number; valuePct: number }> = {
    A: { count: 0, value: 0, valuePct: 0 },
    B: { count: 0, value: 0, valuePct: 0 },
    C: { count: 0, value: 0, valuePct: 0 },
  }
  rows.forEach(r => {
    byClass[r.class].count++
    byClass[r.class].value += r.value
  })
  ;(['A', 'B', 'C'] as ABCClass[]).forEach(c => {
    byClass[c].valuePct = total > 0 ? (byClass[c].value / total) * 100 : 0
  })

  return { rows, summary: { total, count: rows.length, byClass } }
}

export interface StockMetrics {
  estoqueValor: number   // valor do estoque a custo (qtd × custo unitário)
  cmv: number            // custo da mercadoria vendida no período (da DRE)
  margemBruta: number    // receita líquida − CMV (da DRE)
  giro: number | null    // vezes no período
  coberturaDias: number | null
  gmroi: number | null
}

export function calcStockMetrics(
  estoqueValor: number,
  cmv: number,
  margemBruta: number,
  diasPeriodo = 30
): StockMetrics {
  const giro = estoqueValor > 0 ? cmv / estoqueValor : null
  const coberturaDias = cmv > 0 ? (estoqueValor * diasPeriodo) / cmv : null
  const gmroi = estoqueValor > 0 ? margemBruta / estoqueValor : null
  return { estoqueValor, cmv, margemBruta, giro, coberturaDias, gmroi }
}

export const ABC_COLOR: Record<ABCClass, string> = {
  A: '#1a7a4a',
  B: '#d59f07',
  C: '#c0392b',
}
