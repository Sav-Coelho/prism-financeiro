'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import Shell from '@/components/Shell'
import { MONTH_NAMES } from '@/lib/dre'
import { calcABC, ABC_COLOR, type ABCItem, type ABCClass } from '@/lib/abc'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Cell,
} from 'recharts'

const fmtBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
const fmtInt = (v: number) => new Intl.NumberFormat('pt-BR').format(Math.round(v))
const now = new Date()

type Tab = 'vendas' | 'estoque'

export default function CurvaABCPage() {
  const [tab, setTab] = useState<Tab>('vendas')
  const [units, setUnits] = useState<any[]>([])
  const [unitId, setUnitId] = useState('')
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())

  const [salesData, setSalesData] = useState<any[]>([])
  const [stockData, setStockData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [toast, setToast] = useState('')
  const [drag, setDrag] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(''), 4500) }
  const unitParam = unitId ? `&unitId=${unitId}` : ''

  const load = () => {
    setLoading(true)
    Promise.all([
      fetch(`/api/abc/vendas?month=${month}&year=${year}${unitParam}`).then(r => r.json()),
      fetch(`/api/abc/estoque?month=${month}&year=${year}${unitParam}`).then(r => r.json()),
    ]).then(([s, e]) => {
      setSalesData(Array.isArray(s) ? s : [])
      setStockData(Array.isArray(e) ? e : [])
      setLoading(false)
    })
  }
  useEffect(() => { fetch('/api/units').then(r => r.json()).then(setUnits) }, [])
  useEffect(() => { load() }, [month, year, unitId])

  const upload = async (file: File) => {
    setUploading(true)
    const fd = new FormData()
    fd.append('file', file)
    fd.append('month', String(month))
    fd.append('year', String(year))
    if (unitId) fd.append('unitId', unitId)
    const endpoint = tab === 'vendas' ? '/api/abc/import' : '/api/abc/inventario'
    try {
      const res = await fetch(endpoint, { method: 'POST', body: fd })
      const data = await res.json()
      if (res.ok) {
        const extra = data.semCusto > 0 ? ` · ${data.semCusto} sem custo` : ''
        showToast(`✓ ${data.imported} ${tab === 'vendas' ? 'produtos vendidos' : 'itens em estoque'} importados${extra}`)
        load()
      } else {
        showToast(`Erro: ${data.error}`)
      }
    } catch {
      showToast('Erro ao enviar a planilha')
    }
    setUploading(false)
  }

  // Modo monetário só se a planilha trouxer valor/custo; caso contrário, por unidade
  const isMonetary = tab === 'vendas'
    ? salesData.some((r: any) => (r.revenue || 0) > 0)
    : stockData.some((r: any) => (r.unitCost || 0) > 0)
  const valFmt = (v: number) => isMonetary ? fmtBRL(v) : `${fmtInt(v)} un`
  const valueLabel = tab === 'vendas'
    ? (isMonetary ? 'Faturamento' : 'Qtd. Vendida')
    : (isMonetary ? 'Valor em Estoque' : 'Qtd. em Estoque')

  // Agrega por produto e classifica ABC
  const abc = useMemo(() => {
    const raw = tab === 'vendas' ? salesData : stockData
    const map = new Map<string, ABCItem>()
    raw.forEach((r: any) => {
      const key = String(r.product || '').toLowerCase().trim()
      if (!key) return
      const value = tab === 'vendas'
        ? ((r.revenue || 0) > 0 ? r.revenue : (r.quantity || 0))
        : ((r.unitCost || 0) > 0 ? (r.quantity || 0) * r.unitCost : (r.quantity || 0))
      const qty = r.quantity || 0
      const ex = map.get(key)
      if (ex) {
        ex.value += value
        ex.quantity = (ex.quantity || 0) + qty
      } else {
        map.set(key, { key, label: r.product, sublabel: r.category || r.sku || undefined, value, quantity: qty })
      }
    })
    return calcABC(Array.from(map.values()))
  }, [tab, salesData, stockData])

  // Giro e cobertura por QUANTIDADE (vendido vs estoque) — não precisa de custo
  const turnover = useMemo(() => {
    const totalSold = salesData.reduce((a: number, r: any) => a + (r.quantity || 0), 0)
    const totalStock = stockData.reduce((a: number, r: any) => a + (r.quantity || 0), 0)
    if (totalStock <= 0 && totalSold <= 0) return null
    const giro = totalStock > 0 ? totalSold / totalStock : null
    const cobertura = totalSold > 0 ? (totalStock * 30) / totalSold : null
    // Itens parados: em estoque mas sem venda no período
    const soldKeys = new Set(salesData.map((r: any) => String(r.product || '').toLowerCase().trim()))
    const parados = stockData.filter((r: any) => !soldKeys.has(String(r.product || '').toLowerCase().trim()) && (r.quantity || 0) > 0).length
    return { totalSold, totalStock, giro, cobertura, parados }
  }, [salesData, stockData])

  const chartData = useMemo(
    () => abc.rows.slice(0, 20).map(r => ({
      name: r.label.length > 14 ? r.label.slice(0, 13) + '…' : r.label,
      valor: +r.value.toFixed(2),
      acum: +r.cumPct.toFixed(1),
      class: r.class,
    })),
    [abc]
  )

  const hasData = abc.rows.length > 0
  const yTickFmt = (v: number) => isMonetary ? `${(v / 1000).toFixed(0)}k` : fmtInt(v)

  return (
    <Shell>
      <div className="page-header flex-between">
        <div>
          <h1 className="page-title">Curva ABC</h1>
          <p className="page-subtitle">Classificação de Pareto — Vendas e Estoque (relatório mensal)</p>
        </div>
        <div className="flex gap-2">
          <select className="form-select" style={{ width: 150 }} value={unitId} onChange={e => setUnitId(e.target.value)}>
            <option value="">Todas as unidades</option>
            {units.map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          <select className="form-select" style={{ width: 120 }} value={month} onChange={e => setMonth(+e.target.value)}>
            {MONTH_NAMES.slice(1).map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
          </select>
          <select className="form-select" style={{ width: 90 }} value={year} onChange={e => setYear(+e.target.value)}>
            {[2023, 2024, 2025, 2026].map(y => <option key={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {(['vendas', 'estoque'] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '8px 18px', border: 'none', borderRadius: 6, cursor: 'pointer',
            fontFamily: 'var(--font-sub)', fontWeight: 600, fontSize: 13,
            background: tab === t ? 'var(--brave-yellow)' : 'var(--brave-light)',
            color: tab === t ? 'var(--brave-dark)' : 'var(--brave-gray)',
          }}>
            {t === 'vendas' ? '🏷️ Vendas' : '📦 Estoque'}
          </button>
        ))}
      </div>

      {/* Upload — específico da aba ativa */}
      <div
        className={`upload-zone mb-6 ${drag ? 'drag' : ''}`}
        onDragOver={e => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) upload(f) }}
        onClick={() => fileRef.current?.click()}
      >
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = '' }} />
        <div className="upload-icon">{uploading ? '⏳' : '📄'}</div>
        <div className="upload-title">
          {uploading ? 'Importando...' : tab === 'vendas'
            ? `Importar Relatório de Saída de Produtos — ${MONTH_NAMES[month]}/${year}`
            : `Importar Inventário (com custo) — ${MONTH_NAMES[month]}/${year}`}
        </div>
        <div className="upload-sub">
          {tab === 'vendas'
            ? <>Colunas: <strong>Código · Produto · Quantidade Total</strong>. Alimenta a ABC de <strong>Vendas</strong> (unidades vendidas).</>
            : <>Colunas: <strong>Código · Produto · Preço de Custo · Qtd. Estoque</strong>. Alimenta a ABC de <strong>Estoque em R$</strong> e o giro/cobertura/GMROI.</>}
          <br />Reenviar o mesmo mês substitui os dados desta aba.
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--brave-gray)' }}>Carregando...</div>
      ) : !hasData ? (
        <div className="card" style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📊</div>
          <div style={{ fontFamily: 'var(--font-sub)', fontWeight: 600, fontSize: 15 }}>
            Sem dados de {tab === 'vendas' ? 'vendas' : 'estoque'} para {MONTH_NAMES[month]}/{year}
          </div>
          <div style={{ color: 'var(--brave-gray)', fontSize: 13, marginTop: 6 }}>
            Importe o relatório do mês acima para gerar a curva ABC.
          </div>
        </div>
      ) : (
        <>
          {/* Resumo A/B/C */}
          <div className="metrics-grid mb-6" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
            <div className="metric-card">
              <div className="metric-label">{valueLabel} total</div>
              <div className="metric-value" style={{ fontSize: 18 }}>{valFmt(abc.summary.total)}</div>
              <div style={{ fontSize: 11, color: 'var(--brave-gray)', marginTop: 2 }}>{abc.summary.count} produtos</div>
            </div>
            {(['A', 'B', 'C'] as ABCClass[]).map(c => (
              <div className="metric-card" key={c}>
                <div className="metric-accent" style={{ background: ABC_COLOR[c] }} />
                <div className="metric-label">Classe {c}</div>
                <div className="metric-value" style={{ fontSize: 18, color: ABC_COLOR[c] }}>
                  {abc.summary.byClass[c].valuePct.toFixed(0)}%
                </div>
                <div style={{ fontSize: 11, color: 'var(--brave-gray)', marginTop: 2 }}>
                  {abc.summary.byClass[c].count} produtos · {valFmt(abc.summary.byClass[c].value)}
                </div>
              </div>
            ))}
          </div>

          {/* Indicadores de giro (aba Estoque) */}
          {tab === 'estoque' && turnover && (
            <div className="card mb-6">
              <div style={{ fontFamily: 'var(--font-sub)', fontWeight: 700, fontSize: 14, marginBottom: 4 }}>
                Giro de Estoque (por quantidade) — {MONTH_NAMES[month]}/{year}
              </div>
              <div style={{ fontSize: 11, color: 'var(--brave-gray)', marginBottom: 16 }}>
                Unidades vendidas vs. unidades em estoque no período. Para giro/GMROI em R$, inclua o custo unitário na planilha.
              </div>
              <div className="metrics-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                <Metric label="Giro de Estoque" value={turnover.giro != null ? `${turnover.giro.toFixed(2)}×` : '—'} hint="vendido ÷ estoque" />
                <Metric label="Cobertura" value={turnover.cobertura != null ? `${Math.round(turnover.cobertura)} dias` : '—'} hint="autonomia do estoque" />
                <Metric label="Unidades vendidas" value={fmtInt(turnover.totalSold)} hint="no período" />
                <Metric label="Itens parados" value={fmtInt(turnover.parados)} hint="em estoque, sem venda" color={turnover.parados > 0 ? '#c0392b' : '#1a7a4a'} />
              </div>
            </div>
          )}

          {/* Pareto */}
          <div className="card mb-6">
            <div style={{ fontFamily: 'var(--font-sub)', fontWeight: 600, fontSize: 13, marginBottom: 4 }}>
              Curva de Pareto — Top 20 por {valueLabel}
            </div>
            <div style={{ fontSize: 11, color: 'var(--brave-gray)', marginBottom: 16 }}>
              A = até 80% acumulado · B = até 95% · C = restante
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={chartData} margin={{ top: 10, right: 10, bottom: 40, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#edf2f4" />
                <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-35} textAnchor="end" interval={0} height={60} />
                <YAxis yAxisId="l" tick={{ fontSize: 10 }} tickFormatter={yTickFmt} />
                <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 10 }} domain={[0, 100]} tickFormatter={v => `${v}%`} />
                <Tooltip formatter={(v: number, n: string) => n === 'acum' ? [`${v}%`, '% acum.'] : [valFmt(v), valueLabel]} />
                <Bar yAxisId="l" dataKey="valor" radius={[3, 3, 0, 0]}>
                  {chartData.map((e, i) => <Cell key={i} fill={ABC_COLOR[e.class]} />)}
                </Bar>
                <Line yAxisId="r" type="monotone" dataKey="acum" stroke="var(--brave-dark)" strokeWidth={2} dot={{ r: 2 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Tabela ABC */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '16px 24px', fontFamily: 'var(--font-sub)', fontWeight: 600, fontSize: 13, borderBottom: '1px solid var(--brave-light)' }}>
              Classificação ABC — {abc.rows.length} produtos
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 40 }}>#</th>
                    <th>Classe</th>
                    <th>Produto</th>
                    <th style={{ textAlign: 'right' }}>{valueLabel}</th>
                    <th style={{ textAlign: 'right' }}>% Total</th>
                    <th style={{ textAlign: 'right' }}>% Acum.</th>
                  </tr>
                </thead>
                <tbody>
                  {abc.rows.map(r => (
                    <tr key={r.key}>
                      <td style={{ color: 'var(--brave-gray)', fontSize: 12 }}>{r.rank}</td>
                      <td>
                        <span style={{ background: ABC_COLOR[r.class] + '22', color: ABC_COLOR[r.class], border: `1px solid ${ABC_COLOR[r.class]}`, borderRadius: 4, padding: '1px 8px', fontWeight: 700, fontSize: 12 }}>
                          {r.class}
                        </span>
                      </td>
                      <td style={{ fontSize: 13 }}>
                        {r.label}
                        {r.sublabel && <div style={{ fontSize: 10, color: 'var(--brave-gray)' }}>{r.sublabel}</div>}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600, fontSize: 13 }}>{valFmt(r.value)}</td>
                      <td style={{ textAlign: 'right', fontSize: 12 }}>{r.pct.toFixed(1)}%</td>
                      <td style={{ textAlign: 'right', fontSize: 12, color: 'var(--brave-gray)' }}>{r.cumPct.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {toast && <div className="toast">{toast}</div>}
    </Shell>
  )
}

function Metric({ label, value, hint, color }: { label: string; value: string; hint?: string; color?: string }) {
  return (
    <div className="metric-card">
      <div className="metric-label">{label}</div>
      <div className="metric-value" style={{ fontSize: 18, color }}>{value}</div>
      {hint && <div style={{ fontSize: 11, color: 'var(--brave-gray)', marginTop: 2 }}>{hint}</div>}
    </div>
  )
}
