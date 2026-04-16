'use client'
import { useEffect, useState } from 'react'
import Shell from '@/components/Shell'
import { MONTH_NAMES } from '@/lib/dre'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Cell
} from 'recharts'

const fmt = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

const pct = (v: number, base: number) =>
  base > 0 ? `${((v / base) * 100).toFixed(1)}%` : '—'

const now = new Date()

export default function DREPage() {
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [unitId, setUnitId] = useState<string>('')
  const [units, setUnits] = useState<any[]>([])
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/units').then(r => r.json()).then(setUnits)
  }, [])

  useEffect(() => {
    setLoading(true)
    const unitParam = unitId ? `&unitId=${unitId}` : ''
    fetch(`/api/dre?month=${month}&year=${year}${unitParam}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
  }, [month, year, unitId])

  const dre = data?.dre
  const yearData = (data?.yearData || []).map((d: any, i: number) => ({
    mes: MONTH_NAMES[i + 1],
    'Receita Bruta': +d.receitaBruta.toFixed(2),
    'Resultado Bruto': +d.resultadoBruto.toFixed(2),
    'Resultado Líquido': +d.resultadoLiquido.toFixed(2),
  }))

  const unitLabel = unitId ? units.find(u => u.id === parseInt(unitId))?.name : 'Consolidado'

  return (
    <Shell>
      <div className="page-header flex-between">
        <div>
          <h1 className="page-title">DRE — {unitLabel}</h1>
          <p className="page-subtitle">Resultado do exercício por competência</p>
        </div>
        <div className="flex gap-2">
          <select className="form-select" style={{ width: 160 }} value={unitId} onChange={e => setUnitId(e.target.value)}>
            <option value="">Consolidado</option>
            {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
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
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--brave-gray)' }}>Calculando DRE...</div>
      ) : !dre || dre.receitaBruta === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📊</div>
          <div style={{ fontFamily: 'var(--font-sub)', fontWeight: 600, fontSize: 15 }}>
            Sem dados classificados para {MONTH_NAMES[month]}/{year} — {unitLabel}
          </div>
          <div style={{ color: 'var(--brave-gray)', fontSize: 13, marginTop: 6 }}>
            Classifique as transações em Lançamentos para gerar o DRE
          </div>
        </div>
      ) : (
        <>
          <div className="metrics-grid mb-6">
            {[
              { label: 'Receita Bruta', value: dre.receitaBruta, pctVal: null },
              { label: 'Receita Líquida', value: dre.receitaLiquida, pctVal: pct(dre.receitaLiquida, dre.receitaBruta) },
              { label: 'Resultado Bruto', value: dre.resultadoBruto, pctVal: pct(dre.resultadoBruto, dre.receitaBruta) },
              { label: 'EBIT', value: dre.resultadoOperacional, pctVal: pct(dre.resultadoOperacional, dre.receitaBruta) },
              { label: 'Resultado Líquido', value: dre.resultadoLiquido, pctVal: pct(dre.resultadoLiquido, dre.receitaBruta) },
            ].map(m => (
              <div className="metric-card" key={m.label}>
                <div className="metric-accent" style={{ background: m.value < 0 ? '#c0392b' : 'var(--brave-yellow)' }}></div>
                <div className="metric-label">{m.label}</div>
                <div className={`metric-value ${m.value < 0 ? 'negative' : ''}`} style={{ fontSize: 18 }}>{fmt(m.value)}</div>
                {m.pctVal && <div style={{ fontSize: 12, color: 'var(--brave-gray)', marginTop: 2 }}>{m.pctVal} da receita bruta</div>}
              </div>
            ))}
          </div>

          <div className="grid-2 mb-6">
            <div className="card">
              <div style={{ fontFamily: 'var(--font-sub)', fontWeight: 600, fontSize: 13, marginBottom: 4 }}>
                DRE Detalhada — {MONTH_NAMES[month]}/{year} · {unitLabel}
              </div>
              <div style={{ fontSize: 11, color: 'var(--brave-gray)', marginBottom: 20 }}>% calculado sobre Receita Bruta</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {dre.lines.map((line: any, i: number) => (
                  <div key={i} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: line.highlight ? '10px 14px' : '7px 14px',
                    paddingLeft: line.indent ? 28 : 14,
                    borderRadius: 8,
                    background: line.highlight ? 'var(--brave-light)' : 'transparent',
                    borderTop: line.highlight ? '1px solid rgba(43,45,66,0.08)' : 'none',
                    marginTop: line.highlight ? 4 : 0,
                  }}>
                    <div>
                      <div style={{ fontSize: line.highlight ? 13 : 12, fontWeight: line.highlight ? 700 : 400, fontFamily: line.highlight ? 'var(--font-sub)' : 'var(--font-body)' }}>{line.label}</div>
                      {line.sublabel && <div style={{ fontSize: 10, color: 'var(--brave-gray)' }}>{line.sublabel}</div>}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: line.highlight ? 700 : 500, fontSize: line.highlight ? 14 : 13, color: line.value >= 0 ? (line.highlight ? 'var(--brave-dark)' : '#1a7a4a') : '#c0392b' }}>
                        {fmt(line.value)}
                      </div>
                      {!line.indent && dre.receitaBruta > 0 && (
                        <div style={{ fontSize: 10, color: 'var(--brave-gray)' }}>{pct(Math.abs(line.value), dre.receitaBruta)}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="card">
              <div style={{ fontFamily: 'var(--font-sub)', fontWeight: 600, fontSize: 13, marginBottom: 16 }}>
                Comparativo Anual — {year} · {unitLabel}
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={yearData} barSize={10}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#edf2f4" />
                  <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => fmt(v)} />
                  <Bar dataKey="Receita Bruta" fill="#2b2d42" radius={[3,3,0,0]} />
                  <Bar dataKey="Resultado Bruto" fill="#8d99ae" radius={[3,3,0,0]} />
                  <Bar dataKey="Resultado Líquido" radius={[3,3,0,0]}>
                    {yearData.map((entry: any, index: number) => (
                      <Cell key={index} fill={entry['Resultado Líquido'] >= 0 ? '#eaca2d' : '#c0392b'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', gap: 16, marginTop: 8, justifyContent: 'center' }}>
                {[{ color: '#2b2d42', label: 'Rec. Bruta' }, { color: '#8d99ae', label: 'Res. Bruto' }, { color: '#eaca2d', label: 'Res. Líquido' }].map(l => (
                  <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--brave-gray)' }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: l.color }}></div>
                    {l.label}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '16px 24px', fontFamily: 'var(--font-sub)', fontWeight: 600, fontSize: 13 }}>
              Histórico Mensal — {year} · {unitLabel}
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Mês</th>
                    <th style={{ textAlign: 'right' }}>Rec. Bruta</th>
                    <th style={{ textAlign: 'right' }}>Rec. Líquida</th>
                    <th style={{ textAlign: 'right' }}>Res. Bruto</th>
                    <th style={{ textAlign: 'right' }}>EBIT</th>
                    <th style={{ textAlign: 'right' }}>Res. Líquido</th>
                    <th style={{ textAlign: 'right' }}>Margem</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.yearData || []).map((d: any, i: number) => (
                    <tr key={i} style={{ background: i + 1 === month ? 'rgba(234,202,45,0.08)' : '' }}>
                      <td style={{ fontFamily: 'var(--font-sub)', fontWeight: i + 1 === month ? 700 : 400 }}>
                        {MONTH_NAMES[i + 1]}
                        {i + 1 === month && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--brave-yellow-dark)', fontWeight: 700 }}>◀</span>}
                      </td>
                      <td style={{ textAlign: 'right', fontSize: 12 }}>{d.receitaBruta > 0 ? fmt(d.receitaBruta) : '—'}</td>
                      <td style={{ textAlign: 'right', fontSize: 12 }}>{d.receitaLiquida > 0 ? fmt(d.receitaLiquida) : '—'}</td>
                      <td style={{ textAlign: 'right', fontSize: 12, color: d.resultadoBruto < 0 ? '#c0392b' : '' }}>{d.receitaBruta > 0 ? fmt(d.resultadoBruto) : '—'}</td>
                      <td style={{ textAlign: 'right', fontSize: 12, color: d.resultadoOperacional < 0 ? '#c0392b' : '' }}>{d.receitaBruta > 0 ? fmt(d.resultadoOperacional) : '—'}</td>
                      <td style={{ textAlign: 'right', fontSize: 12, fontWeight: 600, color: d.resultadoLiquido < 0 ? '#c0392b' : '#1a7a4a' }}>{d.receitaBruta > 0 ? fmt(d.resultadoLiquido) : '—'}</td>
                      <td style={{ textAlign: 'right', fontSize: 12, color: 'var(--brave-gray)' }}>{d.receitaBruta > 0 ? pct(d.resultadoLiquido, d.receitaBruta) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </Shell>
  )
}
