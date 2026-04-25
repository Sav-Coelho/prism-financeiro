'use client'
import { useEffect, useState, useRef } from 'react'
import Shell from '@/components/Shell'
import AccountCombobox from '@/components/AccountCombobox'
import { MONTH_NAMES } from '@/lib/dre'
import { tokenize, jaccardSimilarity } from '@/lib/classifier'

const REALTIME_THRESHOLD = 0.25

const fmt = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

const fmtDate = (d: string) => new Date(d).toLocaleDateString('pt-BR')

const now = new Date()

interface PreviewTx {
  fitid: string
  date: string
  amount: number
  memo: string
  alreadyImported: boolean
  isBalance: boolean
}

interface BankInfo {
  bankId: string | null
  acctId: string | null
  acctType: string | null
  org: string | null
}

interface MatchedBankAccount {
  id: number
  name: string
  unitId: number
  unitName: string
}

interface LedgerBalance {
  amount: number
  date: string | null
}

export default function Lancamentos() {
  const [transactions, setTransactions] = useState<any[]>([])
  const [accounts, setAccounts] = useState<any[]>([])
  const [units, setUnits] = useState<any[]>([])
  const [unitId, setUnitId] = useState<string>('')
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')
  const [drag, setDrag] = useState(false)
  const [filter, setFilter] = useState<'all' | 'sem-conta' | 'classificado'>('all')
  const [selectedTxIds, setSelectedTxIds] = useState<Set<number>>(new Set())
  const fileRef = useRef<HTMLInputElement>(null)

  const [parsing, setParsing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [previewTxs, setPreviewTxs] = useState<PreviewTx[] | null>(null)
  const [selectedFitids, setSelectedFitids] = useState<Set<string>>(new Set())
  const [previewAccountMap, setPreviewAccountMap] = useState<Record<string, string>>({})
  const [previewUnitId, setPreviewUnitId] = useState<string>('')
  const [previewBankAccountId, setPreviewBankAccountId] = useState<string>('')
  const [detectedBankInfo, setDetectedBankInfo] = useState<BankInfo | null>(null)
  const [matchedBankAccount, setMatchedBankAccount] = useState<MatchedBankAccount | null>(null)
  const [ledgerBalance, setLedgerBalance] = useState<LedgerBalance | null>(null)
  const [suggestedFitids, setSuggestedFitids] = useState<Set<string>>(new Set())
  const [suggesting, setSuggesting] = useState(false)
  const [pendingSuggestions, setPendingSuggestions] = useState<{ fitid: string; accountId: number; accountName: string; accountCode: string; confidence: number }[]>([])
  const [panelPos, setPanelPos] = useState<{ x: number; y: number } | null>(null)
  const [panelMinimized, setPanelMinimized] = useState(false)
  const panelDragging = useRef(false)
  const panelDragOffset = useRef({ x: 0, y: 0 })

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 4000) }

  const load = () => {
    setLoading(true)
    const unitParam = unitId ? `&unitId=${unitId}` : ''
    Promise.all([
      fetch(`/api/transactions?month=${month}&year=${year}${unitParam}`).then(r => r.json()),
      fetch('/api/accounts').then(r => r.json()),
      fetch('/api/units').then(r => r.json()),
    ]).then(([txs, accs, uns]) => {
      setTransactions(txs)
      setAccounts(accs)
      setUnits(uns)
      setLoading(false)
    })
  }

  useEffect(() => { load() }, [month, year, unitId])

  const parseOFX = async (file: File) => {
    setParsing(true)
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch('/api/ofx/parse', { method: 'POST', body: fd })
    const data = await res.json()
    if (res.ok) {
      const txList: PreviewTx[] = data.transactions
      setPreviewTxs(txList)
      setSelectedFitids(new Set(
        txList.filter((t: PreviewTx) => !t.alreadyImported && !t.isBalance).map((t: PreviewTx) => t.fitid)
      ))
      setPreviewAccountMap({})
      setSuggestedFitids(new Set())
      setDetectedBankInfo(data.bankInfo ?? null)
      setMatchedBankAccount(data.matchedBankAccount ?? null)
      setLedgerBalance(data.ledgerBalance ?? null)

      if (data.matchedBankAccount) {
        setPreviewUnitId(String(data.matchedBankAccount.unitId))
        setPreviewBankAccountId(String(data.matchedBankAccount.id))
      } else {
        setPreviewUnitId(unitId)
        setPreviewBankAccountId('')
      }

      // Busca sugestões históricas (não-bloqueante)
      const toSuggest = txList.filter(t => !t.alreadyImported && !t.isBalance)
      if (toSuggest.length > 0) {
        setSuggesting(true)
        fetch('/api/classify/suggest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ memos: toSuggest.map(t => ({ fitid: t.fitid, memo: t.memo })) }),
        })
          .then(r => r.json())
          .then((suggestions: { fitid: string; accountId: number; accountName: string; accountCode: string; confidence: number }[]) => {
            if (suggestions.length > 0) {
              setPendingSuggestions(suggestions)
              setPanelMinimized(false)
              setPanelPos({ x: Math.max(16, window.innerWidth / 2 - 190), y: Math.max(16, window.innerHeight / 2 - 180) })
            }
          })
          .catch(() => {})
          .finally(() => setSuggesting(false))
      }
    } else {
      showToast(`Erro: ${data.error}`)
    }
    setParsing(false)
  }

  const handlePreviewAccountChange = (fitid: string, accountId: string) => {
    setSuggestedFitids(prev => { const n = new Set(prev); n.delete(fitid); return n })
    setPreviewAccountMap(prev => ({ ...prev, [fitid]: accountId }))

    if (accountId && previewTxs) {
      const thisTx = previewTxs.find(t => t.fitid === fitid)
      if (!thisTx) return
      const thisTokens = tokenize(thisTx.memo)
      const newSugs: string[] = []
      previewTxs.forEach(t => {
        if (t.fitid === fitid || t.alreadyImported || t.isBalance) return
        if (previewAccountMap[t.fitid] && !suggestedFitids.has(t.fitid)) return
        if (jaccardSimilarity(thisTokens, tokenize(t.memo)) >= REALTIME_THRESHOLD) newSugs.push(t.fitid)
      })
      if (newSugs.length > 0) {
        setPreviewAccountMap(prev => { const n = { ...prev }; newSugs.forEach(f => { n[f] = accountId }); return n })
        setSuggestedFitids(prev => { const n = new Set(prev); newSugs.forEach(f => n.add(f)); return n })
        showToast(`💡 ${newSugs.length} linha${newSugs.length > 1 ? 's semelhantes classificadas' : ' semelhante classificada'} automaticamente`)
      }
    }
  }

  const acceptSuggestion = (fitid: string) =>
    setSuggestedFitids(prev => { const n = new Set(prev); n.delete(fitid); return n })

  const clearSuggestionBadges = () => setSuggestedFitids(new Set())

  const closePanel = () => { setPendingSuggestions([]); setPanelPos(null) }

  const acceptAllFromPanel = () => {
    const newMap: Record<string, string> = {}
    pendingSuggestions.forEach(s => { newMap[s.fitid] = String(s.accountId) })
    setPreviewAccountMap(prev => ({ ...newMap, ...prev }))
    closePanel()
    showToast(`✓ ${pendingSuggestions.length} classificações aplicadas`)
  }

  const acceptSuggestionFromPanel = (fitid: string, accountId: number) => {
    setPreviewAccountMap(prev => ({ ...prev, [fitid]: String(accountId) }))
    setPendingSuggestions(prev => {
      const remaining = prev.filter(s => s.fitid !== fitid)
      if (remaining.length === 0) setPanelPos(null)
      return remaining
    })
  }

  const denySuggestionFromPanel = (fitid: string) => {
    setPendingSuggestions(prev => {
      const remaining = prev.filter(s => s.fitid !== fitid)
      if (remaining.length === 0) setPanelPos(null)
      return remaining
    })
  }

  const handlePanelDragStart = (e: React.MouseEvent) => {
    if (!panelPos) return
    panelDragging.current = true
    panelDragOffset.current = { x: e.clientX - panelPos.x, y: e.clientY - panelPos.y }
    const onMove = (ev: MouseEvent) => {
      if (!panelDragging.current) return
      setPanelPos({ x: ev.clientX - panelDragOffset.current.x, y: ev.clientY - panelDragOffset.current.y })
    }
    const onUp = () => {
      panelDragging.current = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) parseOFX(f)
    e.target.value = ''
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDrag(false)
    const f = e.dataTransfer.files?.[0]
    if (f) parseOFX(f)
  }

  const toggleSelect = (fitid: string) => {
    setSelectedFitids(prev => {
      const next = new Set(prev)
      if (next.has(fitid)) next.delete(fitid); else next.add(fitid)
      return next
    })
  }

  const selectAll = () => {
    if (!previewTxs) return
    setSelectedFitids(new Set(
      previewTxs.filter(t => !t.alreadyImported && !t.isBalance).map(t => t.fitid)
    ))
  }

  const saveSelected = async () => {
    if (!previewTxs) return
    if (!previewUnitId) { showToast('Selecione a unidade antes de salvar'); return }
    const toSave = previewTxs
      .filter(t => selectedFitids.has(t.fitid))
      .map(t => ({ ...t, accountId: previewAccountMap[t.fitid] || null, unitId: previewUnitId }))

    if (toSave.length === 0) { showToast('Selecione ao menos uma transação'); return }

    const balanceTransactions = previewTxs
      .filter(t => t.isBalance)
      .map(t => ({ date: t.date, amount: t.amount }))

    setSaving(true)
    const res = await fetch('/api/ofx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transactions: toSave,
        bankAccountId: previewBankAccountId || null,
        ledgerBalance,
        bankInfo: detectedBankInfo,
        balanceTransactions,
      })
    })
    const data = await res.json()
    if (res.ok) {
      const saldoMsg = ledgerBalance ? ` · Saldo ${fmt(ledgerBalance.amount)} salvo` : ''
      showToast(`✓ ${data.imported} importadas${data.skipped ? `, ${data.skipped} ignoradas` : ''}${saldoMsg}`)
      setPreviewTxs(null); setSelectedFitids(new Set()); setPreviewAccountMap({})
      setSuggestedFitids(new Set())
      setMatchedBankAccount(null); setDetectedBankInfo(null); setLedgerBalance(null)
      load()
    } else {
      showToast(`Erro: ${data.error}`)
    }
    setSaving(false)
  }

  const classify = async (txId: number, accountId: string) => {
    await fetch(`/api/transactions/${txId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId: accountId || null })
    })
    setTransactions(prev => prev.map(t =>
      t.id === txId
        ? { ...t, accountId: accountId ? parseInt(accountId) : null, account: accounts.find(a => a.id === parseInt(accountId)) || null }
        : t
    ))
  }

  const remove = async (id: number) => {
    await fetch(`/api/transactions/${id}`, { method: 'DELETE' })
    setTransactions(prev => prev.filter(t => t.id !== id))
    setSelectedTxIds(prev => { const n = new Set(prev); n.delete(id); return n })
    showToast('Lançamento removido')
  }

  const removeSelected = async () => {
    if (selectedTxIds.size === 0) return
    await Promise.all(Array.from(selectedTxIds).map(id =>
      fetch(`/api/transactions/${id}`, { method: 'DELETE' })
    ))
    setTransactions(prev => prev.filter(t => !selectedTxIds.has(t.id)))
    showToast(`${selectedTxIds.size} lançamento${selectedTxIds.size > 1 ? 's removidos' : ' removido'}`)
    setSelectedTxIds(new Set())
  }

  const toggleTxSelect = (id: number) =>
    setSelectedTxIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const selectAllVisible = () => setSelectedTxIds(new Set(filtered.map(t => t.id)))
  const clearTxSelection = () => setSelectedTxIds(new Set())

  const filtered = transactions.filter(t => {
    if (filter === 'sem-conta') return !t.accountId
    if (filter === 'classificado') return !!t.accountId
    return true
  })

  const semConta = transactions.filter(t => !t.accountId).length
  const classificado = transactions.filter(t => !!t.accountId).length
  const selectableCount = previewTxs?.filter(t => !t.alreadyImported && !t.isBalance).length ?? 0

  const bankAccountsForUnit = units.find(u => String(u.id) === previewUnitId)?.bankAccounts ?? []

  return (
    <Shell>
      <div className="page-header flex-between">
        <div>
          <h1 className="page-title">Lançamentos</h1>
          <p className="page-subtitle">Importe extratos OFX e classifique cada transação</p>
        </div>
        <div className="flex gap-2">
          <select className="form-select" style={{ width: 150 }} value={unitId} onChange={e => setUnitId(e.target.value)}>
            <option value="">Todas as unidades</option>
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

      {!previewTxs && (
        <div
          className={`upload-zone mb-6 ${drag ? 'drag' : ''}`}
          onDragOver={e => { e.preventDefault(); setDrag(true) }}
          onDragLeave={() => setDrag(false)}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
        >
          <input ref={fileRef} type="file" accept=".ofx,.OFX" style={{ display: 'none' }} onChange={handleFile} />
          <div className="upload-icon">{parsing ? '⏳' : '📂'}</div>
          <div className="upload-title">{parsing ? 'Lendo extrato...' : 'Importar Extrato OFX'}</div>
          <div className="upload-sub">Clique ou arraste o arquivo .OFX — você verá uma prévia antes de salvar</div>
        </div>
      )}

      {previewTxs && (
        <div className="card mb-6" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--brave-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <span style={{ fontFamily: 'var(--font-sub)', fontWeight: 600, fontSize: 13 }}>
                Prévia do OFX — {previewTxs.length} linhas
              </span>
              <div style={{ fontSize: 12, color: 'var(--brave-gray)', marginTop: 2 }}>
                {selectedFitids.size} selecionadas · {previewTxs.filter(t => t.alreadyImported).length} já importadas
                {previewTxs.filter(t => t.isBalance).length > 0 && (
                  <span style={{ marginLeft: 6, color: '#b58b00' }}>
                    · {previewTxs.filter(t => t.isBalance).length} de saldo (excluídas)
                  </span>
                )}
                {ledgerBalance && (
                  <span style={{ marginLeft: 6, color: '#1a7a4a', fontWeight: 600 }}>
                    · Saldo LEDGER: {fmt(ledgerBalance.amount)}
                  </span>
                )}
              </div>
              {(detectedBankInfo?.bankId || detectedBankInfo?.org) && (
                <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {matchedBankAccount ? (
                    <span style={{ fontSize: 12, background: '#e8f5e9', color: '#1a7a4a', borderRadius: 4, padding: '2px 8px', fontWeight: 600 }}>
                      Banco identificado: {matchedBankAccount.name} ({matchedBankAccount.unitName})
                    </span>
                  ) : (
                    <span style={{ fontSize: 12, background: '#fff8e1', color: '#b58b00', borderRadius: 4, padding: '2px 8px' }}>
                      {detectedBankInfo.org || detectedBankInfo.bankId}
                      {detectedBankInfo.acctId && ` · Conta ...${detectedBankInfo.acctId.slice(-4)}`}
                      {' — selecione a conta bancária abaixo'}
                    </span>
                  )}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <select
                className="form-select"
                style={{ fontSize: 12 }}
                value={previewUnitId}
                onChange={e => { setPreviewUnitId(e.target.value); setPreviewBankAccountId('') }}
              >
                <option value="">— Selecione a unidade —</option>
                {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
              {previewUnitId && (
                <select
                  className="form-select"
                  style={{ fontSize: 12 }}
                  value={previewBankAccountId}
                  onChange={e => setPreviewBankAccountId(e.target.value)}
                >
                  <option value="">— Conta bancária —</option>
                  {bankAccountsForUnit.map((b: any) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              )}
              {suggesting && (
                <span style={{ fontSize: 12, color: 'var(--brave-gray)' }}>🔍 buscando sugestões...</span>
              )}
              {!suggesting && suggestedFitids.size > 0 && (
                <button className="btn btn-secondary btn-sm" onClick={clearSuggestionBadges}
                  style={{ background: '#fff8e1', borderColor: '#f0c040', color: '#7a5c00' }}>
                  💡 Confirmar todas ({suggestedFitids.size})
                </button>
              )}
              <button className="btn btn-secondary btn-sm" onClick={() => {
                if (!previewTxs) return
                setSelectedFitids(new Set(
                  previewTxs.filter(t => !t.alreadyImported && !t.isBalance && previewAccountMap[t.fitid]).map(t => t.fitid)
                ))
              }}>Só classificadas</button>
              {selectedFitids.size === selectableCount
                ? <button className="btn btn-secondary btn-sm" onClick={() => setSelectedFitids(new Set())}>Desmarcar todas</button>
                : <button className="btn btn-secondary btn-sm" onClick={selectAll}>Selecionar todas</button>
              }
              <button className="btn btn-primary" onClick={saveSelected} disabled={saving || selectedFitids.size === 0 || !previewUnitId}>
                {saving ? 'Salvando...' : `Salvar (${selectedFitids.size})`}
              </button>
              <button className="btn btn-danger btn-sm" onClick={() => { setPreviewTxs(null); setSelectedFitids(new Set()); setPreviewAccountMap({}); setSuggestedFitids(new Set()); setMatchedBankAccount(null); setDetectedBankInfo(null); setLedgerBalance(null) }}>
                Cancelar
              </button>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 32 }}></th>
                  <th>Data</th>
                  <th>Descrição</th>
                  <th style={{ textAlign: 'right' }}>Valor</th>
                  <th>Conta do Plano</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {previewTxs.map(tx => (
                  <tr key={tx.fitid} style={{ opacity: tx.alreadyImported || tx.isBalance ? 0.5 : 1 }}>
                    <td>
                      {tx.isBalance ? (
                        <span style={{ fontSize: 10 }}>—</span>
                      ) : (
                        <input type="checkbox" checked={selectedFitids.has(tx.fitid)} disabled={tx.alreadyImported}
                          onChange={() => toggleSelect(tx.fitid)} style={{ cursor: tx.alreadyImported ? 'not-allowed' : 'pointer' }} />
                      )}
                    </td>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{fmtDate(tx.date)}</td>
                    <td style={{ maxWidth: 260, fontSize: 13 }}>{tx.memo}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap', color: tx.amount >= 0 ? '#1a7a4a' : '#c0392b' }}>
                      {fmt(tx.amount)}
                    </td>
                    <td style={{ minWidth: 220 }}>
                      {!tx.alreadyImported && !tx.isBalance ? (
                        <div>
                          <AccountCombobox
                            accounts={accounts}
                            value={previewAccountMap[tx.fitid] || ''}
                            onChange={val => handlePreviewAccountChange(tx.fitid, val)}
                          />
                          {suggestedFitids.has(tx.fitid) && previewAccountMap[tx.fitid] && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3 }}>
                              <span style={{ fontSize: 10, color: '#7a5c00', background: '#fff8e1', borderRadius: 4, padding: '1px 5px' }}>
                                💡 sugestão automática
                              </span>
                              <button
                                onClick={() => acceptSuggestion(tx.fitid)}
                                style={{ fontSize: 10, color: '#1a7a4a', background: '#e8f5e9', border: 'none', borderRadius: 4, padding: '1px 6px', cursor: 'pointer' }}
                              >
                                ✓ aceitar
                              </button>
                            </div>
                          )}
                        </div>
                      ) : <span style={{ fontSize: 12, color: 'var(--brave-gray)' }}>—</span>}
                    </td>
                    <td>
                      {tx.isBalance
                        ? <span style={{ fontSize: 11, color: '#b58b00', background: '#fff8e1', borderRadius: 4, padding: '2px 6px' }}>saldo</span>
                        : tx.alreadyImported
                          ? <span style={{ fontSize: 11, color: 'var(--brave-gray)', background: 'var(--brave-light)', borderRadius: 4, padding: '2px 6px' }}>já importada</span>
                          : <span style={{ fontSize: 11, color: '#1a7a4a' }}>nova</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="metrics-grid mb-6" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="metric-card" style={{ cursor: 'pointer', border: filter === 'all' ? '2px solid var(--brave-yellow)' : '' }} onClick={() => setFilter('all')}>
          <div className="metric-label">Total no período</div>
          <div className="metric-value">{transactions.length}</div>
        </div>
        <div className="metric-card" style={{ cursor: 'pointer', border: filter === 'sem-conta' ? '2px solid var(--brave-yellow)' : '' }} onClick={() => setFilter('sem-conta')}>
          <div className="metric-label">Sem classificação</div>
          <div className="metric-value" style={{ color: semConta > 0 ? '#c0392b' : '#1a7a4a' }}>{semConta}</div>
        </div>
        <div className="metric-card" style={{ cursor: 'pointer', border: filter === 'classificado' ? '2px solid var(--brave-yellow)' : '' }} onClick={() => setFilter('classificado')}>
          <div className="metric-label">Classificados</div>
          <div className="metric-value" style={{ color: '#1a7a4a' }}>{classificado}</div>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--brave-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'var(--font-sub)', fontWeight: 600, fontSize: 13 }}>
            {unitId ? units.find(u => u.id === parseInt(unitId))?.name : 'Consolidado'} — {MONTH_NAMES[month]}/{year} — {filtered.length} lançamentos
          </span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {semConta > 0 && (
              <span style={{ fontSize: 12, color: '#c0392b', fontWeight: 500 }}>
                ⚠ {semConta} sem conta
              </span>
            )}
            {selectedTxIds.size === filtered.length && filtered.length > 0
              ? <button className="btn btn-secondary btn-sm" onClick={clearTxSelection}>Desmarcar todas</button>
              : <button className="btn btn-secondary btn-sm" onClick={selectAllVisible} disabled={filtered.length === 0}>Selecionar todas</button>
            }
            {selectedTxIds.size > 0 && (
              <button className="btn btn-danger btn-sm" onClick={removeSelected}>
                Excluir selecionadas ({selectedTxIds.size})
              </button>
            )}
          </div>
        </div>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--brave-gray)' }}>Carregando...</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center', color: 'var(--brave-gray)' }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📄</div>
            Nenhum lançamento encontrado.<br />
            <span style={{ fontSize: 12 }}>Importe um arquivo OFX acima.</span>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 32 }}></th>
                  <th>Data</th>
                  <th>Descrição</th>
                  <th>Unidade</th>
                  <th style={{ textAlign: 'right' }}>Valor</th>
                  <th>Conta do Plano</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(tx => (
                  <tr key={tx.id} style={{ background: selectedTxIds.has(tx.id) ? '#fef9e7' : undefined }}>
                    <td>
                      <input type="checkbox" checked={selectedTxIds.has(tx.id)}
                        onChange={() => toggleTxSelect(tx.id)} style={{ cursor: 'pointer' }} />
                    </td>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{fmtDate(tx.date)}</td>
                    <td style={{ maxWidth: 240 }}>
                      <div style={{ fontSize: 13 }}>{tx.description}</div>
                      {tx.memo && tx.memo !== tx.description && (
                        <div style={{ fontSize: 11, color: 'var(--brave-gray)' }}>{tx.memo}</div>
                      )}
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--brave-gray)', whiteSpace: 'nowrap' }}>
                      {tx.unit?.name || '—'}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap', color: tx.amount >= 0 ? '#1a7a4a' : '#c0392b' }}>
                      {fmt(tx.amount)}
                    </td>
                    <td style={{ minWidth: 200 }}>
                      <AccountCombobox
                        accounts={accounts}
                        value={String(tx.accountId || '')}
                        onChange={val => classify(tx.id, val)}
                      />
                    </td>
                    <td>
                      <button className="btn btn-danger btn-sm" onClick={() => remove(tx.id)}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {pendingSuggestions.length > 0 && panelPos && (
        <div style={{
          position: 'fixed', left: panelPos.x, top: panelPos.y, width: 390, zIndex: 600,
          borderRadius: 12, boxShadow: '0 10px 36px rgba(0,0,0,0.22)', background: 'var(--brave-white)',
          border: '1px solid rgba(43,45,66,0.18)', userSelect: 'none',
        }}>
          {/* Header — drag handle */}
          <div
            onMouseDown={handlePanelDragStart}
            style={{
              padding: '10px 12px', background: 'var(--brave-dark)', cursor: 'grab',
              borderRadius: panelMinimized ? 12 : '12px 12px 0 0',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 15 }}>💡</span>
              <span style={{ fontFamily: 'var(--font-sub)', fontWeight: 600, fontSize: 13, color: '#fff' }}>
                Classificador inteligente
              </span>
              <span style={{ background: 'var(--brave-yellow)', color: 'var(--brave-dark)', borderRadius: 20, padding: '1px 8px', fontSize: 11, fontWeight: 700 }}>
                {pendingSuggestions.length}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                onMouseDown={e => e.stopPropagation()}
                onClick={() => setPanelMinimized(m => !m)}
                title={panelMinimized ? 'Expandir' : 'Minimizar'}
                style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', borderRadius: 4, width: 24, height: 24, cursor: 'pointer', fontSize: 11 }}
              >{panelMinimized ? '▲' : '▼'}</button>
              <button
                onMouseDown={e => e.stopPropagation()}
                onClick={closePanel}
                title="Fechar (negar todas)"
                style={{ background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff', borderRadius: 4, width: 24, height: 24, cursor: 'pointer', fontSize: 13 }}
              >✕</button>
            </div>
          </div>

          {!panelMinimized && (
            <>
              <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                {pendingSuggestions.map((s, i) => {
                  const tx = previewTxs?.find(t => t.fitid === s.fitid)
                  return (
                    <div key={s.fitid} style={{ padding: '9px 14px', borderBottom: i < pendingSuggestions.length - 1 ? '1px solid var(--brave-light)' : 'none' }}>
                      <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--brave-dark)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 4 }}>
                        {tx?.memo ?? s.fitid}
                        {tx && (
                          <span style={{ marginLeft: 8, fontWeight: 400, color: tx.amount >= 0 ? '#1a7a4a' : '#c0392b' }}>{fmt(tx.amount)}</span>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                        <div style={{ fontSize: 11, color: 'var(--brave-gray)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <span>{s.accountCode} — </span>{s.accountName}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                          <span style={{ fontSize: 10, background: s.confidence >= 70 ? '#e8f5e9' : '#fff8e1', color: s.confidence >= 70 ? '#1a7a4a' : '#7a5c00', borderRadius: 4, padding: '1px 5px' }}>
                            {s.confidence}%
                          </span>
                          <button onClick={() => denySuggestionFromPanel(s.fitid)} title="Negar"
                            style={{ fontSize: 11, background: '#fdecea', color: '#c0392b', border: 'none', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontWeight: 600 }}>
                            ✕
                          </button>
                          <button onClick={() => acceptSuggestionFromPanel(s.fitid, s.accountId)} title="Aceitar"
                            style={{ fontSize: 11, background: '#e8f5e9', color: '#1a7a4a', border: 'none', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontWeight: 600 }}>
                            ✓
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
              <div style={{ padding: '10px 14px', borderTop: '1px solid var(--brave-light)', display: 'flex', gap: 6, justifyContent: 'flex-end', background: 'var(--brave-light)', borderRadius: '0 0 12px 12px' }}>
                <button className="btn btn-secondary btn-sm" onClick={closePanel}>Negar todas</button>
                <button className="btn btn-primary btn-sm" onClick={acceptAllFromPanel}>Aceitar todas ({pendingSuggestions.length})</button>
              </div>
            </>
          )}
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </Shell>
  )
}
