'use client'
import { useMemo, useRef, useState } from 'react'
import Shell from '@/components/Shell'
import { parseVendas, analyze, exportXlsx, type AnalysisRow, type AnalysisSummary, type Situacao } from '@/lib/compra-rede'

const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
const fmtInt = (v: number | null) => v == null ? '—' : new Intl.NumberFormat('pt-BR').format(Math.round(v))
const fmt1 = (v: number | null) => v == null ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

const SIT_COLOR: Record<Situacao, string> = {
  'COMPRAR - URGENTE': '#c0392b',
  'COMPRAR': '#b58b00',
  'OK': '#1a7a4a',
  'SOBRANDO': '#2b6cb0',
  'PARADO': '#8d99ae',
  'ERRO DE CADASTRO': '#7c3aed',
}
const CONF_COLOR: Record<string, string> = {
  'ESTÁVEL': '#1a7a4a', 'IRREGULAR': '#b58b00', 'MUITO IRREGULAR': '#c0392b', 'ESPORÁDICO': '#8d99ae',
}

const SITUACOES: Situacao[] = ['COMPRAR - URGENTE', 'COMPRAR', 'OK', 'SOBRANDO', 'PARADO', 'ERRO DE CADASTRO']
const MAX_LINHAS = 400

export default function FerramentaCompra() {
  const [analysis, setAnalysis] = useState<{ rows: AnalysisRow[]; summary: AnalysisSummary } | null>(null)
  const [diasAlvo, setDiasAlvo] = useState(10)
  const [fileLabel, setFileLabel] = useState('')
  const [parsing, setParsing] = useState(false)
  const [drag, setDrag] = useState(false)
  const [toast, setToast] = useState('')
  const [warnings, setWarnings] = useState<string[]>([])
  const [filtro, setFiltro] = useState<'todos' | Situacao>('todos')
  const [busca, setBusca] = useState('')
  const rawRef = useRef<ReturnType<typeof parseVendas>['rows'] | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(''), 4000) }

  const handleFile = async (file: File) => {
    setParsing(true)
    try {
      const buf = await file.arrayBuffer()
      const res = parseVendas(buf)
      rawRef.current = res.rows
      setWarnings(res.warnings)
      setFileLabel(file.name.replace(/\.(xlsx|xls|csv)$/i, ''))
      if (res.rows.length === 0) {
        setAnalysis(null)
        showToast('Nenhum produto reconhecido no arquivo.')
      } else {
        setAnalysis(analyze(res.rows, diasAlvo))
        showToast(`✓ ${res.totalProdutos} produtos analisados`)
      }
    } catch {
      showToast('Erro ao ler o arquivo. Envie o relatório em .xlsx.')
    }
    setParsing(false)
  }

  // Recalcula ao mudar os dias-alvo (sem reparsear)
  const setDias = (d: number) => {
    setDiasAlvo(d)
    if (rawRef.current) setAnalysis(analyze(rawRef.current, d))
  }

  const filtered = useMemo(() => {
    if (!analysis) return []
    const b = busca.trim().toLowerCase()
    return analysis.rows.filter(r =>
      (filtro === 'todos' || r.situacao === filtro) &&
      (!b || r.nome.toLowerCase().includes(b) || r.cod.includes(b))
    )
  }, [analysis, filtro, busca])

  const s = analysis?.summary

  return (
    <Shell>
      <div className="page-header flex-between">
        <div>
          <div className="page-eyebrow">Módulo · Suprimentos</div>
          <h1 className="page-title">Sugestão de Compra por Item</h1>
          <p className="page-subtitle">
            Suba o relatório de vendas (&quot;Vários Períodos&quot;) e a ferramenta calcula, por produto,
            <b> quanto comprar</b> para cobrir os dias de estoque que você quer — e exporta em Excel.
          </p>
        </div>
        {analysis && (
          <button className="btn btn-primary" onClick={() => exportXlsx(analysis.rows, analysis.summary, diasAlvo, fileLabel)}>
            ⬇ Exportar Excel
          </button>
        )}
      </div>

      {/* Upload */}
      <div
        className={`upload-zone mb-6 ${drag ? 'drag' : ''}`}
        onDragOver={e => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f) }}
        onClick={() => fileRef.current?.click()}
      >
        <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }} />
        <div className="upload-icon">{parsing ? '⏳' : '🧮'}</div>
        <div className="upload-title">{parsing ? 'Lendo relatório...' : 'Importar relatório de vendas (Vários Períodos)'}</div>
        <div className="upload-sub">
          Clique ou arraste o arquivo <strong>.xlsx</strong> de uma loja. Nada é salvo no sistema — a análise
          é gerada na hora e você exporta em Excel.
        </div>
      </div>

      {warnings.length > 0 && (
        <div className="card mb-6" style={{ padding: '10px 16px', background: '#fffbea', border: '1px solid #f0c040', fontSize: 12, color: '#7a5c00' }}>
          {warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
        </div>
      )}

      {!analysis ? (
        <div className="card" style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📦</div>
          <div style={{ fontFamily: 'var(--font-sub)', fontWeight: 600, fontSize: 15 }}>Nenhum relatório carregado</div>
          <div style={{ color: 'var(--brave-gray)', fontSize: 13, marginTop: 6 }}>
            Suba o relatório &quot;Vendas - Vários Períodos&quot; de uma loja para gerar a análise.
          </div>
        </div>
      ) : (
        <>
          {/* Parâmetro global de dias-alvo */}
          <div className="card mb-6" style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <div>
              <div className="card-eyebrow">Parâmetro</div>
              <div style={{ fontFamily: 'var(--font-sub)', fontWeight: 600, fontSize: 14 }}>Quantos dias de estoque você quer ter?</div>
            </div>
            <input type="number" min={1} value={diasAlvo}
              onChange={e => setDias(Math.max(1, parseInt(e.target.value) || 1))}
              className="form-input" style={{ width: 90 }} />
            <span style={{ fontSize: 12, color: 'var(--brave-gray)', maxWidth: 460, lineHeight: 1.5 }}>
              Aplicado a todos os itens. A quantidade a comprar é consequência: <b>estoque ideal = venda/dia × dias</b>.
              (Alvo por categoria exige o Relatório de Entrada — pode vir depois.)
            </span>
          </div>

          {/* KPIs */}
          <div className="metrics-grid mb-6" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
            <div className="metric-card"><div className="metric-label">Produtos</div><div className="metric-value" style={{ fontSize: 18 }}>{fmtInt(s!.totalSkus)}</div></div>
            <div className="metric-card"><div className="metric-accent" style={{ background: '#c0392b' }} /><div className="metric-label">Comprar urgente</div><div className="metric-value" style={{ fontSize: 18, color: '#c0392b' }}>{fmtInt(s!.comprarUrgente)}</div><div style={{ fontSize: 11, color: 'var(--brave-gray)', marginTop: 2 }}>estoque zerado c/ demanda</div></div>
            <div className="metric-card"><div className="metric-accent" style={{ background: '#b58b00' }} /><div className="metric-label">Comprar</div><div className="metric-value" style={{ fontSize: 18, color: '#b58b00' }}>{fmtInt(s!.comprar)}</div></div>
            <div className="metric-card"><div className="metric-accent" style={{ background: '#2b6cb0' }} /><div className="metric-label">Parado + sobrando</div><div className="metric-value" style={{ fontSize: 18, color: '#2b6cb0' }}>{fmtInt(s!.parados + s!.sobrando)}</div></div>
            <div className="metric-card"><div className="metric-label">A comprar (unidades)</div><div className="metric-value" style={{ fontSize: 18 }}>{fmtInt(s!.totalComprarUn)}</div>{s!.negativos > 0 && <div style={{ fontSize: 11, color: '#c0392b', marginTop: 2 }}>{s!.negativos} c/ estoque negativo</div>}</div>
          </div>

          {/* Filtros */}
          <div className="card mb-6" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <select className="form-select" style={{ width: 200 }} value={filtro} onChange={e => setFiltro(e.target.value as 'todos' | Situacao)}>
              <option value="todos">Todas as situações</option>
              {SITUACOES.map(sit => <option key={sit} value={sit}>{sit}</option>)}
            </select>
            <input className="form-input" style={{ width: 280 }} placeholder="Buscar por produto ou código..." value={busca} onChange={e => setBusca(e.target.value)} />
            <span style={{ fontSize: 12, color: 'var(--brave-gray)', marginLeft: 'auto' }}>
              {fmtInt(filtered.length)} linhas{filtered.length > MAX_LINHAS ? ` · mostrando ${MAX_LINHAS} (exporte p/ ver todas)` : ''}
            </span>
          </div>

          {/* Tabela */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="table-wrap" style={{ maxHeight: '65vh' }}>
              <table>
                <thead style={{ position: 'sticky', top: 0, background: 'var(--brave-white)' }}>
                  <tr>
                    <th>Código</th>
                    <th>Produto</th>
                    <th style={{ textAlign: 'right' }}>jan–mar</th>
                    <th style={{ textAlign: 'right' }}>abr–jun</th>
                    <th style={{ textAlign: 'right' }}>Tend.</th>
                    <th style={{ textAlign: 'right' }}>Sai/dia</th>
                    <th style={{ textAlign: 'right' }}>Estoque</th>
                    <th style={{ textAlign: 'right' }}>Dias</th>
                    <th style={{ textAlign: 'right' }}>Ideal</th>
                    <th style={{ textAlign: 'right' }}>COMPRAR</th>
                    <th style={{ textAlign: 'right' }}>Fat. 6m</th>
                    <th>Confiança</th>
                    <th>Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, MAX_LINHAS).map(r => (
                    <tr key={r.cod}>
                      <td style={{ fontSize: 11, color: 'var(--brave-gray)' }}>{r.cod}</td>
                      <td style={{ fontSize: 12, maxWidth: 260 }}>{r.nome || '—'}</td>
                      <td style={{ textAlign: 'right', fontSize: 12 }}>{fmt1(r.p3)}</td>
                      <td style={{ textAlign: 'right', fontSize: 12 }}>{fmt1(r.u3)}</td>
                      <td style={{ textAlign: 'right', fontSize: 12, color: r.tendencia != null && r.tendencia >= 1 ? '#1a7a4a' : '#c0392b' }}>{r.tendencia == null ? '—' : `${fmt1(r.tendencia)}×`}</td>
                      <td style={{ textAlign: 'right', fontSize: 12 }}>{fmt1(r.saiDia)}</td>
                      <td style={{ textAlign: 'right', fontSize: 12, color: r.estoque < 0 ? '#c0392b' : undefined }}>{fmtInt(r.estoque)}</td>
                      <td style={{ textAlign: 'right', fontSize: 12, color: 'var(--brave-gray)' }}>{r.diasEstoque == null ? '—' : fmtInt(r.diasEstoque)}</td>
                      <td style={{ textAlign: 'right', fontSize: 12 }}>{fmtInt(r.estoqueIdeal)}</td>
                      <td style={{ textAlign: 'right', fontSize: 12, fontWeight: 700, color: (r.comprar ?? 0) > 0 ? '#c0392b' : 'var(--brave-gray)' }}>{r.comprar == null ? '—' : fmtInt(r.comprar)}</td>
                      <td style={{ textAlign: 'right', fontSize: 11, color: 'var(--brave-gray)' }}>{fmt(r.faturamento6)}</td>
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
            transferências entre lojas (só a Matriz tem), múltiplo de embalagem e lead time. O estoque é a posição do
            instante em que o relatório foi gerado. A demanda usa os <b>últimos 3 meses</b> (a rede cresceu no semestre).
          </div>
        </>
      )}

      {toast && <div className="toast">{toast}</div>}
    </Shell>
  )
}
