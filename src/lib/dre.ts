export type DRELineType = 'section' | 'group' | 'account' | 'subtotal' | 'breakeven'

export interface DRELine {
  type: DRELineType
  label: string
  sublabel?: string
  value: number
  indent: number
  highlight: boolean
}

export interface DREData {
  month: number
  year: number
  lines: DRELine[]
  receitaBruta: number
  receitaLiquida: number
  margemContribuicao: number
  resultadoBruto: number        // alias margemContribuicao
  resultadoOperacional: number  // lucroOperacional
  lucroAposInvestimentos: number
  lucroAntesImpostos: number
  resultadoLiquido: number
}

interface AccEntry { name: string; code: string; value: number }

export function calcDRE(
  transactions: Array<{ amount: number; account: { type: string; dreGroup: string; name: string; code: string } | null }>,
  month: number,
  year: number
): DREData {
  // Aggregate by dreGroup and individual account
  const byGroup: Record<string, number> = {}
  const byAccount: Record<string, AccEntry[]> = {}

  for (const tx of transactions) {
    if (!tx.account) continue
    const { dreGroup, name, code } = tx.account
    if (dreGroup === 'Transferência entre Contas') continue
    const val = Math.abs(tx.amount)
    byGroup[dreGroup] = (byGroup[dreGroup] || 0) + val
    if (!byAccount[dreGroup]) byAccount[dreGroup] = []
    const ex = byAccount[dreGroup].find(a => a.name === name)
    if (ex) { ex.value += val } else { byAccount[dreGroup].push({ name, code, value: val }) }
  }

  const g = (group: string) => byGroup[group] || 0

  const accts = (group: string, positive: boolean, indent: number): DRELine[] =>
    (byAccount[group] || [])
      .filter(a => a.value > 0)
      .sort((a, b) => a.code.localeCompare(b.code))
      .map(a => ({
        type: 'account' as const,
        label: a.name,
        value: positive ? a.value : -a.value,
        indent,
        highlight: false,
      }))

  // Intermediate totals
  const receitaOp    = g('Receita Operacional')
  const deducoes     = g('Deduções sobre a Venda')
  const receitaLiq   = receitaOp - deducoes

  const custoProd    = g('Custo do Produto/Serviço')
  const despVar      = g('Despesa Variável')
  const custosVar    = custoProd + despVar
  const margem       = receitaLiq - custosVar

  const despAdmin    = g('Despesas Administrativas')
  const despFin      = g('Despesas Financeiras')
  const despPessoal  = g('Despesas com Pessoal')
  const despMkt      = g('Despesas com Marketing')
  const custosFixos  = despAdmin + despFin + despPessoal + despMkt
  const lucroOp      = margem - custosFixos

  const invest       = g('Investimentos')
  const lucroAposInv = lucroOp - invest

  const recNaoOp     = g('Receita Não Operacional')
  const despNaoOp    = g('Despesas Não Operacionais')
  const lucroAntesIR = lucroAposInv + recNaoOp - despNaoOp

  const impostos     = g('Impostos')
  const lucroLiq     = lucroAntesIR - impostos

  // Break-even points (contábil)
  const mcPct = receitaOp > 0 ? margem / receitaOp : 0
  const peo   = mcPct > 0 ? custosFixos / mcPct : 0
  const pei   = mcPct > 0 ? (custosFixos + invest) / mcPct : 0
  const pef   = mcPct > 0 ? (custosFixos + invest + Math.max(0, despNaoOp - recNaoOp)) / mcPct : 0

  const lines: DRELine[] = [
    // ── RECEITAS ──────────────────────────────────────────
    { type: 'group', label: 'Receita Operacional', value: receitaOp, indent: 0, highlight: false },
    ...accts('Receita Operacional', true, 1),

    { type: 'group', label: 'Deduções sobre a Venda', sublabel: '(-) impostos, taxas e tarifas', value: -deducoes, indent: 0, highlight: false },
    ...accts('Deduções sobre a Venda', false, 1),

    { type: 'subtotal', label: '(=) Receita Líquida de Vendas', value: receitaLiq, indent: 0, highlight: true },

    // ── CUSTOS VARIÁVEIS ──────────────────────────────────
    { type: 'section', label: '(-) Custos Variáveis', value: -custosVar, indent: 0, highlight: false },

    { type: 'group', label: 'Custo do Produto/Serviço', value: -custoProd, indent: 1, highlight: false },
    ...accts('Custo do Produto/Serviço', false, 2),

    { type: 'group', label: 'Despesa Variável', value: -despVar, indent: 1, highlight: false },
    ...accts('Despesa Variável', false, 2),

    { type: 'subtotal', label: '(=) Margem de Contribuição', value: margem, indent: 0, highlight: true },
    ...(peo > 0 ? [{ type: 'breakeven' as const, label: '(=) Ponto de Equilíbrio Operacional', sublabel: 'receita mínima para cobrir custos fixos', value: peo, indent: 0, highlight: false }] : []),

    // ── CUSTOS FIXOS ──────────────────────────────────────
    { type: 'section', label: '(-) Custos Fixos', value: -custosFixos, indent: 0, highlight: false },

    { type: 'group', label: 'Despesas Administrativas', value: -despAdmin, indent: 1, highlight: false },
    ...accts('Despesas Administrativas', false, 2),

    { type: 'group', label: 'Despesas Financeiras', value: -despFin, indent: 1, highlight: false },
    ...accts('Despesas Financeiras', false, 2),

    { type: 'group', label: 'Despesas com Pessoal', value: -despPessoal, indent: 1, highlight: false },
    ...accts('Despesas com Pessoal', false, 2),

    { type: 'group', label: 'Despesas com Marketing', value: -despMkt, indent: 1, highlight: false },
    ...accts('Despesas com Marketing', false, 2),

    { type: 'subtotal', label: '(=) Lucro Operacional', sublabel: 'EBIT', value: lucroOp, indent: 0, highlight: true },
    ...(pei > 0 ? [{ type: 'breakeven' as const, label: '(=) Ponto de Equilíbrio de Investimentos', value: pei, indent: 0, highlight: false }] : []),

    // ── INVESTIMENTOS ─────────────────────────────────────
    { type: 'section', label: '(-) Investimentos', value: -invest, indent: 0, highlight: false },
    { type: 'group', label: 'Investimento em Desenv. Empresarial', value: -invest, indent: 1, highlight: false },
    ...accts('Investimentos', false, 2),

    { type: 'subtotal', label: '(=) Lucro após os Investimentos', value: lucroAposInv, indent: 0, highlight: true },
    ...(pef > 0 ? [{ type: 'breakeven' as const, label: '(=) Ponto de Equilíbrio Financeiro', value: pef, indent: 0, highlight: false }] : []),

    // ── NÃO OPERACIONAIS ──────────────────────────────────
    { type: 'section', label: '(+/-) Outras Receitas e Despesas Não Operacionais', value: recNaoOp - despNaoOp, indent: 0, highlight: false },

    { type: 'group', label: 'Receita Não Operacional', value: recNaoOp, indent: 1, highlight: false },
    ...accts('Receita Não Operacional', true, 2),

    { type: 'group', label: 'Despesas Não Operacionais', value: -despNaoOp, indent: 1, highlight: false },
    ...accts('Despesas Não Operacionais', false, 2),

    { type: 'subtotal', label: '(=) Lucro antes dos Impostos', value: lucroAntesIR, indent: 0, highlight: true },

    // ── IMPOSTOS ──────────────────────────────────────────
    { type: 'group', label: 'Impostos', value: -impostos, indent: 0, highlight: false },
    ...accts('Impostos', false, 1),

    { type: 'subtotal', label: '(=) Lucro Líquido', value: lucroLiq, indent: 0, highlight: true },
  ]

  return {
    month, year, lines,
    receitaBruta: receitaOp,
    receitaLiquida: receitaLiq,
    margemContribuicao: margem,
    resultadoBruto: margem,
    resultadoOperacional: lucroOp,
    lucroAposInvestimentos: lucroAposInv,
    lucroAntesImpostos: lucroAntesIR,
    resultadoLiquido: lucroLiq,
  }
}

export const MONTH_NAMES = [
  '', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'
]
