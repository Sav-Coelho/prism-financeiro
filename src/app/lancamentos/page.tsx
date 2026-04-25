'use client'
import { useEffect, useState, useRef } from 'react'
import Shell from '@/components/Shell'
import { MONTH_NAMES } from '@/lib/dre'

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
      setPreviewTxs(data.transactions)
      setSelectedFitids(new Set(
        data.transactions
          .filter((t: PreviewTx) => !t.alreadyImported && !t.isBalance)
          .map((t: PreviewTx) => t.fitid)
      ))
      setPreviewAccountMap({})
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
    } else {
      showToast(`Erro: ${data.error}`)
    }
    setParsing(false)
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
              {selectedFitids.size === selectableCount
                ? <button className="btn btn-secondary btn-sm" onClick={() => setSelectedFitids(new Set())}>Desmarcar todas</button>
                : <button className="btn btn-secondary btn-sm" onClick={selectAll}>Selecionar todas</button>
              }
              <button className="btn btn-primary" onClick={saveSelected} disabled={saving || selectedFitids.size === 0 || !previewUnitId}>
                {saving ? 'Salvando...' : `Salvar (${selectedFitids.size})`}
              </button>
              <button className="btn btn-danger btn-sm" onClick={() => { setPreviewTxs(null); setSelectedFitids(new Set()); setMatchedBankAccount(null); setDetectedBankInfo(null); setLedgerBalance(null) }}>
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
                    <td style={{ minWidth: 200 }}>
                      {!tx.alreadyImported && !tx.isBalance ? (
                        <select className="form-select" style={{ fontSize: 12, padding: '5px 8px' }}
                          value={previewAccountMap[tx.fitid] || ''}
                          onChange={e => setPreviewAccountMap(prev => ({ ...prev, [tx.fitid]: e.target.value }))}>
                          <option value="">— Sem classificação —</option>
                          {accounts.filter(a => a.type === 'NEUTRO').map(a => (
                            <option key={a.id} value={a.id}>↔ {a.name}</option>
                          ))}
                          {accounts.some(a => a.type === 'NEUTRO') && <option disabled>──────────────</option>}
                          {accounts.filter(a => a.type !== 'NEUTRO').map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                        </select>
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
                      <select className="form-select" style={{ fontSize: 12, padding: '5px 8px' }}
                        value={tx.accountId || ''} onChange={e => classify(tx.id, e.target.value)}>
                        <option value="">— Sem classificação —</option>
                        {accounts.filter(a => a.type === 'NEUTRO').map(a => (
                          <option key={a.id} value={a.id}>↔ {a.name}</option>
                        ))}
                        {accounts.some(a => a.type === 'NEUTRO') && <option disabled>──────────────</option>}
                        {accounts.filter(a => a.type !== 'NEUTRO').map(a => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                      </select>
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

      {toast && <div className="toast">{toast}</div>}
    </Shell>
  )
}
