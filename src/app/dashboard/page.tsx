'use client'
import { useEffect, useState } from 'react'
import Shell from '@/components/Shell'
import { MONTH_NAMES } from '@/lib/dre'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend
} from 'recharts'

const fmt = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

const now = new Date()

export default function Dashboard() {
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/dre?month=${month}&year=${year}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [month, year])

  const dre = data?.dre
  const yearData = (data?.yearData || []).map((d: any, i: number) => ({
    mes: MONTH_NAMES[i + 1],
    'Receita Bruta': d.receitaBruta,
    'Resultado Líquido': d.resultadoLiquido,
  }))

  const margem = dre?.receitaBruta > 0
    ? ((dre.resultadoLiquido / dre.receitaBruta) * 100).toFixed(1)
    : '0.0'

  return (
    <Shell>
      <div className="page-header flex-between">
        <div>
          <h1 className="page-title">Dashboard Mensal</h1>
          <p className="page-subtitle">Visão geral do resultado financeiro</p>
        </div>
        <div className="flex gap-2">
          <select className="form-select" style={{ width: 120 }} value={month} onChange={e => setMonth(+e.target.value)}>
            {MONTH_NAMES.slice(1).map((m, i) => (
              <option key={i + 1} value={i + 1}>{m}</option>
            ))}
          </select>
          <select className="form-select" style={{ width: 90 }} value={year} onChange={e => setYear(+e.target.value)}>
            {[2023, 2024, 2025, 2026].map(y => <option key={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--brave-gray)' }}>Carregando...</div>
      ) : !dre ? (
        <div className="card" style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📊</div>
          <div style={{ fontFamily: 'var(--font-sub)', fontWeight: 600, fontSize: 15 }}>Sem dados para este período</div>
          <div style={{ color: 'var(--brave-gray)', fontSize: 13, marginTop: 6 }}>
            Importe um extrato OFX e classifique as transações para gerar o DRE
          </div>
        </div>
      ) : (
        <>
          <div className="metrics-grid">
            {[
              { label: 'Receita Bruta', value: dre.receitaBruta, cls: '' },
              { label: 'Receita Líquida', value: dre.receitaLiquida, cls: '' },
              { label: 'Resultado Bruto', value: dre.resultadoBruto, cls: dre.resultadoBruto >= 0 ? 'positive' : 'negative' },
              { label: 'Resultado Líquido', value: dre.resultadoLiquido, cls: dre.resultadoLiquido >= 0 ? 'positive' : 'negative' },
              { label: 'Margem Líquida', value: null, display: `${margem}%`, cls: parseFloat(margem) >= 0 ? 'positive' : 'negative' },
            ].map(m => (
              <div className="metric-card" key={m.label}>
                <div className="metric-accent"></div>
                <div className="metric-label">{m.label}</div>
                <div className={`metric-value ${m.cls}`}>
                  {m.display ?? fmt(m.value!)}
                </div>
              </div>
            ))}
          </div>

          <div className="grid-2 mb-6">
            <div className="card">
              <div style={{ fontFamily: 'var(--font-sub)', fontWeight: 600, fontSize: 13, marginBottom: 16 }}>
                Receita x Resultado — {year}
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={yearData} barSize={14}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#edf2f4" />
                  <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => fmt(v)} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Receita Bruta" fill="#2b2d42" radius={[3,3,0,0]} />
                  <Bar dataKey="Resultado Líquido" fill="#eaca2d" radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="card">
              <div style={{ fontFamily: 'var(--font-sub)', fontWeight: 600, fontSize: 13, marginBottom: 16 }}>
                Evolução do Resultado Líquido — {year}
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={yearData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#edf2f4" />
                  <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `R$${(v/1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => fmt(v)} />
                  <Line type="monotone" dataKey="Resultado Líquido" stroke="#eaca2d" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card">
            <div style={{ fontFamily: 'var(--font-sub)', fontWeight: 600, fontSize: 13, marginBottom: 20 }}>
              DRE — {MONTH_NAMES[month]}/{year}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {dre.lines.map((line: any, i: number) => (
                <div
                  key={i}
                  className={`dre-row ${line.highlight ? 'highlight' : ''}`}
                  style={{ paddingLeft: line.indent ? 32 : 16 }}
                >
                  <div>
                    <div className="dre-label">{line.label}</div>
                    {line.sublabel && <div className="dre-sublabel">{line.sublabel}</div>}
                  </div>
                  <div className={`dre-value ${line.value >= 0 ? 'pos' : 'neg'}`}>
                    {fmt(line.value)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </Shell>
  )
}
