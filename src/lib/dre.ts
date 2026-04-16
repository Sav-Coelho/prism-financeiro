export interface DRELine {
  label: string
  sublabel?: string
  value: number
  highlight?: boolean
  indent?: number
}

export interface DREData {
  month: number
  year: number
  lines: DRELine[]
  receitaBruta: number
  receitaLiquida: number
  resultadoBruto: number
  resultadoOperacional: number
  resultadoLiquido: number
}

export function calcDRE(
  transactions: Array<{ amount: number; account: { type: string; dreGroup: string } | null }>,
  month: number,
  year: number
): DREData {
  const sum = (type: string) =>
    transactions
      .filter(t => t.account?.type === type)
      .reduce((acc, t) => acc + Math.abs(t.amount), 0)

  const receitaBruta = sum('RECEITA')
  const deducoes = sum('DEDUCAO')
  const impostos = sum('IMPOSTO')
  const custos = sum('CUSTO')
  const despesas = sum('DESPESA')

  const receitaLiquida = receitaBruta - deducoes
  const resultadoBruto = receitaLiquida - custos
  const resultadoOperacional = resultadoBruto - despesas
  const resultadoLiquido = resultadoOperacional - impostos

  const lines: DRELine[] = [
    { label: 'Receita Bruta', value: receitaBruta, highlight: false },
    { label: 'Deduções da Receita', sublabel: '(-) devoluções, descontos', value: -deducoes, indent: 1 },
    { label: 'Receita Líquida', value: receitaLiquida, highlight: true },
    { label: 'Custo das Mercadorias / Serviços', sublabel: '(-) CMV / CPV', value: -custos, indent: 1 },
    { label: 'Resultado Bruto', value: resultadoBruto, highlight: true },
    { label: 'Despesas Operacionais', sublabel: '(-) administrativas, comerciais', value: -despesas, indent: 1 },
    { label: 'Resultado Operacional', sublabel: 'EBIT', value: resultadoOperacional, highlight: true },
    { label: 'Impostos sobre o Lucro', sublabel: '(-) IR, CSLL', value: -impostos, indent: 1 },
    { label: 'Resultado Líquido do Exercício', value: resultadoLiquido, highlight: true },
  ]

  return {
    month, year, lines,
    receitaBruta, receitaLiquida, resultadoBruto,
    resultadoOperacional, resultadoLiquido
  }
}

export const MONTH_NAMES = [
  '', 'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'
]
