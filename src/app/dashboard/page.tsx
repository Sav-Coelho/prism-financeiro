'use client'
import { useEffect, useState } from 'react'
import Shell from '@/components/Shell'
import { MONTH_NAMES } from '@/lib/dre'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend, Cell, PieChart, Pie
} from 'recharts'

const fmt = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

const fmtPct = (v: number, base: number) =>
  base > 0 ? `${((v / base) * 100).toFixed(1)}%` : '—'

// Paleta categórica dedicada ao donut de composição (validada p/ CVD; cinza = "Outros")
const DONUT_COLORS = ['#2b6cb0', '#d98c1f', '#2a9d6f', '#c0392b', '#7c5cbf', '#0e7490', '#5a6472']

const now = new Date()

export default function Dashboard() {
  // consolidated = true: soma do ano inteiro | false: mês específico
  const [consolidated, setConsolidated] = useState(true)
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    // month=0 → API retorna DRE consolidado do ano
    const m = consolidated ? 0 : month
    fetch(`/api/dre?month=${m}&year=${year}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [consolidated, month, year])

  const dre = data?.dre
  const yearData = (data?.yearData || []).map((d: any, i: number) => ({
    mes: MONTH_NAMES[i + 1],
    mesIdx: i + 1,
    'Receita Bruta': d.receitaBruta,
    'Margem Contribuição': d.margemContribuicao,
    'Lucro Operacional': d.resultadoOperacional,
    'Resultado Líquido': d.resultadoLiquido,
    // Margens % (0 quando sem receita)
    'Margem Contrib. %': d.receitaBruta > 0 ? +((d.margemContribuicao / d.receitaBruta) * 100).toFixed(1) : null,
    'Margem Operacional %': d.receitaBruta > 0 ? +((d.resultadoOperacional / d.receitaBruta) * 100).toFixed(1) : null,
    'Margem Líquida %': d.receitaBruta > 0 ? +((d.resultadoLiquido / d.receitaBruta) * 100).toFixed(1) : null,
  }))

  const margem = dre?.receitaBruta > 0
    ? ((dre.resultadoLiquido / dre.receitaBruta) * 100).toFixed(1)
    : '0.0'

  // Composição de despesas — grupos negativos da DRE (top 6 + Outros)
  const expenseGroups = ((dre?.lines || []) as any[])
    .filter(l => l.type === 'group' && l.value < 0)
    .map(l => ({ label: l.label, value: Math.abs(l.value) }))
    .filter(g => g.value > 0)
    .sort((a, b) => b.value - a.value)
  const topExpenses = expenseGroups.slice(0, 6)
  const outrosExp = expenseGroups.slice(6).reduce((s, g) => s + g.value, 0)
  const donutData = outrosExp > 0 ? topExpenses.concat([{ label: 'Outros', value: outrosExp }]) : topExpenses
  const totalDespesas = expenseGroups.reduce((s, g) => s + g.value, 0)

  // Custos e ponto de equilíbrio
  const custosVar = dre ? (dre.receitaLiquida - dre.margemContribuicao) : 0
  const custosFixos = dre?.custosFixos ?? 0
  const pef = dre?.pef ?? 0
  const margemSeguranca = dre?.receitaBruta > 0 && pef > 0
    ? ((dre.receitaBruta - pef) / dre.receitaBruta) * 100
    : null
  const breakevenData = dre ? [
    { label: 'Receita', value: dre.receitaBruta },
    { label: 'PEF', value: dre.pef },
    { label: 'PEI', value: dre.pei },
    { label: 'PEO', value: dre.peo },
  ] : []

  const periodoLabel = consolidated
    ? `Consolidado ${year}`
    : `${MONTH_NAMES[month]}/${year}`

  const TOGGLE: React.CSSProperties = {
    display: 'flex', borderRadius: 8, overflow: 'hidden',
    border: '1px solid var(--brave-light)', background: 'var(--brave-light)',
  }
  const TBTN = (active: boolean): React.CSSProperties => ({
    padding: '6px 14px', border: 'none', cursor: 'pointer', fontSize: 12,
    fontFamily: 'var(--font-sub)', fontWeight: active ? 700 : 500,
    background: active ? 'var(--brave-dark)' : 'transparent',
    color: active ? '#fff' : 'var(--brave-gray)',
    transition: 'all 0.15s',
  })

  return (
    <Shell>
      <div className="page-header flex-between">
        <div>
          <h1 className="page-title">Dashboard — {periodoLabel}</h1>
          <p className="page-subtitle">Visão geral do resultado financeiro</p>
        </div>
        <div className="flex gap-2" style={{ alignItems: 'center' }}>
          {/* Toggle Consolidado / Mensal */}
          <div style={TOGGLE}>
            <button style={TBTN(consolidated)} onClick={() => setConsolidated(true)}>
              Consolidado Anual
            </button>
            <button style={TBTN(!consolidated)} onClick={() => setConsolidated(false)}>
              Mês Específico
            </button>
          </div>

          {/* Seletor de mês — só aparece no modo mensal */}
          {!consolidated && (
            <select className="form-select" style={{ width: 120 }} value={month} onChange={e => setMonth(+e.target.value)}>
              {MONTH_NAMES.slice(1).map((m, i) => (
                <option key={i + 1} value={i + 1}>{m}</option>
              ))}
            </select>
          )}

          <select className="form-select" style={{ width: 90 }} value={year} onChange={e => setYear(+e.target.value)}>
            {[2023, 2024, 2025, 2026].map(y => <option key={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--brave-gray)' }}>Carregando...</div>
      ) : !dre || dre.receitaBruta === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📊</div>
          <div style={{ fontFamily: 'var(--font-sub)', fontWeight: 600, fontSize: 15 }}>
            Sem dados para {periodoLabel}
          </div>
          <div style={{ color: 'var(--brave-gray)', fontSize: 13, marginTop: 6 }}>
            Importe e classifique lançamentos para gerar o Dashboard
          </div>
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="metrics-grid mb-6">
            {[
              { label: 'Receita Bruta', value: dre.receitaBruta },
              { label: 'Receita Líquida', value: dre.receitaLiquida, pct: fmtPct(dre.receitaLiquida, dre.receitaBruta) },
              { label: 'Margem de Contribuição', value: dre.margemContribuicao, pct: fmtPct(dre.margemContribuicao, dre.receitaBruta) },
              { label: 'Lucro Operacional', value: dre.resultadoOperacional, pct: fmtPct(dre.resultadoOperacional, dre.receitaBruta) },
              { label: 'Resultado Líquido', value: dre.resultadoLiquido, pct: `${margem}%` },
            ].map(m => (
              <div className="metric-card" key={m.label}>
                <div className="metric-accent" style={{ background: (m.value ?? 0) < 0 ? '#c0392b' : 'var(--brave-yellow)' }} />
                <div className="metric-label">{m.label}</div>
                <div className={`metric-value ${(m.value ?? 0) < 0 ? 'negative' : ''}`} style={{ fontSize: 17 }}>
                  {fmt(m.value ?? 0)}
                </div>
                {m.pct && <div style={{ fontSize: 11, color: 'var(--brave-gray)', marginTop: 2 }}>{m.pct} da receita</div>}
              </div>
            ))}
          </div>

          {/* KPIs secundários: custos e ponto de equilíbrio */}
          <div className="metrics-grid mb-6" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
            <div className="metric-card">
              <div className="metric-accent" style={{ background: '#8d99ae' }} />
              <div className="metric-label">Custos Variáveis</div>
              <div className="metric-value" style={{ fontSize: 17 }}>{fmt(custosVar)}</div>
              <div style={{ fontSize: 11, color: 'var(--brave-gray)', marginTop: 2 }}>{fmtPct(custosVar, dre.receitaBruta)} da receita</div>
            </div>
            <div className="metric-card">
              <div className="metric-accent" style={{ background: '#c0392b' }} />
              <div className="metric-label">Custos Fixos</div>
              <div className="metric-value" style={{ fontSize: 17 }}>{fmt(custosFixos)}</div>
              <div style={{ fontSize: 11, color: 'var(--brave-gray)', marginTop: 2 }}>{fmtPct(custosFixos, dre.receitaBruta)} da receita</div>
            </div>
            <div className="metric-card">
              <div className="metric-accent" style={{ background: 'var(--brave-yellow)' }} />
              <div className="metric-label">Ponto de Equilíbrio (PEF)</div>
              <div className="metric-value" style={{ fontSize: 17 }}>{pef > 0 ? fmt(pef) : '—'}</div>
              <div style={{ fontSize: 11, color: 'var(--brave-gray)', marginTop: 2 }}>receita mínima p/ equilíbrio</div>
            </div>
            <div className="metric-card">
              <div className="metric-accent" style={{ background: margemSeguranca != null && margemSeguranca >= 0 ? '#1a7a4a' : '#c0392b' }} />
              <div className="metric-label">Margem de Segurança</div>
              <div className="metric-value" style={{ fontSize: 17, color: margemSeguranca != null && margemSeguranca >= 0 ? '#1a7a4a' : '#c0392b' }}>
                {margemSeguranca != null ? `${margemSeguranca.toFixed(1)}%` : '—'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--brave-gray)', marginTop: 2 }}>quanto a receita supera o PEF</div>
            </div>
          </div>

          <div className="grid-2 mb-6">
            {/* Composição de Despesas — donut */}
            <div className="card">
              <div style={{ fontFamily: 'var(--font-sub)', fontWeight: 600, fontSize: 13, marginBottom: 4 }}>
                Composição de Despesas e Custos — {periodoLabel}
              </div>
              <div style={{ fontSize: 11, color: 'var(--brave-gray)', marginBottom: 12 }}>Total: {fmt(totalDespesas)}</div>
              {donutData.length === 0 ? (
                <div style={{ color: 'var(--brave-gray)', fontSize: 13, padding: 20 }}>Sem despesas classificadas no período.</div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <ResponsiveContainer width="48%" height={220} minWidth={180}>
                    <PieChart>
                      <Pie data={donutData} dataKey="value" nameKey="label" cx="50%" cy="50%"
                        innerRadius={52} outerRadius={90} paddingAngle={2} stroke="#fff" strokeWidth={2}>
                        {donutData.map((_, i) => <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v: number, n: string) => [`${fmt(v)} (${fmtPct(v, totalDespesas)})`, n]} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{ flex: 1, minWidth: 200, display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {donutData.map((g, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                        <span style={{ width: 10, height: 10, borderRadius: 2, background: DONUT_COLORS[i % DONUT_COLORS.length], flexShrink: 0 }} />
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.label}</span>
                        <span style={{ fontWeight: 600 }}>{fmt(g.value)}</span>
                        <span style={{ color: 'var(--brave-gray)', width: 44, textAlign: 'right' }}>{fmtPct(g.value, totalDespesas)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Ponto de Equilíbrio vs Receita */}
            <div className="card">
              <div style={{ fontFamily: 'var(--font-sub)', fontWeight: 600, fontSize: 13, marginBottom: 4 }}>
                Ponto de Equilíbrio vs Receita — {periodoLabel}
              </div>
              <div style={{ fontSize: 11, color: 'var(--brave-gray)', marginBottom: 12 }}>
                Barras de equilíbrio abaixo da Receita = operação acima do ponto de equilíbrio
              </div>
              {dre.mcPct > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={breakevenData} layout="vertical" margin={{ left: 10, right: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#edf2f4" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                    <YAxis type="category" dataKey="label" tick={{ fontSize: 12 }} width={54} />
                    <Tooltip formatter={(v: number) => fmt(v)} />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={22}>
                      {breakevenData.map((e, i) => (
                        <Cell key={i} fill={
                          e.label === 'Receita' ? '#2b2d42'
                            : dre.receitaBruta >= e.value ? '#1a7a4a' : '#c0392b'
                        } />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ color: 'var(--brave-gray)', fontSize: 13, padding: 20 }}>
                  Margem de contribuição não positiva — ponto de equilíbrio não calculável.
                </div>
              )}
            </div>
          </div>

          <div className="grid-2 mb-6">
            {/* Gráfico de barras */}
            <div className="card">
              <div style={{ fontFamily: 'var(--font-sub)', fontWeight: 600, fontSize: 13, marginBottom: 16 }}>
                Receita x Resultado — {year}
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={yearData} barSize={14}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#edf2f4" />
                  <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => fmt(v)} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Receita Bruta" radius={[3, 3, 0, 0]}>
                    {yearData.map((entry: any) => (
                      <Cell
                        key={entry.mes}
                        fill={!consolidated && entry.mesIdx === month ? 'var(--brave-yellow)' : '#2b2d42'}
                      />
                    ))}
                  </Bar>
                  <Bar dataKey="Resultado Líquido" radius={[3, 3, 0, 0]}>
                    {yearData.map((entry: any) => (
                      <Cell
                        key={entry.mes}
                        fill={entry['Resultado Líquido'] >= 0 ? '#1a7a4a' : '#c0392b'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Linha de evolução */}
            <div className="card">
              <div style={{ fontFamily: 'var(--font-sub)', fontWeight: 600, fontSize: 13, marginBottom: 16 }}>
                Evolução do Resultado Líquido — {year}
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={yearData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#edf2f4" />
                  <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => fmt(v)} />
                  <Line type="monotone" dataKey="Resultado Líquido" stroke="#eaca2d" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Gráficos de indicadores financeiros */}
          <div className="grid-2 mb-6">
            {/* Linha 1: Evolução dos resultados em R$ */}
            <div className="card">
              <div style={{ fontFamily: 'var(--font-sub)', fontWeight: 600, fontSize: 13, marginBottom: 4 }}>
                Evolução dos Resultados — {year}
              </div>
              <div style={{ fontSize: 11, color: 'var(--brave-gray)', marginBottom: 16 }}>Valores em R$</div>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={yearData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#edf2f4" />
                  <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => fmt(v)} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="Receita Bruta" stroke="#2b2d42" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                  <Line type="monotone" dataKey="Margem Contribuição" stroke="#8d99ae" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                  <Line type="monotone" dataKey="Lucro Operacional" stroke="#eaca2d" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                  <Line type="monotone" dataKey="Resultado Líquido" stroke="#1a7a4a" strokeWidth={2.5} dot={{ r: 4 }} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Linha 2: Evolução das margens % */}
            <div className="card">
              <div style={{ fontFamily: 'var(--font-sub)', fontWeight: 600, fontSize: 13, marginBottom: 4 }}>
                Evolução das Margens — {year}
              </div>
              <div style={{ fontSize: 11, color: 'var(--brave-gray)', marginBottom: 16 }}>% sobre Receita Bruta</div>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={yearData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#edf2f4" />
                  <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${v}%`} />
                  <Tooltip formatter={(v: unknown) => typeof v === 'number' ? `${v.toFixed(1)}%` : '—'} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="Margem Contrib. %" stroke="#8d99ae" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                  <Line type="monotone" dataKey="Margem Operacional %" stroke="#eaca2d" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                  <Line type="monotone" dataKey="Margem Líquida %" stroke="#1a7a4a" strokeWidth={2.5} dot={{ r: 4 }} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </Shell>
  )
}
