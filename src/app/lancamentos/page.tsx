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
  const [suggestionsModal, setSuggestionsModal] = useState<null | 'prompt' | 'review'>(null)
  const [reviewSelected, setReviewSelected] = useState<Set<string>>(new Set())

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
              setReviewSelected(new Set(suggestions.map(s => s.fitid)))
              setSuggestionsModal('prompt')
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

  const acceptAllSuggestions = () => {
    const newMap: Record<string, string> = {}
    pendingSuggestions.forEach(s => { newMap[s.fitid] = String(s.accountId) })
    setPreviewAccountMap(prev => ({ ...newMap, ...prev }))
    setSuggestionsModal(null)
    setPendingSuggestions([])
    setReviewSelected(new Set())
  }

  const denySuggestions = () => {
    setSuggestionsModal(null)
    setPendingSuggestions([])
    setReviewSelected(new Set())
  }

  const acceptReviewed = () => {
    const newMap: Record<string, string> = {}
    pendingSuggestions.filter(s => reviewSelected.has(s.fitid)).forEach(s => { newMap[s.fitid] = String(s.accountId) })
    setPreviewAccountMap(prev => ({ ...newMap, ...prev }))
    setSuggestionsModal(null)
    setPendingSuggestions([])
    setReviewSelected(new Set())
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

    setSaving(true)
    const res = await fetch('/api/ofx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transactions: toSave,
        bankAccountId: previewBankAccountId || null,
        ledgerBalance,
        bankInfo: detectedBankInfo,
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
    showToast('Lançamento removido')
  }

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
        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--brave-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontFamily: 'var(--font-sub)', fontWeight: 600, fontSize: 13 }}>
            {unitId ? units.find(u => u.id === parseInt(unitId))?.name : 'Consolidado'} — {MONTH_NAMES[month]}/{year} — {filtered.length} lançamentos
          </span>
          {semConta > 0 && (
            <span style={{ fontSize: 12, color: '#c0392b', fontWeight: 500 }}>
              ⚠ {semConta} sem conta — não entrarão no DRE
            </span>
          )}
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
                  <tr key={tx.id}>
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

      {suggestionsModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          {suggestionsModal === 'prompt' && (
            <div className="card" style={{ maxWidth: 460, width: '100%', padding: 36, textAlign: 'center' }}>
              <div style={{ fontSize: 44, marginBottom: 12 }}>💡</div>
              <h2 style={{ fontFamily: 'var(--font-sub)', fontSize: 18, fontWeight: 700, marginBottom: 10, color: 'var(--brave-dark)' }}>
                {pendingSuggestions.length} classificações sugeridas
              </h2>
              <p style={{ fontSize: 13, color: 'var(--brave-gray)', marginBottom: 28, lineHeight: 1.7 }}>
                O classificador inteligente identificou sugestões baseadas no histórico de lançamentos para{' '}
                <strong style={{ color: 'var(--brave-dark)' }}>{pendingSuggestions.length} transações</strong>.
                <br />Como deseja prosseguir?
              </p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                <button className="btn btn-danger" onClick={denySuggestions}>Negar</button>
                <button className="btn btn-secondary" onClick={() => setSuggestionsModal('review')}>Revisar</button>
                <button className="btn btn-primary" onClick={acceptAllSuggestions}>Aceitar todas</button>
              </div>
            </div>
          )}
          {suggestionsModal === 'review' && (
            <div className="card" style={{ maxWidth: 760, width: '100%', padding: 0, overflow: 'hidden', maxHeight: '82vh', display: 'flex', flexDirection: 'column' }}>
              <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--brave-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontFamily: 'var(--font-sub)', fontWeight: 700, fontSize: 14 }}>
                  Revisar sugestões — {reviewSelected.size} de {pendingSuggestions.length} selecionadas
                </span>
                <button
                  onClick={() => setReviewSelected(reviewSelected.size === pendingSuggestions.length ? new Set() : new Set(pendingSuggestions.map(s => s.fitid)))}
                  style={{ fontSize: 12, color: 'var(--brave-gray)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                >
                  {reviewSelected.size === pendingSuggestions.length ? 'Desmarcar todas' : 'Selecionar todas'}
                </button>
              </div>
              <div style={{ overflowY: 'auto', flex: 1 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: 'var(--brave-light)' }}>
                      <th style={{ padding: '8px 12px', width: 32 }}></th>
                      <th style={{ padding: '8px 12px', textAlign: 'left' }}>Data</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left' }}>Descrição</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right' }}>Valor</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left' }}>Conta sugerida</th>
                      <th style={{ padding: '8px 12px', textAlign: 'center' }}>Conf.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingSuggestions.map(s => {
                      const tx = previewTxs?.find(t => t.fitid === s.fitid)
                      const checked = reviewSelected.has(s.fitid)
                      return (
                        <tr key={s.fitid} style={{ borderBottom: '1px solid var(--brave-light)', background: checked ? '#f0faf4' : 'transparent', cursor: 'pointer' }}
                          onClick={() => setReviewSelected(prev => { const n = new Set(prev); if (n.has(s.fitid)) n.delete(s.fitid); else n.add(s.fitid); return n })}>
                          <td style={{ padding: '8px 12px' }}>
                            <input type="checkbox" checked={checked} onChange={() => {}} />
                          </td>
                          <td style={{ padding: '8px 12px', whiteSpace: 'nowrap' }}>{tx ? fmtDate(tx.date) : '—'}</td>
                          <td style={{ padding: '8px 12px', maxWidth: 220 }}>{tx?.memo ?? s.fitid}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap', color: tx && tx.amount >= 0 ? '#1a7a4a' : '#c0392b' }}>
                            {tx ? fmt(tx.amount) : '—'}
                          </td>
                          <td style={{ padding: '8px 12px' }}>
                            <span style={{ color: 'var(--brave-gray)', marginRight: 4 }}>{s.accountCode} —</span>
                            {s.accountName}
                          </td>
                          <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                            <span style={{ fontSize: 11, background: s.confidence >= 70 ? '#e8f5e9' : '#fff8e1', color: s.confidence >= 70 ? '#1a7a4a' : '#7a5c00', borderRadius: 4, padding: '2px 6px' }}>
                              {s.confidence}%
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ padding: '12px 24px', borderTop: '1px solid var(--brave-light)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary" onClick={denySuggestions}>Cancelar</button>
                <button className="btn btn-primary" onClick={acceptReviewed} disabled={reviewSelected.size === 0}>
                  Aplicar {reviewSelected.size} selecionada{reviewSelected.size !== 1 ? 's' : ''}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </Shell>
  )
}
