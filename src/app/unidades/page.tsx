'use client'
import { useEffect, useState } from 'react'
import Shell from '@/components/Shell'

export default function Unidades() {
  const [units, setUnits] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [seeding, setSeeding] = useState(false)
  const [toast, setToast] = useState('')

  const load = () =>
    fetch('/api/units').then(r => r.json()).then(d => { setUnits(d); setLoading(false) })

  useEffect(() => { load() }, [])

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  const seed = async () => {
    setSeeding(true)
    const res = await fetch('/api/units/seed', { method: 'POST' })
    const data = await res.json()
    await load()
    setSeeding(false)
    showToast(`✓ Unidades e contas bancárias carregadas!`)
  }

  const totalBanks = units.reduce((acc, u) => acc + u.bankAccounts.length, 0)

  return (
    <Shell>
      <div className="page-header flex-between">
        <div>
          <h1 className="page-title">Unidades</h1>
          <p className="page-subtitle">Gerencie as unidades e contas bancárias</p>
        </div>
        {units.length === 0 && (
          <button className="btn btn-secondary" onClick={seed} disabled={seeding}>
            {seeding ? 'Carregando...' : '⚡ Carregar Unidades Padrão'}
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--brave-gray)' }}>Carregando...</div>
      ) : units.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🏢</div>
          <div style={{ fontFamily: 'var(--font-sub)', fontWeight: 600 }}>Nenhuma unidade cadastrada</div>
          <div style={{ fontSize: 13, color: 'var(--brave-gray)', marginTop: 6 }}>
            Clique em "Carregar Unidades Padrão" para criar as 5 unidades e 13 contas bancárias.
          </div>
        </div>
      ) : (
        <>
          <div className="metrics-grid mb-6" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <div className="metric-card">
              <div className="metric-label">Unidades</div>
              <div className="metric-value">{units.length}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Contas Bancárias</div>
              <div className="metric-value">{totalBanks}</div>
            </div>
            <div className="metric-card">
              <div className="metric-label">Status</div>
              <div className="metric-value" style={{ fontSize: 14, color: '#1a7a4a' }}>Ativo</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
            {units.map(unit => (
              <div key={unit.id} className="card">
                <div style={{ fontFamily: 'var(--font-sub)', fontWeight: 700, fontSize: 15, marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span>🏢 {unit.name}</span>
                  <span style={{ fontSize: 11, color: 'var(--brave-gray)', fontWeight: 400 }}>
                    {unit.bankAccounts.length} conta{unit.bankAccounts.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {unit.bankAccounts.map((bank: any) => (
                    <div key={bank.id} style={{
                      background: 'var(--brave-light)', borderRadius: 6,
                      padding: '8px 12px', fontSize: 13,
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                    }}>
                      <span>{bank.name}</span>
                      {bank.initialBalance > 0 && (
                        <span style={{ fontSize: 12, color: '#1a7a4a', fontWeight: 600 }}>
                          R$ {bank.initialBalance.toFixed(2)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {toast && <div className="toast">{toast}</div>}
    </Shell>
  )
}
