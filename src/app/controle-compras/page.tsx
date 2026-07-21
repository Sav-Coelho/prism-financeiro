'use client'
import { useEffect, useMemo, useState } from 'react'
import Shell from '@/components/Shell'
import {
  ComposedChart, Bar, Line, BarChart, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine, Cell,
} from 'recharts'

type Tab = 'dashboard' | 'pedidos' | 'config'
interface Comprador { id: number; nome: string; limite: number; setor: string | null; ativo: boolean }
interface Pedido { id: number; comprador: string; fornecedor: string | null; tipo: string | null; categoria: string | null; dataPedido: string; valor: number; parcelas: number; primeiraDias: number; intervaloDias: number; status: string }
interface Config { compradores: Comprador[]; categorias: string[]; settings: Record<string, number>; receitaRef: { ym: string | null; value: number } }
interface Analytics {
  refLabel: string; receitaRef: { ym: string | null; value: number }; metaCmvPct: number; limiteCmvMensal: number
  limiteTotal: number; compradoTotalMes: number; saldoTotal: number; cmvAtualPct: number
  resumoCompradores: { nome: string; setor: string | null; limite: number; comprado: number; saldo: number; util: number; status: string }[]
  categorias: string[]; months: string[]; projecao: Record<string, number | string>[]; porCategoria: { categoria: string; total: number }[]; comprometidoTotal: number; nPedidos: number
}

const C = { navy: '#2b2d42', navyMid: '#0f1c2f', yellow: '#eaca2d', gold: '#d59f07', line: '#edf2f4', textSoft: '#505168', textMuted: '#8d99ae', green: '#1a7a4a', red: '#c0392b', amber: '#c98a14' }
const CAT_COLORS = ['#2b2d42', '#eaca2d', '#197a4a', '#b03022', '#2f5a96', '#d4a017', '#7a869a', '#5b8c5a', '#8a5a2b', '#6a5acd', '#b5651d', '#2e8b8b']
const fmt = (n: number) => (n < 0 ? '−' : '') + 'R$ ' + Math.abs(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtK = (n: number) => { const a = Math.abs(n); return (n < 0 ? '−' : '') + (a >= 1e6 ? `${(a / 1e6).toFixed(1)}M` : a >= 1e3 ? `${(a / 1e3).toFixed(0)}k` : a.toFixed(0)) }
const pct = (n: number) => `${(n * 100).toFixed(1)}%`

export default function ControleCompras() {
  const [tab, setTab] = useState<Tab>('dashboard')
  const [cfg, setCfg] = useState<Config | null>(null)
  const [an, setAn] = useState<Analytics | null>(null)
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')
  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(''), 3000) }

  const load = async () => {
    setLoading(true)
    const [c, a, p] = await Promise.all([
      fetch('/api/compras/config').then(r => r.json()),
      fetch('/api/compras/analytics').then(r => r.json()),
      fetch('/api/compras/pedidos').then(r => r.json()),
    ])
    setCfg(c); setAn(a); setPedidos(p.pedidos ?? []); setLoading(false)
  }
  useEffect(() => { load() }, [])

  return (
    <Shell>
      <div className="page-header">
        <div>
          <div className="page-eyebrow">Módulo · Suprimentos</div>
          <h1 className="page-title">Controle de Compras</h1>
          <p className="page-subtitle">
            Lance os pedidos com prazo e parcelas. A ferramenta mostra o limite por comprador e a
            <b> projeção de pagamentos comprometidos</b> mês a mês — quanto do caixa de compras já está tomado à frente.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {([['dashboard', 'Dashboard'], ['pedidos', 'Pedidos'], ['config', 'Config']] as [Tab, string][]).map(([k, l]) => (
            <button key={k} className={tab === k ? 'btn btn-primary' : 'btn'} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>
      </div>

      {loading || !an || !cfg ? (
        <div className="empty-state"><div className="empty-state-icon">◌</div><div className="empty-state-title">Carregando…</div></div>
      ) : (
        <>
          {tab === 'dashboard' && <Dashboard an={an} />}
          {tab === 'pedidos' && <Pedidos cfg={cfg} pedidos={pedidos} onChange={load} showToast={showToast} />}
          {tab === 'config' && <ConfigPanel cfg={cfg} an={an} onChange={load} showToast={showToast} />}
        </>
      )}
      {toast && <div className="toast">{toast}</div>}
    </Shell>
  )
}

// ─────────────────────────── DASHBOARD ───────────────────────────
function Dashboard({ an }: { an: Analytics }) {
  const tooltipStyle = { contentStyle: { background: C.navy, border: 'none', borderRadius: 4, fontSize: 12 }, labelStyle: { color: C.yellow, fontWeight: 600 }, itemStyle: { color: '#fff' } }
  const catColor = (i: number) => CAT_COLORS[i % CAT_COLORS.length]
  return (
    <>
      <div className="grid-5 mb-6">
        <Kpi label="Limite total (compradores)" value={fmt(an.limiteTotal)} color={C.navy} />
        <Kpi label={`Comprado em ${an.refLabel}`} value={fmt(an.compradoTotalMes)} color={C.gold} />
        <Kpi label="Saldo disponível" value={fmt(an.saldoTotal)} color={an.saldoTotal >= 0 ? C.green : C.red} />
        <Kpi label="CMV atual (% receita)" value={pct(an.cmvAtualPct)} sub={`meta ${pct(an.metaCmvPct)}`} color={an.cmvAtualPct <= an.metaCmvPct ? C.green : C.red} />
        <Kpi label={`Limite mensal p/ CMV`} value={fmt(an.limiteCmvMensal)} sub={an.receitaRef.value ? `${pct(an.metaCmvPct)} de ${fmtK(an.receitaRef.value)}` : 'sem receita na DRE'} color={C.navyMid} />
      </div>

      {/* PROJEÇÃO — o gráfico central */}
      <div className="card card-accent-yellow mb-6">
        <div className="card-header">
          <div>
            <div className="card-eyebrow">Projeção de pagamentos de compras</div>
            <div className="card-title">Comprometido por mês (empilhado por categoria) × limite CMV</div>
          </div>
        </div>
        <p style={{ fontSize: 12, color: C.textMuted, marginBottom: 12, lineHeight: 1.6 }}>
          Cada barra é o total de parcelas de compras que vencem no mês. A linha tracejada é o limite mensal de compras
          ({pct(an.metaCmvPct)} da receita). Barra acima da linha = mês já comprometido além do saudável.
        </p>
        <ResponsiveContainer width="100%" height={360}>
          <ComposedChart data={an.projecao} margin={{ top: 8, right: 20, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.line} />
            <XAxis dataKey="mes" tick={{ fontSize: 11, fill: C.textSoft }} stroke={C.line} />
            <YAxis tick={{ fontSize: 10, fill: C.textSoft }} stroke={C.line} tickFormatter={fmtK} />
            <Tooltip {...tooltipStyle} formatter={(v: number, n: string) => [fmt(v), n]} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            {an.categorias.map((cat, i) => (
              <Bar key={cat} dataKey={cat} stackId="a" fill={catColor(i)} radius={i === an.categorias.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]} />
            ))}
            {an.limiteCmvMensal > 0 && (
              <ReferenceLine y={an.limiteCmvMensal} stroke={C.red} strokeDasharray="6 4" strokeWidth={2}
                label={{ value: `Limite CMV ${fmtK(an.limiteCmvMensal)}`, position: 'insideTopRight', fill: C.red, fontSize: 11, fontWeight: 600 }} />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="grid-2 mb-6">
        {/* Resumo por comprador */}
        <div className="card">
          <div className="card-eyebrow">Limite por comprador</div>
          <div className="card-title" style={{ fontSize: 14, marginBottom: 12 }}>Comprado × limite em {an.refLabel}</div>
          <div className="table-wrap">
            <table>
              <thead><tr><th style={{ textAlign: 'left' }}>Comprador</th><th style={{ textAlign: 'right' }}>Limite</th><th style={{ textAlign: 'right' }}>Comprado</th><th style={{ minWidth: 120 }}>Utilização</th><th>Status</th></tr></thead>
              <tbody>
                {an.resumoCompradores.map(c => (
                  <tr key={c.nome}>
                    <td style={{ fontWeight: 600, color: C.navy }}>{c.nome}<div style={{ fontSize: 10, color: C.textMuted }}>{c.setor}</div></td>
                    <td style={{ textAlign: 'right', fontSize: 12 }}>{fmtK(c.limite)}</td>
                    <td style={{ textAlign: 'right', fontSize: 12 }}>{fmtK(c.comprado)}</td>
                    <td>
                      <div style={{ background: '#eef2f8', borderRadius: 3, height: 16, position: 'relative', overflow: 'hidden' }}>
                        <div style={{ position: 'absolute', inset: 0, width: `${Math.min(100, c.util * 100)}%`, background: c.util > 1 ? C.red : c.util > 0.9 ? C.amber : C.green }} />
                        <span style={{ position: 'relative', fontSize: 10, color: C.navy, fontWeight: 600, paddingLeft: 6, lineHeight: '16px' }}>{pct(c.util)}</span>
                      </div>
                    </td>
                    <td style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{c.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Comprometido por categoria */}
        <div className="card">
          <div className="card-eyebrow">Comprometido à frente</div>
          <div className="card-title" style={{ fontSize: 14, marginBottom: 12 }}>Total por categoria (horizonte) — {fmt(an.comprometidoTotal)}</div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={an.porCategoria} layout="vertical" margin={{ left: 20, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.line} />
              <XAxis type="number" tick={{ fontSize: 10, fill: C.textSoft }} stroke={C.line} tickFormatter={fmtK} />
              <YAxis type="category" dataKey="categoria" tick={{ fontSize: 10, fill: C.textSoft }} stroke={C.line} width={130} />
              <Tooltip {...tooltipStyle} formatter={(v: number) => fmt(v)} />
              <Bar dataKey="total" radius={[0, 3, 3, 0]}>{an.porCategoria.map((_, i) => <Cell key={i} fill={CAT_COLORS[i % CAT_COLORS.length]} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </>
  )
}

// ─────────────────────────── PEDIDOS ───────────────────────────
function Pedidos({ cfg, pedidos, onChange, showToast }: { cfg: Config; pedidos: Pedido[]; onChange: () => void; showToast: (m: string) => void }) {
  const hoje = new Date().toISOString().slice(0, 10)
  const [f, setF] = useState({ comprador: cfg.compradores[0]?.nome ?? '', fornecedor: '', tipo: 'Externo', categoria: cfg.categorias[0] ?? '', dataPedido: hoje, valor: '', parcelas: '1', primeiraDias: '30', intervaloDias: '30', status: 'Pendente' })
  const [busy, setBusy] = useState(false)
  const set = (k: string, v: string) => setF(p => ({ ...p, [k]: v }))

  // preview dos vencimentos
  const preview = useMemo(() => {
    const n = Math.max(1, Math.round(+f.parcelas || 1)); const val = +f.valor || 0
    const base = new Date(f.dataPedido + 'T00:00:00Z').getTime()
    if (!val) return ''
    return Array.from({ length: n }, (_, k) => {
      const d = new Date(base + ((+f.primeiraDias || 0) + k * (+f.intervaloDias || 0)) * 86400000)
      return `${String(d.getUTCDate()).padStart(2, '0')}/${d.getUTCMonth() + 1}`
    }).join(' · ') + `  (${n}× ${fmtK(val / n)})`
  }, [f])

  const add = async () => {
    if (!f.comprador || !f.valor) { showToast('Comprador e valor obrigatórios'); return }
    setBusy(true)
    const r = await fetch('/api/compras/pedidos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...f, valor: +f.valor, parcelas: +f.parcelas, primeiraDias: +f.primeiraDias, intervaloDias: +f.intervaloDias }) })
    setBusy(false)
    if (!r.ok) { showToast('Erro ao salvar'); return }
    setF(p => ({ ...p, fornecedor: '', valor: '' })); showToast('✓ Pedido lançado'); onChange()
  }
  const del = async (id: number) => { if (!confirm('Remover este pedido?')) return; await fetch('/api/compras/pedidos/' + id, { method: 'DELETE' }); showToast('Removido'); onChange() }

  const inp: React.CSSProperties = { padding: '7px 9px', border: `1px solid ${C.line}`, borderRadius: 4, fontSize: 13, width: '100%' }
  return (
    <>
      <div className="card mb-6">
        <div className="card-eyebrow">Novo pedido</div>
        <div className="card-title" style={{ fontSize: 14, marginBottom: 14 }}>Lançar pedido de compra</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          <Field label="Comprador"><select className="form-select" value={f.comprador} onChange={e => set('comprador', e.target.value)}>{cfg.compradores.map(c => <option key={c.id} value={c.nome}>{c.nome}</option>)}</select></Field>
          <Field label="Fornecedor"><input style={inp} value={f.fornecedor} onChange={e => set('fornecedor', e.target.value)} placeholder="Ex.: Fornecedor X" /></Field>
          <Field label="Tipo"><select className="form-select" value={f.tipo} onChange={e => set('tipo', e.target.value)}>{['Externo', 'Local', 'Frete'].map(t => <option key={t}>{t}</option>)}</select></Field>
          <Field label="Categoria"><select className="form-select" value={f.categoria} onChange={e => set('categoria', e.target.value)}>{cfg.categorias.map(c => <option key={c}>{c}</option>)}</select></Field>
          <Field label="Data do pedido"><input style={inp} type="date" value={f.dataPedido} onChange={e => set('dataPedido', e.target.value)} /></Field>
          <Field label="Valor total (R$)"><input style={inp} type="number" value={f.valor} onChange={e => set('valor', e.target.value)} placeholder="0,00" /></Field>
          <Field label="Nº parcelas"><input style={inp} type="number" min={1} value={f.parcelas} onChange={e => set('parcelas', e.target.value)} /></Field>
          <Field label="Status"><select className="form-select" value={f.status} onChange={e => set('status', e.target.value)}>{['Pendente', 'Parcial', 'Pago'].map(s => <option key={s}>{s}</option>)}</select></Field>
          <Field label="1ª parcela (dias)"><input style={inp} type="number" value={f.primeiraDias} onChange={e => set('primeiraDias', e.target.value)} /></Field>
          <Field label="Intervalo (dias)"><input style={inp} type="number" value={f.intervaloDias} onChange={e => set('intervaloDias', e.target.value)} /></Field>
          <div style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'flex-end' }}>
            <button className="btn btn-primary" disabled={busy} onClick={add} style={{ width: '100%' }}>{busy ? '…' : '+ Lançar pedido'}</button>
          </div>
        </div>
        {preview && <div style={{ marginTop: 12, fontSize: 12, color: C.textSoft }}>📅 Vencimentos: <b>{preview}</b></div>}
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: `1px solid ${C.line}` }}><div className="card-title" style={{ fontSize: 14 }}>{pedidos.length} pedidos lançados</div></div>
        <div className="table-wrap" style={{ maxHeight: '60vh' }}>
          <table>
            <thead style={{ position: 'sticky', top: 0 }}><tr><th style={{ textAlign: 'left' }}>Data</th><th style={{ textAlign: 'left' }}>Comprador</th><th style={{ textAlign: 'left' }}>Fornecedor</th><th style={{ textAlign: 'left' }}>Categoria</th><th style={{ textAlign: 'right' }}>Valor</th><th>Parcelas</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {pedidos.map(p => (
                <tr key={p.id}>
                  <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{new Date(p.dataPedido).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}</td>
                  <td style={{ fontSize: 12, fontWeight: 600, color: C.navy }}>{p.comprador}</td>
                  <td style={{ fontSize: 12 }}>{p.fornecedor || '—'}</td>
                  <td style={{ fontSize: 11, color: C.textMuted }}>{p.categoria || '—'}</td>
                  <td style={{ textAlign: 'right', fontSize: 12, fontWeight: 600 }}>{fmt(p.valor)}</td>
                  <td style={{ textAlign: 'center', fontSize: 11 }}>{p.parcelas}× <span style={{ color: C.textMuted }}>({p.primeiraDias}/{p.intervaloDias}d)</span></td>
                  <td style={{ textAlign: 'center', fontSize: 11 }}>{p.status}</td>
                  <td style={{ textAlign: 'center' }}><button className="btn btn-sm btn-danger" onClick={() => del(p.id)}>×</button></td>
                </tr>
              ))}
              {!pedidos.length && <tr><td colSpan={8} style={{ textAlign: 'center', padding: 32, color: C.textMuted }}>Nenhum pedido lançado ainda.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

// ─────────────────────────── CONFIG ───────────────────────────
function ConfigPanel({ cfg, an, onChange, showToast }: { cfg: Config; an: Analytics; onChange: () => void; showToast: (m: string) => void }) {
  const [novaCat, setNovaCat] = useState('')
  const [novoComp, setNovoComp] = useState({ nome: '', limite: '', setor: '' })
  const post = async (body: unknown) => { const r = await fetch('/api/compras/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); if (!r.ok) showToast('Erro'); else onChange() }
  const inp: React.CSSProperties = { padding: '6px 9px', border: `1px solid ${C.line}`, borderRadius: 4, fontSize: 13 }

  return (
    <div className="grid-2">
      <div className="card">
        <div className="card-eyebrow">Compradores</div>
        <div className="card-title" style={{ fontSize: 14, marginBottom: 12 }}>Limite mensal por comprador</div>
        <div className="table-wrap">
          <table>
            <thead><tr><th style={{ textAlign: 'left' }}>Nome</th><th style={{ textAlign: 'left' }}>Setor</th><th style={{ textAlign: 'right' }}>Limite (R$)</th><th>Ativo</th><th></th></tr></thead>
            <tbody>
              {cfg.compradores.map(c => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 600, color: C.navy }}>{c.nome}</td>
                  <td style={{ fontSize: 12, color: C.textMuted }}>{c.setor || '—'}</td>
                  <td style={{ textAlign: 'right' }}>
                    <input style={{ ...inp, width: 110, textAlign: 'right' }} type="number" defaultValue={c.limite}
                      onBlur={e => { const v = +e.target.value; if (v !== c.limite) post({ kind: 'comprador', op: 'upsert', data: { ...c, limite: v } }) }} />
                  </td>
                  <td style={{ textAlign: 'center' }}><input type="checkbox" defaultChecked={c.ativo} onChange={e => post({ kind: 'comprador', op: 'upsert', data: { ...c, ativo: e.target.checked } })} /></td>
                  <td style={{ textAlign: 'center' }}><button className="btn btn-sm btn-danger" onClick={() => post({ kind: 'comprador', op: 'delete', data: { id: c.id } })}>×</button></td>
                </tr>
              ))}
              {!cfg.compradores.length && <tr><td colSpan={5} style={{ textAlign: 'center', padding: 20, color: C.textMuted }}>Nenhum comprador cadastrado — adicione abaixo.</td></tr>}
            </tbody>
          </table>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <input style={{ ...inp, flex: 1, minWidth: 100 }} placeholder="Nome" value={novoComp.nome} onChange={e => setNovoComp(p => ({ ...p, nome: e.target.value }))} />
          <input style={{ ...inp, width: 100 }} placeholder="Setor" value={novoComp.setor} onChange={e => setNovoComp(p => ({ ...p, setor: e.target.value }))} />
          <input style={{ ...inp, width: 110 }} type="number" placeholder="Limite" value={novoComp.limite} onChange={e => setNovoComp(p => ({ ...p, limite: e.target.value }))} />
          <button className="btn btn-primary btn-sm" onClick={() => { if (novoComp.nome) { post({ kind: 'comprador', op: 'upsert', data: { nome: novoComp.nome, setor: novoComp.setor, limite: +novoComp.limite || 0, ativo: true } }); setNovoComp({ nome: '', limite: '', setor: '' }) } }}>+ Adicionar</button>
        </div>
      </div>

      <div>
        <div className="card mb-6">
          <div className="card-eyebrow">Parâmetro</div>
          <div className="card-title" style={{ fontSize: 14, marginBottom: 12 }}>Meta de CMV / limite de compras</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input style={{ ...inp, width: 90 }} type="number" step={1} defaultValue={Math.round((an.metaCmvPct) * 100)}
              onBlur={e => { const v = (+e.target.value) / 100; if (v !== an.metaCmvPct) post({ kind: 'setting', data: { key: 'metaCmvPct', value: v } }) }} />
            <span style={{ color: C.textSoft, fontSize: 13 }}>% da receita = teto de compras por mês</span>
          </div>
          <div style={{ marginTop: 12, fontSize: 12, color: C.textMuted, lineHeight: 1.6 }}>
            Receita de referência (última da DRE{an.receitaRef.ym ? ` · ${an.receitaRef.ym}` : ''}): <b>{fmt(an.receitaRef.value)}</b><br />
            Limite mensal de compras: <b style={{ color: C.navy }}>{fmt(an.limiteCmvMensal)}</b>
          </div>
        </div>
        <div className="card">
          <div className="card-eyebrow">Categorias de compra</div>
          <div className="card-title" style={{ fontSize: 14, marginBottom: 12 }}>Lista usada nos pedidos e na projeção</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            {cfg.categorias.map(cat => (
              <span key={cat} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#eef2f8', borderRadius: 4, padding: '4px 8px', fontSize: 12, color: C.navy }}>
                {cat}<button onClick={() => post({ kind: 'categoria', op: 'delete', data: { nome: cat } })} style={{ border: 'none', background: 'none', color: C.red, cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>×</button>
              </span>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input style={{ ...inp, flex: 1 }} placeholder="Nova categoria" value={novaCat} onChange={e => setNovaCat(e.target.value)} />
            <button className="btn btn-primary btn-sm" onClick={() => { if (novaCat.trim()) { post({ kind: 'categoria', op: 'upsert', data: { nome: novaCat.trim() } }); setNovaCat('') } }}>+ Adicionar</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label style={{ display: 'block', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.textMuted, fontWeight: 600, marginBottom: 4 }}>{label}</label>{children}</div>
}
function Kpi({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div style={{ borderLeft: `3px solid ${color}`, paddingLeft: 14 }}>
      <div style={{ fontSize: 9, color: C.textMuted, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-title), serif', fontSize: 17, color, lineHeight: 1.15 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>{sub}</div>}
    </div>
  )
}
