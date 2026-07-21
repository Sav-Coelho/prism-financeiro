'use client'
import React, { useEffect, useState } from 'react'
import Shell from '@/components/Shell'

type Unit = { id: number; name: string }
type Sale = { id: number; description: string; amount: number; date: string; unitId?: number | null }
type Client = {
  id: number; name: string; email?: string | null; phone?: string | null
  cpf?: string | null; unitId?: number | null; unit?: Unit | null
  active: boolean; createdAt: string; sales: Sale[]
}

const fmt = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('pt-BR', { timeZone: 'UTC' })

export default function Clientes() {
  const [clients, setClients] = useState<Client[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState('')

  // Client modal
  const [clientModal, setClientModal] = useState(false)
  const [editClient, setEditClient] = useState<Client | null>(null)
  const [form, setForm] = useState({ name: '', email: '', phone: '', cpf: '', unitId: '' })
  const [saving, setSaving] = useState(false)

  // Sale modal
  const [saleModal, setSaleModal] = useState(false)
  const [saleClient, setSaleClient] = useState<Client | null>(null)
  const [saleForm, setSaleForm] = useState({ description: '', amount: '', date: new Date().toISOString().slice(0, 10), unitId: '' })
  const [saleSaving, setSaleSaving] = useState(false)

  // Expanded client
  const [expanded, setExpanded] = useState<number | null>(null)

  const load = async () => {
    const [c, u] = await Promise.all([
      fetch('/api/clients').then(r => r.json()),
      fetch('/api/units').then(r => r.json()),
    ])
    setClients(c)
    setUnits(u)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  // --- Client CRUD ---
  const openAdd = () => {
    setEditClient(null)
    setForm({ name: '', email: '', phone: '', cpf: '', unitId: '' })
    setClientModal(true)
  }
  const openEdit = (c: Client) => {
    setEditClient(c)
    setForm({ name: c.name, email: c.email || '', phone: c.phone || '', cpf: c.cpf || '', unitId: c.unitId ? String(c.unitId) : '' })
    setClientModal(true)
  }

  const saveClient = async () => {
    if (!form.name.trim()) return
    setSaving(true)
    const url = editClient ? `/api/clients/${editClient.id}` : '/api/clients'
    const method = editClient ? 'PUT' : 'POST'
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    const data = await res.json()
    setSaving(false)
    if (!res.ok) { showToast(`Erro: ${data.error}`); return }
    setClientModal(false)
    await load()
    showToast(editClient ? '✓ Cliente atualizado' : '✓ Cliente cadastrado')
  }

  const deleteClient = async (c: Client) => {
    if (!confirm(`Excluir cliente "${c.name}"? As vendas vinculadas também serão excluídas.`)) return
    const res = await fetch(`/api/clients/${c.id}`, { method: 'DELETE' })
    if (!res.ok) { showToast('Erro ao excluir'); return }
    await load()
    if (expanded === c.id) setExpanded(null)
    showToast('✓ Cliente excluído')
  }

  const toggleActive = async (c: Client) => {
    await fetch(`/api/clients/${c.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...c, active: !c.active }),
    })
    await load()
  }

  // --- Sales ---
  const openSale = (c: Client) => {
    setSaleClient(c)
    setSaleForm({ description: '', amount: '', date: new Date().toISOString().slice(0, 10), unitId: c.unitId ? String(c.unitId) : '' })
    setSaleModal(true)
  }

  const saveSale = async () => {
    if (!saleClient || !saleForm.description.trim() || !saleForm.amount || !saleForm.date) return
    setSaleSaving(true)
    const res = await fetch('/api/sales', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: saleClient.id, ...saleForm }),
    })
    const data = await res.json()
    setSaleSaving(false)
    if (!res.ok) { showToast(`Erro: ${data.error}`); return }
    setSaleModal(false)
    await load()
    showToast('✓ Compra registrada')
  }

  const deleteSale = async (saleId: number) => {
    if (!confirm('Excluir esta compra?')) return
    await fetch(`/api/sales/${saleId}`, { method: 'DELETE' })
    await load()
    showToast('✓ Compra removida')
  }

  const filtered = clients.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.email || '').toLowerCase().includes(search.toLowerCase()) ||
    (c.phone || '').includes(search)
  )

  const totalClients = clients.filter(c => c.active).length
  const totalSales = clients.reduce((acc, c) => acc + c.sales.reduce((s, v) => s + v.amount, 0), 0)
  const ticketMedio = totalClients > 0 ? totalSales / totalClients : 0

  return (
    <Shell>
      <div className="page-header flex-between">
        <div>
          <h1 className="page-title">Clientes</h1>
          <p className="page-subtitle">Cadastro e controle de compras por cliente</p>
        </div>
        <button className="btn btn-primary" onClick={openAdd}>+ Novo Cliente</button>
      </div>

      {/* Metrics */}
      <div className="metrics-grid mb-6" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="metric-card">
          <div className="metric-label">Clientes Ativos</div>
          <div className="metric-value">{totalClients}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Total em Compras</div>
          <div className="metric-value" style={{ fontSize: 18 }}>{fmt(totalSales)}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Ticket Médio</div>
          <div className="metric-value" style={{ fontSize: 18 }}>{fmt(ticketMedio)}</div>
        </div>
      </div>

      {/* Search */}
      <div style={{ marginBottom: 16 }}>
        <input
          className="form-input"
          style={{ width: 320 }}
          placeholder="Buscar por nome, e-mail ou telefone..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--brave-gray)' }}>Carregando...</div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>👤</div>
          <div style={{ fontFamily: 'var(--font-sub)', fontWeight: 600 }}>
            {search ? 'Nenhum cliente encontrado' : 'Nenhum cliente cadastrado'}
          </div>
          {!search && (
            <div style={{ fontSize: 13, color: 'var(--brave-gray)', marginTop: 6, marginBottom: 20 }}>
              Comece cadastrando o primeiro cliente.
            </div>
          )}
          {!search && <button className="btn btn-primary" onClick={openAdd}>+ Novo Cliente</button>}
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--brave-light)', borderBottom: '1px solid #ddd' }}>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 12, color: 'var(--brave-gray)', fontWeight: 600 }}>Cliente</th>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 12, color: 'var(--brave-gray)', fontWeight: 600 }}>Unidade</th>
                <th style={{ padding: '10px 16px', textAlign: 'left', fontSize: 12, color: 'var(--brave-gray)', fontWeight: 600 }}>Contato</th>
                <th style={{ padding: '10px 16px', textAlign: 'right', fontSize: 12, color: 'var(--brave-gray)', fontWeight: 600 }}>Total Compras</th>
                <th style={{ padding: '10px 16px', textAlign: 'center', fontSize: 12, color: 'var(--brave-gray)', fontWeight: 600 }}>Compras</th>
                <th style={{ padding: '10px 16px', textAlign: 'center', fontSize: 12, color: 'var(--brave-gray)', fontWeight: 600 }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c, i) => {
                const totalClient = c.sales.reduce((s, v) => s + v.amount, 0)
                const lastSale = c.sales.length > 0 ? c.sales.reduce((a, b) => a.date > b.date ? a : b) : null
                const isExpanded = expanded === c.id
                return (
                  <React.Fragment key={c.id}>
                    <tr
                      style={{
                        borderBottom: '1px solid #eee',
                        background: i % 2 === 0 ? '#fff' : 'var(--brave-light)',
                        opacity: c.active ? 1 : 0.5,
                      }}
                    >
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{c.name}</div>
                        {!c.active && <span style={{ fontSize: 10, color: '#999', background: '#eee', borderRadius: 3, padding: '1px 4px' }}>inativo</span>}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--brave-gray)' }}>
                        {c.unit?.name || '—'}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--brave-gray)' }}>
                        {c.phone && <div>{c.phone}</div>}
                        {c.email && <div style={{ color: '#4a90d9' }}>{c.email}</div>}
                        {!c.phone && !c.email && '—'}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <div style={{ fontWeight: 700, color: totalClient > 0 ? '#1a7a4a' : 'var(--brave-gray)', fontSize: 14 }}>
                          {fmt(totalClient)}
                        </div>
                        {lastSale && (
                          <div style={{ fontSize: 11, color: 'var(--brave-gray)' }}>
                            última: {fmtDate(lastSale.date)}
                          </div>
                        )}
                        {c.sales.length > 0 && (
                          <div style={{ fontSize: 11, color: 'var(--brave-gray)' }}>
                            {c.sales.length} compra{c.sales.length !== 1 ? 's' : ''}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <button
                          className="btn btn-sm"
                          style={{ fontSize: 12 }}
                          onClick={() => openSale(c)}
                        >
                          + Registrar
                        </button>
                        {c.sales.length > 0 && (
                          <button
                            className="btn btn-sm"
                            style={{ fontSize: 12, marginLeft: 4, background: isExpanded ? 'var(--brave-yellow)' : undefined }}
                            onClick={() => setExpanded(isExpanded ? null : c.id)}
                          >
                            {isExpanded ? '▲' : '▼'} Histórico
                          </button>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                          <button className="btn btn-sm" title="Editar" onClick={() => openEdit(c)}>✏️</button>
                          <button
                            className="btn btn-sm"
                            title={c.active ? 'Desativar' : 'Ativar'}
                            onClick={() => toggleActive(c)}
                            style={{ fontSize: 11 }}
                          >
                            {c.active ? '⏸' : '▶'}
                          </button>
                          <button className="btn btn-sm btn-danger" title="Excluir" onClick={() => deleteClient(c)}>✕</button>
                        </div>
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr style={{ borderBottom: '2px solid var(--brave-yellow)' }}>
                        <td colSpan={6} style={{ padding: 0 }}>
                          <div style={{ background: '#f7f9fc', padding: '12px 24px' }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--brave-gray)', marginBottom: 8 }}>
                              HISTÓRICO DE COMPRAS — {c.name}
                            </div>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                              <thead>
                                <tr>
                                  <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--brave-gray)', fontWeight: 500 }}>Data</th>
                                  <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--brave-gray)', fontWeight: 500 }}>Descrição</th>
                                  <th style={{ textAlign: 'right', padding: '4px 8px', color: 'var(--brave-gray)', fontWeight: 500 }}>Valor</th>
                                  <th style={{ textAlign: 'center', padding: '4px 8px', color: 'var(--brave-gray)', fontWeight: 500 }}>Ação</th>
                                </tr>
                              </thead>
                              <tbody>
                                {c.sales.slice().sort((a, b) => b.date.localeCompare(a.date)).map(sale => (
                                  <tr key={sale.id} style={{ borderTop: '1px solid #e8edf2' }}>
                                    <td style={{ padding: '6px 8px', color: 'var(--brave-gray)' }}>{fmtDate(sale.date)}</td>
                                    <td style={{ padding: '6px 8px' }}>{sale.description}</td>
                                    <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600, color: '#1a7a4a' }}>{fmt(sale.amount)}</td>
                                    <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                                      <button
                                        className="btn btn-sm btn-danger"
                                        style={{ padding: '2px 6px', fontSize: 11 }}
                                        onClick={() => deleteSale(sale.id)}
                                      >
                                        ✕
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                                <tr style={{ borderTop: '2px solid #ccc', fontWeight: 700 }}>
                                  <td colSpan={2} style={{ padding: '8px 8px', textAlign: 'right' }}>Total</td>
                                  <td style={{ padding: '8px 8px', textAlign: 'right', color: '#1a7a4a' }}>{fmt(totalClient)}</td>
                                  <td />
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Client Modal */}
      {clientModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
          <div className="card" style={{ width: 420, padding: 24 }}>
            <h3 style={{ fontFamily: 'var(--font-sub)', marginBottom: 16 }}>
              {editClient ? 'Editar Cliente' : 'Novo Cliente'}
            </h3>

            <label style={{ fontSize: 12, color: 'var(--brave-gray)', display: 'block', marginBottom: 4 }}>Nome *</label>
            <input
              className="form-input"
              style={{ width: '100%', marginBottom: 12 }}
              placeholder="Nome completo"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              autoFocus
            />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: 'var(--brave-gray)', display: 'block', marginBottom: 4 }}>Telefone</label>
                <input
                  className="form-input"
                  style={{ width: '100%' }}
                  placeholder="(00) 00000-0000"
                  value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--brave-gray)', display: 'block', marginBottom: 4 }}>CPF</label>
                <input
                  className="form-input"
                  style={{ width: '100%' }}
                  placeholder="000.000.000-00"
                  value={form.cpf}
                  onChange={e => setForm(f => ({ ...f, cpf: e.target.value }))}
                />
              </div>
            </div>

            <label style={{ fontSize: 12, color: 'var(--brave-gray)', display: 'block', marginBottom: 4 }}>E-mail</label>
            <input
              className="form-input"
              style={{ width: '100%', marginBottom: 12 }}
              type="email"
              placeholder="email@exemplo.com"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            />

            <label style={{ fontSize: 12, color: 'var(--brave-gray)', display: 'block', marginBottom: 4 }}>Unidade</label>
            <select
              className="form-select"
              style={{ width: '100%', marginBottom: 16 }}
              value={form.unitId}
              onChange={e => setForm(f => ({ ...f, unitId: e.target.value }))}
            >
              <option value="">— Nenhuma —</option>
              {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setClientModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={saveClient} disabled={saving || !form.name.trim()}>
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sale Modal */}
      {saleModal && saleClient && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
          <div className="card" style={{ width: 400, padding: 24 }}>
            <h3 style={{ fontFamily: 'var(--font-sub)', marginBottom: 4 }}>Registrar Compra</h3>
            <div style={{ fontSize: 13, color: 'var(--brave-gray)', marginBottom: 16 }}>Cliente: <strong>{saleClient.name}</strong></div>

            <label style={{ fontSize: 12, color: 'var(--brave-gray)', display: 'block', marginBottom: 4 }}>Descrição *</label>
            <input
              className="form-input"
              style={{ width: '100%', marginBottom: 12 }}
              placeholder="Ex: Plano mensal, Aula avulsa..."
              value={saleForm.description}
              onChange={e => setSaleForm(f => ({ ...f, description: e.target.value }))}
              autoFocus
            />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: 'var(--brave-gray)', display: 'block', marginBottom: 4 }}>Valor (R$) *</label>
                <input
                  className="form-input"
                  style={{ width: '100%' }}
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={saleForm.amount}
                  onChange={e => setSaleForm(f => ({ ...f, amount: e.target.value }))}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--brave-gray)', display: 'block', marginBottom: 4 }}>Data *</label>
                <input
                  className="form-input"
                  style={{ width: '100%' }}
                  type="date"
                  value={saleForm.date}
                  onChange={e => setSaleForm(f => ({ ...f, date: e.target.value }))}
                />
              </div>
            </div>

            <label style={{ fontSize: 12, color: 'var(--brave-gray)', display: 'block', marginBottom: 4 }}>Unidade</label>
            <select
              className="form-select"
              style={{ width: '100%', marginBottom: 16 }}
              value={saleForm.unitId}
              onChange={e => setSaleForm(f => ({ ...f, unitId: e.target.value }))}
            >
              <option value="">— Nenhuma —</option>
              {units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setSaleModal(false)}>Cancelar</button>
              <button
                className="btn btn-primary"
                onClick={saveSale}
                disabled={saleSaving || !saleForm.description.trim() || !saleForm.amount || !saleForm.date}
              >
                {saleSaving ? 'Salvando...' : 'Registrar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </Shell>
  )
}
