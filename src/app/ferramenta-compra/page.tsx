'use client'
import { useEffect, useMemo, useState } from 'react'
import Shell from '@/components/Shell'
import { parseVendas, analyze, packRows, LOJAS, type SkuRow, type Periodo, type Situacao, type LojaKey } from '@/lib/compra-rede'

const fmtInt = (v: number | null) => v == null ? '—' : new Intl.NumberFormat('pt-BR').format(Math.round(v))
const fmt1 = (v: number | null) => v == null ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const fmtBRL = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

const SIT_COLOR: Record<Situacao, string> = {
  'COMPRAR - URGENTE': '#c0392b', 'SUMIU DA PRATELEIRA': '#c98a14', 'COMPRAR': '#b58b00',
  'OK': '#1a7a4a', 'SOBRANDO': '#2b6cb0', 'PARADO': '#8d99ae', 'ERRO DE CADASTRO': '#7c3aed', 'ESTOQUE NÃO INFORMADO': '#8d99ae',
}
const CONF_COLOR: Record<string, string> = { 'ESTÁVEL': '#1a7a4a', 'IRREGULAR': '#b58b00', 'MUITO IRREGULAR': '#c0392b', 'ESPORÁDICO': '#8d99ae' }
const SITUACOES: Situacao[] = ['COMPRAR - URGENTE', 'SUMIU DA PRATELEIRA', 'COMPRAR', 'SOBRANDO', 'PARADO', 'OK', 'ERRO DE CADASTRO', 'ESTOQUE NÃO INFORMADO']
const MAX_LINHAS = 400

type Loaded = { skus: SkuRow[]; periodo: Periodo; total: number; importId?: number; fileName?: string | null; createdAt?: string }
type HistRow = { id: number; loja: string; janela: string | null; fileName: string | null; produtos: number; active: boolean; createdAt: string }

const fmtDataHora = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
const sha256hex = async (buf: ArrayBuffer) => {
  const h = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export default function FerramentaCompra() {
  const [loaded, setLoaded] = useState<Record<string, Loaded | null>>({})
  const [diasAlvo, setDiasAlvo] = useState(10)
  const [viewKey, setViewKey] = useState<LojaKey | null>(null)
  const [exporting, setExporting] = useState(false)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [toast, setToast] = useState('')
  const [filtro, setFiltro] = useState<'todos' | Situacao>('todos')
  const [busca, setBusca] = useState('')
  const [historico, setHistorico] = useState<HistRow[]>([])
  const [carregando, setCarregando] = useState(true)
  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(''), 6000) }

  // um input de arquivo por loja — sem estado compartilhado entre cartões
  const pickFile = (key: LojaKey) => { document.getElementById(`file-${key}`)?.click() }

  const fetchHistorico = () =>
    fetch('/api/compra/historico').then(r => r.json()).then(d => setHistorico(d.historico ?? [])).catch(() => {})

  // Carrega os dados JÁ SALVOS ao abrir a página (o cliente não precisa re-subir nada)
  useEffect(() => {
    fetch('/api/compra/dados').then(r => r.json()).then(d => {
      const next: Record<string, Loaded | null> = {}
      for (const s of (d.stores ?? [])) {
        const skus: SkuRow[] = (s.rows ?? []).map((r: [string, string, number | null, number[], number[]]) => ({
          cod: String(r[0]), nome: String(r[1] ?? ''), estoque: r[2] == null ? null : Number(r[2]),
          q: Array.isArray(r[3]) ? r[3].map(Number) : [0, 0, 0, 0, 0, 0],
          v: Array.isArray(r[4]) ? r[4].map(Number) : [0, 0, 0, 0, 0, 0],
        }))
        next[s.loja] = {
          skus, total: skus.length, importId: s.importId, fileName: s.fileName, createdAt: s.createdAt,
          periodo: (s.periodo as Periodo) ?? { p3: '1º trimestre', u3: 'trimestre recente', recente: 'mês recente', recenteAbbr: 'recente', janela: s.janela ?? '' },
        }
      }
      if (Object.keys(next).length > 0) {
        setLoaded(prev => ({ ...next, ...prev }))
        const first = LOJAS.find(l => next[l.key])
        if (first) setViewKey(k => k ?? first.key)
      }
      setCarregando(false)
    }).catch(() => setCarregando(false))
    fetchHistorico()
  }, [])

  const onFile = async (key: LojaKey, file: File) => {
    setBusyKey(key)
    try {
      const buf = await file.arrayBuffer()
      const res = parseVendas(buf)
      if (res.rows.length === 0) { showToast('Nenhum produto reconhecido no arquivo.'); setBusyKey(null); return }
      // Trava anti-troca: o relatório declara a filial no cabeçalho — recusa se não for a loja deste cartão
      const alvo = LOJAS.find(l => l.key === key)!
      if (res.filial != null && res.filial !== alvo.filial) {
        const certa = LOJAS.find(l => l.filial === res.filial)
        showToast(certa
          ? `⚠ Este arquivo é da filial ${res.filial} (${certa.tab}). Suba-o no cartão "${certa.tab}".`
          : `⚠ Este arquivo é da filial ${res.filial}, que não corresponde a "${alvo.tab}".`)
        setBusyKey(null); return
      }
      // Salva no sistema (trava de duplicidade por hash do arquivo é feita no servidor)
      const fileHash = await sha256hex(buf)
      const resp = await fetch('/api/compra/import', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loja: key, filial: res.filial, janela: res.periodo.janela, periodo: res.periodo,
          fileName: file.name, fileHash,
          rows: res.rows.map(r => [r.cod, r.nome, r.estoque, r.q, r.v]),
        }),
      })
      const data = await resp.json().catch(() => ({}))
      if (resp.status === 409) { showToast(`⚠ ${data.error ?? 'Arquivo já importado antes.'}`); setBusyKey(null); return }
      if (!resp.ok) { showToast(`Erro ao salvar: ${data.error ?? resp.status}`); setBusyKey(null); return }
      setLoaded(prev => ({ ...prev, [key]: { skus: res.rows, periodo: res.periodo, total: res.totalProdutos, importId: data.importId, fileName: file.name, createdAt: data.createdAt } }))
      setViewKey(key)
      fetchHistorico()
      showToast(`✓ ${alvo.tab}: ${res.totalProdutos} produtos importados e salvos (${res.periodo.janela || 'período do relatório'})`)
    } catch {
      showToast('Erro ao ler o arquivo. Envie o relatório em .xlsx.')
    }
    setBusyKey(null)
  }

  const removerImport = async (key: LojaKey) => {
    const ld = loaded[key]
    if (!ld?.importId) return
    if (!confirm(`Remover os dados salvos da loja ${LOJAS.find(l => l.key === key)?.tab}?`)) return
    const r = await fetch(`/api/compra/import/${ld.importId}`, { method: 'DELETE' })
    if (!r.ok) { showToast('Erro ao remover'); return }
    setLoaded(prev => ({ ...prev, [key]: null }))
    setViewKey(k => (k === key ? null : k))
    fetchHistorico()
    showToast('Dados da loja removidos')
  }

  // análise por loja carregada (recalcula com diasAlvo)
  const analysisByStore = useMemo(() => {
    const out: Record<string, ReturnType<typeof analyze>> = {}
    for (const l of LOJAS) { const ld = loaded[l.key]; if (ld) out[l.key] = analyze(ld.skus, diasAlvo) }
    return out
  }, [loaded, diasAlvo])

  const loadedKeys = LOJAS.filter(l => loaded[l.key]).map(l => l.key)
  const periodo = loadedKeys.length ? loaded[loadedKeys[0]]!.periodo : null

  const exportar = async () => {
    if (loadedKeys.length === 0) return
    setExporting(true)
    try {
      // payload compacto — o corpo da request tem limite de ~4,5 MB na Vercel
      const stores = loadedKeys.map(k => ({ key: k, rows: packRows(analysisByStore[k].rows) }))
      const res = await fetch('/api/compra/export', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ diasAlvo, periodo, stores }),
      })
      if (!res.ok) { showToast('Erro ao gerar o Excel'); setExporting(false); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = 'Ferramenta_Compra_Rede.xlsx'
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
    } catch { showToast('Erro ao gerar o Excel') }
    setExporting(false)
  }

  const detail = viewKey ? analysisByStore[viewKey] : null
  const filtered = useMemo(() => {
    if (!detail) return []
    const b = busca.trim().toLowerCase()
    return detail.rows.filter(r =>
      (filtro === 'todos' || r.situacao === filtro) &&
      (!b || r.nome.toLowerCase().includes(b) || r.cod.includes(b))
    )
  }, [detail, filtro, busca])

  return (
    <Shell>
      {LOJAS.map(l => (
        <input key={l.key} id={`file-${l.key}`} data-testid={`file-${l.key}`} type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) onFile(l.key, f); e.target.value = '' }} />
      ))}

      <div className="page-header flex-between">
        <div>
          <div className="page-eyebrow">Módulo · Suprimentos</div>
          <h1 className="page-title">Sugestão de Compra por Item</h1>
          <p className="page-subtitle">
            Suba o relatório de vendas (&quot;Vários Períodos&quot;) de cada loja. A ferramenta calcula
            <b> quanto comprar</b> por produto e exporta o arquivo Excel completo (7 abas), igual ao modelo.
          </p>
        </div>
        <div className="flex gap-2" style={{ alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <div>
            <label style={{ fontSize: 10, color: 'var(--brave-gray)', display: 'block', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>Dias de estoque</label>
            <input type="number" min={1} value={diasAlvo} onChange={e => setDiasAlvo(Math.max(1, parseInt(e.target.value) || 1))} className="form-input" style={{ width: 80 }} />
          </div>
          <button className="btn btn-primary" onClick={exportar} disabled={exporting || loadedKeys.length === 0}>
            {exporting ? 'Gerando...' : `⬇ Exportar Excel${loadedKeys.length ? ` (${loadedKeys.length}/5)` : ''}`}
          </button>
        </div>
      </div>

      {/* Slots de upload por loja */}
      <div className="metrics-grid mb-6" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
        {LOJAS.map(l => {
          const ld = loaded[l.key]
          const an = analysisByStore[l.key]
          const busy = busyKey === l.key
          const isView = viewKey === l.key
          return (
            <div key={l.key} className="metric-card" style={{ cursor: 'pointer', border: isView ? '2px solid var(--brave-yellow)' : ld ? '1px solid #1a7a4a' : undefined }}
              onClick={() => ld ? setViewKey(l.key) : pickFile(l.key)}>
              <div className="metric-accent" style={{ background: ld ? '#1a7a4a' : 'var(--brave-gray)' }} />
              <div className="metric-label">{l.tab}</div>
              {busy ? (
                <div style={{ fontSize: 13, color: 'var(--brave-gray)', marginTop: 6 }}>⏳ lendo...</div>
              ) : ld && an ? (
                <>
                  <div className="metric-value" style={{ fontSize: 17 }}>{fmtInt(ld.total)}</div>
                  <div style={{ fontSize: 10, color: 'var(--brave-gray)', marginTop: 2 }}>produtos · {ld.periodo.janela}</div>
                  {ld.createdAt && (
                    <div style={{ fontSize: 9, color: '#1a7a4a', marginTop: 2 }}>💾 salvo em {fmtDataHora(ld.createdAt)}</div>
                  )}
                  <div style={{ fontSize: 10, marginTop: 4 }}>
                    <span style={{ color: '#c0392b', fontWeight: 600 }}>{an.summary.comprarUrgente} urgente</span>
                    {' · '}<span style={{ color: '#b58b00', fontWeight: 600 }}>{an.summary.comprar} comprar</span>
                  </div>
                  <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
                    <button className="btn btn-secondary btn-sm" style={{ fontSize: 11 }} onClick={e => { e.stopPropagation(); pickFile(l.key) }}>trocar</button>
                    <button className="btn btn-danger btn-sm" style={{ fontSize: 11 }} title="Remover dados salvos desta loja" onClick={e => { e.stopPropagation(); removerImport(l.key) }}>remover</button>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 26, marginTop: 6, color: 'var(--brave-gray)' }}>＋</div>
                  <div style={{ fontSize: 11, color: 'var(--brave-gray)', marginTop: 4 }}>subir relatório</div>
                </>
              )}
            </div>
          )
        })}
      </div>

      {loadedKeys.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📦</div>
          <div style={{ fontFamily: 'var(--font-sub)', fontWeight: 600, fontSize: 15 }}>
            {carregando ? 'Carregando dados salvos...' : 'Nenhum relatório carregado'}
          </div>
          {!carregando && (
            <div style={{ color: 'var(--brave-gray)', fontSize: 13, marginTop: 6 }}>
              Clique numa loja acima e suba o relatório &quot;Vendas - Vários Períodos&quot; dela. Os dados ficam
              salvos no sistema — só é preciso subir de novo quando houver relatório novo.
            </div>
          )}
        </div>
      ) : detail && viewKey ? (
        <>
          <div className="card mb-6" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ fontFamily: 'var(--font-sub)', fontWeight: 700, fontSize: 14 }}>{LOJAS.find(l => l.key === viewKey)?.tab}</div>
            <span style={{ fontSize: 12, color: 'var(--brave-gray)' }}>{periodo?.janela} · demanda pelos últimos 3 meses</span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <select className="form-select" style={{ width: 210 }} value={filtro} onChange={e => setFiltro(e.target.value as 'todos' | Situacao)}>
                <option value="todos">Todas as situações</option>
                {SITUACOES.map(sit => <option key={sit} value={sit}>{sit}</option>)}
              </select>
              <input className="form-input" style={{ width: 240 }} placeholder="Buscar produto/código..." value={busca} onChange={e => setBusca(e.target.value)} />
            </div>
          </div>

          <div className="metrics-grid mb-6" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
            <div className="metric-card"><div className="metric-label">Produtos</div><div className="metric-value" style={{ fontSize: 18 }}>{fmtInt(detail.summary.totalSkus)}</div></div>
            <div className="metric-card"><div className="metric-accent" style={{ background: '#c0392b' }} /><div className="metric-label">Comprar urgente</div><div className="metric-value" style={{ fontSize: 18, color: '#c0392b' }}>{fmtInt(detail.summary.comprarUrgente)}</div></div>
            <div className="metric-card"><div className="metric-accent" style={{ background: '#c98a14' }} /><div className="metric-label">Sumiu da prateleira</div><div className="metric-value" style={{ fontSize: 18, color: '#c98a14' }}>{fmtInt(detail.summary.sumiu)}</div></div>
            <div className="metric-card"><div className="metric-accent" style={{ background: '#b58b00' }} /><div className="metric-label">Comprar</div><div className="metric-value" style={{ fontSize: 18, color: '#b58b00' }}>{fmtInt(detail.summary.comprar)}</div></div>
            <div className="metric-card"><div className="metric-label">A comprar (un)</div><div className="metric-value" style={{ fontSize: 18 }}>{fmtInt(detail.summary.totalComprarUn)}</div>{(detail.summary.negativos + detail.summary.semEstoque) > 0 && <div style={{ fontSize: 10, color: '#c0392b', marginTop: 2 }}>{detail.summary.negativos} neg · {detail.summary.semEstoque} s/ estoque</div>}</div>
          </div>

          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--brave-light)', fontSize: 12, color: 'var(--brave-gray)' }}>
              {fmtInt(filtered.length)} linhas{filtered.length > MAX_LINHAS ? ` · mostrando ${MAX_LINHAS} (exporte p/ ver todas)` : ''}
            </div>
            <div className="table-wrap" style={{ maxHeight: '60vh' }}>
              <table>
                <thead style={{ position: 'sticky', top: 0, background: 'var(--brave-white)' }}>
                  <tr>
                    <th>Código</th><th>Produto</th>
                    <th style={{ textAlign: 'right' }}>{periodo?.p3 ?? 'tri 1'}</th>
                    <th style={{ textAlign: 'right' }}>{periodo?.u3 ?? 'tri 2'}</th>
                    <th style={{ textAlign: 'right' }}>{periodo?.recenteAbbr ?? 'recente'}</th>
                    <th style={{ textAlign: 'right' }}>Tend.</th><th style={{ textAlign: 'right' }}>Sai/dia</th>
                    <th style={{ textAlign: 'right' }}>Estoque</th><th style={{ textAlign: 'right' }}>Dias</th>
                    <th style={{ textAlign: 'right' }}>Ideal</th><th style={{ textAlign: 'right' }}>COMPRAR</th>
                    <th>Confiança</th><th>Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, MAX_LINHAS).map(r => (
                    <tr key={r.cod}>
                      <td style={{ fontSize: 11, color: 'var(--brave-gray)' }}>{r.cod}</td>
                      <td style={{ fontSize: 12, maxWidth: 260 }}>{r.nome || '—'}</td>
                      <td style={{ textAlign: 'right', fontSize: 12 }}>{fmt1(r.p3)}</td>
                      <td style={{ textAlign: 'right', fontSize: 12 }}>{fmt1(r.u3)}</td>
                      <td style={{ textAlign: 'right', fontSize: 12 }}>{fmt1(r.junho)}</td>
                      <td style={{ textAlign: 'right', fontSize: 12, color: r.tendencia != null && r.tendencia >= 1 ? '#1a7a4a' : '#c0392b' }}>{r.tendencia == null ? '—' : `${fmt1(r.tendencia)}×`}</td>
                      <td style={{ textAlign: 'right', fontSize: 12 }}>{fmt1(r.saiDia)}</td>
                      <td style={{ textAlign: 'right', fontSize: 12, color: r.estoque != null && r.estoque < 0 ? '#c0392b' : undefined }}>{r.estoque == null ? '—' : fmtInt(r.estoque)}</td>
                      <td style={{ textAlign: 'right', fontSize: 12, color: 'var(--brave-gray)' }}>{r.diasEstoque == null ? '—' : fmtInt(r.diasEstoque)}</td>
                      <td style={{ textAlign: 'right', fontSize: 12 }}>{fmtInt(r.estoqueIdeal)}</td>
                      <td style={{ textAlign: 'right', fontSize: 12, fontWeight: 700, color: (r.comprar ?? 0) > 0 ? '#c0392b' : 'var(--brave-gray)' }}>{r.comprar == null ? '—' : fmtInt(r.comprar)}</td>
                      <td><span style={{ fontSize: 10, fontWeight: 600, color: CONF_COLOR[r.confianca] }}>{r.confianca}</span></td>
                      <td><span style={{ fontSize: 10, fontWeight: 700, color: SIT_COLOR[r.situacao] }}>{r.situacao}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ fontSize: 11, color: 'var(--brave-gray)', marginTop: 12, lineHeight: 1.6 }}>
            <strong>O que esta ferramenta não sabe:</strong> custo unitário e categoria (vêm do Relatório de Entrada),
            transferências entre lojas, múltiplo de embalagem e lead time. O estoque é a posição do instante do relatório.
            A demanda usa os <b>últimos 3 meses</b> da janela ({periodo?.janela}). O total em R$ (Faturamento{' '}
            {fmtBRL(detail.rows.reduce((a, r) => a + r.faturamento6, 0))}) é a soma do período.
          </div>
        </>
      ) : null}

      {/* Histórico de importações */}
      {historico.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden', marginTop: 24 }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--brave-light)' }}>
            <div className="card-eyebrow">Histórico</div>
            <div style={{ fontFamily: 'var(--font-sub)', fontWeight: 600, fontSize: 13 }}>Importações realizadas ({historico.length})</div>
          </div>
          <div className="table-wrap" style={{ maxHeight: 280 }}>
            <table>
              <thead>
                <tr>
                  <th>Quando</th><th>Loja</th><th>Arquivo</th><th>Período</th>
                  <th style={{ textAlign: 'right' }}>Produtos</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {historico.map(h => (
                  <tr key={h.id} style={{ opacity: h.active ? 1 : 0.55 }}>
                    <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{fmtDataHora(h.createdAt)}</td>
                    <td style={{ fontSize: 12, fontWeight: 600 }}>{LOJAS.find(l => l.key === h.loja)?.tab ?? h.loja}</td>
                    <td style={{ fontSize: 11, color: 'var(--brave-gray)', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.fileName ?? '—'}</td>
                    <td style={{ fontSize: 12 }}>{h.janela ?? '—'}</td>
                    <td style={{ fontSize: 12, textAlign: 'right' }}>{fmtInt(h.produtos)}</td>
                    <td>
                      {h.active
                        ? <span style={{ fontSize: 10, fontWeight: 700, color: '#1a7a4a', background: '#e8f5e9', borderRadius: 4, padding: '2px 8px' }}>ATIVO</span>
                        : <span style={{ fontSize: 10, color: 'var(--brave-gray)', background: 'var(--brave-light)', borderRadius: 4, padding: '2px 8px' }}>substituído</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </Shell>
  )
}
