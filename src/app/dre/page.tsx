'use client'
import { useEffect, useState } from 'react'
import Shell from '@/components/Shell'
import { MONTH_NAMES, DRELineType } from '@/lib/dre'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Cell
} from 'recharts'

const fmt = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

const pct = (v: number, base: number) =>
  base > 0 ? `${((v / base) * 100).toFixed(1)}%` : '—'

const now = new Date()

function lineStyle(type: DRELineType, indent: number, value: number) {
  const pad = 14 + indent * 16
  const base = { paddingLeft: pad, paddingRight: 14, borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' as const }

  if (type === 'subtotal') {
    return { ...base, padding: '11px 14px', paddingLeft: pad, background: 'var(--brave-light)', marginTop: 4, marginBottom: 4, borderTop: '1px solid rgba(43,45,66,0.08)' }
  }
  if (type === 'section') {
    return { ...base, padding: '8px 14px', paddingLeft: pad, marginTop: 10, borderTop: '1px solid rgba(43,45,66,0.06)' }
  }
  if (type === 'breakeven') {
    return { ...base, padding: '5px 14px', paddingLeft: pad, background: 'rgba(234,202,45,0.07)', borderRadius: 6 }
  }
  if (type === 'group') {
    return { ...base, padding: indent === 0 ? '8px 14px' : '6px 14px', paddingLeft: pad }
  }
  return { ...base, padding: '4px 14px', paddingLeft: pad }
}

function labelStyle(type: DRELineType, indent: number) {
  if (type === 'subtotal') return { fontSize: 13, fontWeight: 700, fontFamily: 'var(--font-sub)' }
  if (type === 'section') return { fontSize: 12, fontWeight: 700, color: 'var(--brave-gray)', fontFamily: 'var(--font-sub)', textTransform: 'uppercase' as const, letterSpacing: '0.04em' }
  if (type === 'breakeven') return { fontSize: 11, fontWeight: 500, color: '#856404' }
  if (type === 'group' && indent === 0) return { fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-sub)' }
  if (type === 'group') return { fontSize: 12, fontWeight: 600 }
  return { fontSize: 12, color: 'var(--brave-gray)' }
}

function valueStyle(type: DRELineType, value: number) {
  const color = value >= 0
    ? (type === 'subtotal' || type === 'group' ? '#1a7a4a' : 'var(--brave-dark)')
    : '#c0392b'
  const base = { color, whiteSpace: 'nowrap' as const }
  if (type === 'subtotal') return { ...base, fontSize: 14, fontWeight: 700 }
  if (type === 'section') return { ...base, fontSize: 12, fontWeight: 600, color: 'var(--brave-gray)' }
  if (type === 'breakeven') return { ...base, fontSize: 11, color: '#856404' }
  if (type === 'group') return { ...base, fontSize: 13, fontWeight: 600 }
  return { ...base, fontSize: 12 }
}

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
    'Margem Contrib.': +d.margemContribuicao.toFixed(2),
    'Lucro Líquido': +d.resultadoLiquido.toFixed(2),
  }))

  const unitLabel = unitId ? units.find(u => u.id === parseInt(unitId))?.name : 'Consolidado'

  return (
    <Shell>
      <div className="page-header flex-between">
        <div>
          <h1 className="page-title">DRE — {unitLabel}</h1>
          <p className="page-subtitle">Demonstração do Resultado do Exercício</p>
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
            Sem dados para {MONTH_NAMES[month]}/{year} — {unitLabel}
          </div>
          <div style={{ color: 'var(--brave-gray)', fontSize: 13, marginTop: 6 }}>
            Importe e classifique lançamentos para gerar o DRE
          </div>
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="metrics-grid mb-6">
            {[
              { label: 'Receita Operacional', value: dre.receitaBruta },
              { label: 'Receita Líquida', value: dre.receitaLiquida, sub: pct(dre.receitaLiquida, dre.receitaBruta) },
              { label: 'Margem de Contribuição', value: dre.margemContribuicao, sub: pct(dre.margemContribuicao, dre.receitaBruta) },
              { label: 'Lucro Operacional', value: dre.resultadoOperacional, sub: pct(dre.resultadoOperacional, dre.receitaBruta) },
              { label: 'Lucro Líquido', value: dre.resultadoLiquido, sub: pct(dre.resultadoLiquido, dre.receitaBruta) },
            ].map(m => (
              <div className="metric-card" key={m.label}>
                <div className="metric-accent" style={{ background: m.value < 0 ? '#c0392b' : 'var(--brave-yellow)' }} />
                <div className="metric-label">{m.label}</div>
                <div className={`metric-value ${m.value < 0 ? 'negative' : ''}`} style={{ fontSize: 17 }}>{fmt(m.value)}</div>
                {m.sub && <div style={{ fontSize: 11, color: 'var(--brave-gray)', marginTop: 2 }}>{m.sub} da receita</div>}
              </div>
            ))}
          </div>

          <div className="grid-2 mb-6">
            {/* DRE Estruturado */}
            <div className="card" style={{ overflowY: 'auto', maxHeight: 680 }}>
              <div style={{ fontFamily: 'var(--font-sub)', fontWeight: 600, fontSize: 13, marginBottom: 4 }}>
                DRE — {MONTH_NAMES[month]}/{year} · {unitLabel}
              </div>
              <div style={{ fontSize: 11, color: 'var(--brave-gray)', marginBottom: 16 }}>
                % calculado sobre Receita Operacional
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {dre.lines.map((line: any, i: number) => (
                  <div key={i} style={lineStyle(line.type, line.indent, line.value)}>
                    <div>
                      <div style={labelStyle(line.type, line.indent)}>{line.label}</div>
                      {line.sublabel && (
                        <div style={{ fontSize: 10, color: 'var(--brave-gray)' }}>{line.sublabel}</div>
                      )}
                    </div>
                    <div style={{ textAlign: 'right', minWidth: 100 }}>
                      <div style={valueStyle(line.type, line.value)}>
                        {line.value !== 0 ? fmt(line.value) : '—'}
                      </div>
                      {(line.type === 'subtotal' || line.type === 'group') && line.indent === 0 && dre.receitaBruta > 0 && line.value !== 0 && (
                        <div style={{ fontSize: 10, color: 'var(--brave-gray)' }}>
                          {pct(Math.abs(line.value), dre.receitaBruta)}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Gráfico anual */}
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
                  <Bar dataKey="Receita Bruta" fill="#2b2d42" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Margem Contrib." fill="#8d99ae" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Lucro Líquido" radius={[3, 3, 0, 0]}>
                    {yearData.map((entry: any, index: number) => (
                      <Cell key={index} fill={entry['Lucro Líquido'] >= 0 ? '#eaca2d' : '#c0392b'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', gap: 16, marginTop: 8, justifyContent: 'center' }}>
                {[{ color: '#2b2d42', label: 'Rec. Bruta' }, { color: '#8d99ae', label: 'Margem Contrib.' }, { color: '#eaca2d', label: 'Lucro Líquido' }].map(l => (
                  <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--brave-gray)' }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: l.color }} />
                    {l.label}
                  </div>
                ))}
              </div>

              {/* Resumo extra */}
              <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { label: 'Lucro após Investimentos', value: dre.lucroAposInvestimentos },
                  { label: 'Lucro antes dos Impostos', value: dre.lucroAntesImpostos },
                ].map(r => (
                  <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--brave-light)', borderRadius: 8 }}>
                    <span style={{ fontSize: 12, color: 'var(--brave-gray)' }}>{r.label}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: r.value < 0 ? '#c0392b' : '#1a7a4a' }}>{fmt(r.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Histórico mensal */}
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
                    <th style={{ textAlign: 'right' }}>Margem Contrib.</th>
                    <th style={{ textAlign: 'right' }}>Lucro Op.</th>
                    <th style={{ textAlign: 'right' }}>Lucro Líquido</th>
                    <th style={{ textAlign: 'right' }}>Margem %</th>
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
                      <td style={{ textAlign: 'right', fontSize: 12, color: d.margemContribuicao < 0 ? '#c0392b' : '' }}>{d.receitaBruta > 0 ? fmt(d.margemContribuicao) : '—'}</td>
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
