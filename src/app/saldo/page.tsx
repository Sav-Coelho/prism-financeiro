'use client'
import { useEffect, useState } from 'react'
import Shell from '@/components/Shell'
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, ReferenceLine,
} from 'recharts'

const fmt = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

const fmtDate = (d: string) => {
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

const fmtDateShort = (d: string) => {
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y.slice(2)}`
}

export default function Saldo() {
  const [units, setUnits] = useState<any[]>([])
  const [selectedUnitId, setSelectedUnitId] = useState<string>('')
  const [selectedBankId, setSelectedBankId] = useState<string>('')
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch('/api/units').then(r => r.json()).then(setUnits)
  }, [])

  useEffect(() => {
    setSelectedBankId('')
    setData(null)
  }, [selectedUnitId])

  useEffect(() => {
    if (!selectedBankId) { setData(null); return }
    setLoading(true)
    fetch(`/api/saldo?bankAccountId=${selectedBankId}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [selectedBankId])

  const bankAccounts = units.find(u => String(u.id) === selectedUnitId)?.bankAccounts ?? []

  const chartData = (data?.snapshots ?? []).map((s: any) => ({
    date: s.date.split('T')[0],
    label: fmtDateShort(s.date.split('T')[0]),
    Saldo: s.balance,
  }))

  const currentBalance: number = data?.currentBalance ?? 0
  const snapshotCount: number = data?.snapshots?.length ?? 0

  const balances: number[] = chartData.map((d: any) => d.Saldo)
  const minBalance: number = balances.length ? Math.min(...balances) : 0
  const maxBalance: number = balances.length ? Math.max(...balances) : 0

  return (
    <Shell>
      <div className="page-header flex-between">
        <div>
          <h1 className="page-title">Saldo Bancário</h1>
          <p className="page-subtitle">Evolução do saldo por conta e unidade</p>
        </div>
        <div className="flex gap-2">
          <select
            className="form-select"
            style={{ width: 160 }}
            value={selectedUnitId}
            onChange={e => setSelectedUnitId(e.target.value)}
          >
            <option value="">— Selecione a unidade —</option>
            {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
          {selectedUnitId && (
            <select
              className="form-select"
              style={{ width: 200 }}
              value={selectedBankId}
              onChange={e => setSelectedBankId(e.target.value)}
            >
              <option value="">— Selecione a conta —</option>
              {bankAccounts.map((b: any) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {!selectedBankId && (
        <div className="card" style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>◉</div>
          <div style={{ fontFamily: 'var(--font-sub)', fontWeight: 600, fontSize: 15 }}>Selecione uma conta bancária</div>
          <div style={{ color: 'var(--brave-gray)', fontSize: 13, marginTop: 6 }}>
            Escolha a unidade e a conta para visualizar a evolução do saldo
          </div>
        </div>
      )}

      {selectedBankId && loading && (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--brave-gray)' }}>Carregando...</div>
      )}

      {selectedBankId && !loading && data && (
        <>
          {snapshotCount === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 60 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
              <div style={{ fontFamily: 'var(--font-sub)', fontWeight: 600, fontSize: 15 }}>
                Sem dados para {data.bankAccount?.name}
              </div>
              <div style={{ color: 'var(--brave-gray)', fontSize: 13, marginTop: 6, maxWidth: 400, margin: '8px auto 0' }}>
                Importe um extrato OFX em Lançamentos selecionando esta conta bancária. O saldo e as transações serão vinculados automaticamente.
              </div>
            </div>
          ) : (
            <>
              <div className="metrics-grid mb-6" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                <div className="metric-card">
                  <div className="metric-accent"></div>
                  <div className="metric-label">Saldo Atual</div>
                  <div className={`metric-value ${currentBalance >= 0 ? 'positive' : 'negative'}`}>
                    {fmt(currentBalance)}
                  </div>
                </div>
                <div className="metric-card">
                  <div className="metric-accent"></div>
                  <div className="metric-label">Saldo Máximo</div>
                  <div className="metric-value positive">{fmt(maxBalance)}</div>
                </div>
                <div className="metric-card">
                  <div className="metric-accent"></div>
                  <div className="metric-label">Saldo Mínimo</div>
                  <div className={`metric-value ${minBalance >= 0 ? '' : 'negative'}`}>{fmt(minBalance)}</div>
                </div>
              </div>

              {chartData.length > 0 && (
                <div className="card mb-6">
                  <div style={{ fontFamily: 'var(--font-sub)', fontWeight: 600, fontSize: 13, marginBottom: 16 }}>
                    Evolução do Saldo — {data.bankAccount?.name} ({data.bankAccount?.unit?.name})
                  </div>
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#edf2f4" />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 11 }}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        tick={{ fontSize: 11 }}
                        tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`}
                        width={70}
                      />
                      <Tooltip
                        formatter={(v: number) => [fmt(v), 'Saldo']}
                        labelFormatter={label => {
                          const d = chartData.find((c: any) => c.label === label)
                          return d ? fmtDate(d.date) : label
                        }}
                      />
                      {minBalance < 0 && (
                        <ReferenceLine y={0} stroke="#c0392b" strokeDasharray="4 4" />
                      )}
                      <Line
                        type="monotone"
                        dataKey="Saldo"
                        stroke="#eaca2d"
                        strokeWidth={2}
                        dot={chartData.length <= 60 ? { r: 3, fill: '#eaca2d' } : false}
                        activeDot={{ r: 5 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

              {snapshotCount > 0 && (
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                  <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--brave-light)' }}>
                    <span style={{ fontFamily: 'var(--font-sub)', fontWeight: 600, fontSize: 13 }}>
                      Snapshots de Saldo — {snapshotCount} registros
                    </span>
                    <div style={{ fontSize: 12, color: 'var(--brave-gray)', marginTop: 2 }}>
                      Saldos capturados automaticamente via LEDGERBAL nos extratos OFX importados
                    </div>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Data</th>
                          <th style={{ textAlign: 'right' }}>Saldo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...(data.snapshots ?? [])].reverse().map((s: any, i: number) => (
                          <tr key={i}>
                            <td style={{ fontSize: 13 }}>{fmtDate(s.date.split('T')[0])}</td>
                            <td style={{ textAlign: 'right', fontWeight: 600, color: s.balance >= 0 ? '#1a7a4a' : '#c0392b' }}>
                              {fmt(s.balance)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </Shell>
  )
}
