'use client'
import { useEffect, useState, useRef } from 'react'
import Shell from '@/components/Shell'

const TYPES = ['RECEITA', 'DEDUCAO', 'CUSTO', 'DESPESA', 'IMPOSTO']

const DRE_GROUPS: Record<string, string[]> = {
  RECEITA: ['Receita Operacional', 'Receita Não Operacional'],
  DEDUCAO: ['Deduções sobre a Venda'],
  CUSTO: ['Custo do Produto/Serviço', 'Despesa Variável'],
  DESPESA: [
    'Despesas Administrativas',
    'Despesas Financeiras',
    'Despesas com Pessoal',
    'Despesas com Marketing',
    'Investimentos',
    'Despesas Não Operacionais',
  ],
  IMPOSTO: ['Impostos'],
}

const DEFAULTS = [
  // Receita Operacional
  { code: '3.1.01', name: 'Vendas Dinheiro / Pix', type: 'RECEITA', dreGroup: 'Receita Operacional' },
  { code: '3.1.02', name: 'Cartão Débito', type: 'RECEITA', dreGroup: 'Receita Operacional' },
  { code: '3.1.03', name: 'Cartão Crédito (Fluxo/Antecipado)', type: 'RECEITA', dreGroup: 'Receita Operacional' },
  { code: '3.1.04', name: 'Recebimento Cartões Alimentação / Refeição', type: 'RECEITA', dreGroup: 'Receita Operacional' },
  { code: '3.1.05', name: 'Bonificações em Dinheiro (Sell-out/Metas)', type: 'RECEITA', dreGroup: 'Receita Operacional' },
  { code: '3.1.06', name: 'Outras Receitas', type: 'RECEITA', dreGroup: 'Receita Operacional' },
  // Deduções sobre a Venda
  { code: '3.2.01', name: 'Pagamento de ICMS (Próprio e ST)', type: 'DEDUCAO', dreGroup: 'Deduções sobre a Venda' },
  { code: '3.2.02', name: 'Pagamento de PIS / COFINS', type: 'DEDUCAO', dreGroup: 'Deduções sobre a Venda' },
  { code: '3.2.03', name: 'Pagamento de ISS', type: 'DEDUCAO', dreGroup: 'Deduções sobre a Venda' },
  { code: '3.2.04', name: 'Parcelamentos Tributários (REFIS/Outros)', type: 'DEDUCAO', dreGroup: 'Deduções sobre a Venda' },
  { code: '3.2.05', name: 'Tarifas de Administração de Cartões (MDR)', type: 'DEDUCAO', dreGroup: 'Deduções sobre a Venda' },
  // Custo do Produto/Serviço
  { code: '4.1.01', name: 'Compras Mercearia Seca (Alimentos)', type: 'CUSTO', dreGroup: 'Custo do Produto/Serviço' },
  { code: '4.1.02', name: 'Compras Higiene e Limpeza', type: 'CUSTO', dreGroup: 'Custo do Produto/Serviço' },
  { code: '4.1.03', name: 'Compras Bebidas', type: 'CUSTO', dreGroup: 'Custo do Produto/Serviço' },
  { code: '4.1.04', name: 'Compras Utilidades Domésticas', type: 'CUSTO', dreGroup: 'Custo do Produto/Serviço' },
  { code: '4.1.05', name: 'Compras Açougue', type: 'CUSTO', dreGroup: 'Custo do Produto/Serviço' },
  // Despesa Variável
  { code: '4.2.01', name: 'Compras Hortifruti', type: 'CUSTO', dreGroup: 'Despesa Variável' },
  { code: '4.2.02', name: 'Compras Laticínios e Embutidos', type: 'CUSTO', dreGroup: 'Despesa Variável' },
  { code: '4.2.03', name: 'Compras Congelados Gerais', type: 'CUSTO', dreGroup: 'Despesa Variável' },
  { code: '4.2.04', name: 'Combustível Frota Própria', type: 'CUSTO', dreGroup: 'Despesa Variável' },
  { code: '4.2.05', name: 'Pedágios e Manutenção de Frota', type: 'CUSTO', dreGroup: 'Despesa Variável' },
  // Despesas Administrativas
  { code: '5.1.01', name: 'Aluguel', type: 'DESPESA', dreGroup: 'Despesas Administrativas' },
  { code: '5.1.02', name: 'Internet e Telefonia', type: 'DESPESA', dreGroup: 'Despesas Administrativas' },
  { code: '5.1.03', name: 'Energia Elétrica', type: 'DESPESA', dreGroup: 'Despesas Administrativas' },
  { code: '5.1.04', name: 'Água e Esgoto', type: 'DESPESA', dreGroup: 'Despesas Administrativas' },
  { code: '5.1.05', name: 'IPTU e Taxas Municipais', type: 'DESPESA', dreGroup: 'Despesas Administrativas' },
  { code: '5.1.06', name: 'Segurança', type: 'DESPESA', dreGroup: 'Despesas Administrativas' },
  { code: '5.1.07', name: 'Softwares de Gestão (ERP/PDV)', type: 'DESPESA', dreGroup: 'Despesas Administrativas' },
  { code: '5.1.08', name: 'Sacolas Plásticas', type: 'DESPESA', dreGroup: 'Despesas Administrativas' },
  { code: '5.1.09', name: 'Bobinas Térmicas para PDV e Balanças', type: 'DESPESA', dreGroup: 'Despesas Administrativas' },
  { code: '5.1.10', name: 'Etiquetas de Gôndola e Precificação', type: 'DESPESA', dreGroup: 'Despesas Administrativas' },
  { code: '5.1.11', name: 'Bandejas de Isopor e Papelão', type: 'DESPESA', dreGroup: 'Despesas Administrativas' },
  { code: '5.1.12', name: 'Filme PVC e Sacos para Hortifruti', type: 'DESPESA', dreGroup: 'Despesas Administrativas' },
  { code: '5.1.13', name: 'Manutenção Corretiva de Frios e Câmaras', type: 'DESPESA', dreGroup: 'Despesas Administrativas' },
  { code: '5.1.14', name: 'Reparo de Carrinhos e Cestas de Compras', type: 'DESPESA', dreGroup: 'Despesas Administrativas' },
  { code: '5.1.15', name: 'Manutenção de PDVs, Balanças e Scanners', type: 'DESPESA', dreGroup: 'Despesas Administrativas' },
  { code: '5.1.16', name: 'Material de Escritório', type: 'DESPESA', dreGroup: 'Despesas Administrativas' },
  { code: '5.1.17', name: 'Material de Limpeza e Copa', type: 'DESPESA', dreGroup: 'Despesas Administrativas' },
  { code: '5.1.18', name: 'Toners, Teclados, Mouses', type: 'DESPESA', dreGroup: 'Despesas Administrativas' },
  // Despesas Financeiras
  { code: '5.2.01', name: 'Tarifas de Manutenção de Conta Corrente', type: 'DESPESA', dreGroup: 'Despesas Financeiras' },
  { code: '5.2.02', name: 'Juros Bancários, IOF e Mora', type: 'DESPESA', dreGroup: 'Despesas Financeiras' },
  { code: '5.2.03', name: 'Juros do Empréstimo', type: 'DESPESA', dreGroup: 'Despesas Financeiras' },
  { code: '5.2.04', name: 'Amortização de Empréstimos (Principal)', type: 'DESPESA', dreGroup: 'Despesas Financeiras' },
  { code: '5.2.05', name: 'Honorários de Contabilidade', type: 'DESPESA', dreGroup: 'Despesas Financeiras' },
  // Despesas com Pessoal
  { code: '5.3.01', name: 'Salários', type: 'DESPESA', dreGroup: 'Despesas com Pessoal' },
  { code: '5.3.02', name: '13º Salário', type: 'DESPESA', dreGroup: 'Despesas com Pessoal' },
  { code: '5.3.03', name: 'Férias', type: 'DESPESA', dreGroup: 'Despesas com Pessoal' },
  { code: '5.3.04', name: 'Rescisões', type: 'DESPESA', dreGroup: 'Despesas com Pessoal' },
  { code: '5.3.05', name: 'FGTS', type: 'DESPESA', dreGroup: 'Despesas com Pessoal' },
  { code: '5.3.06', name: 'INSS', type: 'DESPESA', dreGroup: 'Despesas com Pessoal' },
  { code: '5.3.07', name: 'Comissão', type: 'DESPESA', dreGroup: 'Despesas com Pessoal' },
  { code: '5.3.08', name: 'Bonificações de Funcionários', type: 'DESPESA', dreGroup: 'Despesas com Pessoal' },
  { code: '5.3.09', name: 'Uniformes e EPIs', type: 'DESPESA', dreGroup: 'Despesas com Pessoal' },
  { code: '5.3.10', name: 'Pró-labore da Diretoria e Proprietários', type: 'DESPESA', dreGroup: 'Despesas com Pessoal' },
  // Despesas com Marketing
  { code: '5.4.01', name: 'Impressão de Encartes', type: 'DESPESA', dreGroup: 'Despesas com Marketing' },
  { code: '5.4.02', name: 'Carro de Som e Gravação de Mídias', type: 'DESPESA', dreGroup: 'Despesas com Marketing' },
  { code: '5.4.03', name: 'Gestão de Redes Sociais e Tráfego Pago', type: 'DESPESA', dreGroup: 'Despesas com Marketing' },
  { code: '5.4.04', name: 'Viagens, Hospedagens e Despesas de Diretoria', type: 'DESPESA', dreGroup: 'Despesas com Marketing' },
  { code: '5.4.05', name: 'IPVA, Vistorias e Multas', type: 'DESPESA', dreGroup: 'Despesas com Marketing' },
  { code: '5.4.06', name: 'Consultorias', type: 'DESPESA', dreGroup: 'Despesas com Marketing' },
  { code: '5.4.07', name: 'Aquisição de Máquinas e Equipamentos', type: 'DESPESA', dreGroup: 'Despesas com Marketing' },
  // Investimentos
  { code: '6.1.01', name: 'Obras, Reformas e Benfeitorias em Lojas', type: 'DESPESA', dreGroup: 'Investimentos' },
  { code: '6.1.02', name: 'Aquisição de Veículos Operacionais', type: 'DESPESA', dreGroup: 'Investimentos' },
  // Receita Não Operacional
  { code: '7.1.01', name: 'Recebimento de Empréstimo Bancário', type: 'RECEITA', dreGroup: 'Receita Não Operacional' },
  { code: '7.1.02', name: 'Recebimento de Financiamento (BNDES/CEF)', type: 'RECEITA', dreGroup: 'Receita Não Operacional' },
  { code: '7.1.03', name: 'Aporte de Capital dos Sócios', type: 'RECEITA', dreGroup: 'Receita Não Operacional' },
  { code: '7.1.04', name: 'Antecipação de Recebíveis (Factoring)', type: 'RECEITA', dreGroup: 'Receita Não Operacional' },
  { code: '7.1.05', name: 'Conta Garantida / Cheque Especial PJ', type: 'RECEITA', dreGroup: 'Receita Não Operacional' },
  { code: '7.1.06', name: 'Venda de Ativo Imobilizado', type: 'RECEITA', dreGroup: 'Receita Não Operacional' },
  { code: '7.1.07', name: 'Rendimentos de Aplicações Financeiras', type: 'RECEITA', dreGroup: 'Receita Não Operacional' },
  // Despesas Não Operacionais
  { code: '7.2.01', name: 'Pagamento de Parcela de Empréstimo', type: 'DESPESA', dreGroup: 'Despesas Não Operacionais' },
  { code: '7.2.02', name: 'Pagamento de Parcela de Financiamento', type: 'DESPESA', dreGroup: 'Despesas Não Operacionais' },
  { code: '7.2.03', name: 'Liquidação de Dívida com Fornecedor', type: 'DESPESA', dreGroup: 'Despesas Não Operacionais' },
  { code: '7.2.04', name: 'Acordo / Renegociação de Dívidas (REFIS)', type: 'DESPESA', dreGroup: 'Despesas Não Operacionais' },
  { code: '7.2.05', name: 'Devolução de Conta Garantida / Cheque PJ', type: 'DESPESA', dreGroup: 'Despesas Não Operacionais' },
  { code: '7.2.06', name: 'Distribuição de Lucros aos Sócios', type: 'DESPESA', dreGroup: 'Despesas Não Operacionais' },
  { code: '7.2.07', name: 'Retirada Extraordinária dos Sócios', type: 'DESPESA', dreGroup: 'Despesas Não Operacionais' },
  { code: '7.2.08', name: 'Multas e Penalidades Fiscais', type: 'DESPESA', dreGroup: 'Despesas Não Operacionais' },
  // Impostos
  { code: '8.1.01', name: 'Impostos sobre o Lucro', type: 'IMPOSTO', dreGroup: 'Impostos' },
]

export default function PlanoDeContas() {
  const [accounts, setAccounts] = useState<any[]>([])
  const [form, setForm] = useState({ code: '', name: '', type: 'RECEITA', dreGroup: 'Receita Operacional' })
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')
  const [seeding, setSeeding] = useState(false)
  const [importing, setImporting] = useState(false)
  const importRef = useRef<HTMLInputElement>(null)

  const load = () => fetch('/api/accounts').then(r => r.json()).then(d => { setAccounts(d); setLoading(false) })
  useEffect(() => { load() }, [])

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  const save = async () => {
    const res = await fetch('/api/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    })
    if (res.ok) {
      setForm({ code: '', name: '', type: 'RECEITA', dreGroup: 'Receita Operacional' })
      load()
      showToast('Conta criada com sucesso!')
    } else {
      const err = await res.json()
      showToast(err.error || 'Erro ao criar conta')
    }
  }

  const remove = async (id: number) => {
    if (!confirm('Remover esta conta?')) return
    await fetch(`/api/accounts/${id}`, { method: 'DELETE' })
    load()
    showToast('Conta removida')
  }

  const seedDefaults = async () => {
    setSeeding(true)
    await Promise.all(DEFAULTS.map(acc =>
      fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(acc)
      })
    ))
    await load()
    setSeeding(false)
    showToast(`Plano de contas carregado! ${DEFAULTS.length} contas criadas.`)
  }

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setImporting(true)
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch('/api/accounts/import', { method: 'POST', body: fd })
    const data = await res.json()
    if (res.ok) {
      await load()
      const parts = [`${data.imported} criadas`, `${data.updated} atualizadas`]
      if (data.errors?.length) parts.push(`${data.errors.length} erro(s)`)
      showToast(`✓ ${parts.join(', ')}`)
    } else {
      showToast(`Erro: ${data.error}`)
    }
    setImporting(false)
  }

  const grouped = TYPES.reduce((acc, t) => {
    acc[t] = accounts.filter(a => a.type === t)
    return acc
  }, {} as Record<string, any[]>)

  const typeBadge = (type: string) => {
    const map: Record<string, string> = {
      RECEITA: 'badge-receita', CUSTO: 'badge-custo',
      DESPESA: 'badge-despesa', DEDUCAO: 'badge-deducao', IMPOSTO: 'badge-imposto'
    }
    return map[type] || ''
  }

  return (
    <Shell>
      <div className="page-header flex-between">
        <div>
          <h1 className="page-title">Plano de Contas</h1>
          <p className="page-subtitle">Configure as contas que alimentam o DRE</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            ref={importRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            style={{ display: 'none' }}
            onChange={handleImportFile}
          />
          <button
            className="btn btn-secondary"
            onClick={() => importRef.current?.click()}
            disabled={importing}
          >
            {importing ? 'Importando...' : '⬆ Importar Excel/CSV'}
          </button>
          {accounts.length === 0 && (
            <button className="btn btn-secondary" onClick={seedDefaults} disabled={seeding}>
              {seeding ? 'Carregando...' : '⚡ Carregar Padrão'}
            </button>
          )}
        </div>
      </div>

      <div className="grid-2 mb-6">
        <div className="card">
          <div style={{ fontFamily: 'var(--font-sub)', fontWeight: 600, fontSize: 13, marginBottom: 20 }}>
            Nova Conta
          </div>
          <div className="form-group">
            <label className="form-label">Código</label>
            <input className="form-input" placeholder="ex: 3.1.01" value={form.code}
              onChange={e => setForm(f => ({ ...f, code: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Nome da Conta</label>
            <input className="form-input" placeholder="ex: Vendas Dinheiro / Pix" value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Tipo</label>
            <select className="form-select" value={form.type}
              onChange={e => {
                const t = e.target.value
                setForm(f => ({ ...f, type: t, dreGroup: DRE_GROUPS[t][0] }))
              }}>
              {TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Grupo no DRE</label>
            <select className="form-select" value={form.dreGroup}
              onChange={e => setForm(f => ({ ...f, dreGroup: e.target.value }))}>
              {(DRE_GROUPS[form.type] || []).map(g => <option key={g}>{g}</option>)}
            </select>
          </div>
          <button className="btn btn-primary" style={{ width: '100%' }} onClick={save}>
            + Adicionar Conta
          </button>
        </div>

        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '20px 24px 12px', fontFamily: 'var(--font-sub)', fontWeight: 600, fontSize: 13 }}>
            Contas Cadastradas ({accounts.length})
          </div>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--brave-gray)' }}>Carregando...</div>
          ) : accounts.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--brave-gray)' }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>📋</div>
              Nenhuma conta cadastrada.<br />
              <span style={{ fontSize: 12 }}>Use "Carregar Padrão" ou "Importar Excel/CSV".</span>
            </div>
          ) : (
            <div className="table-wrap" style={{ maxHeight: 420, overflowY: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Nome</th>
                    <th>Grupo DRE</th>
                    <th>Tipo</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map(a => (
                    <tr key={a.id}>
                      <td style={{ fontFamily: 'var(--font-sub)', fontWeight: 600, fontSize: 12 }}>{a.code}</td>
                      <td style={{ fontSize: 13 }}>{a.name}</td>
                      <td style={{ fontSize: 11, color: 'var(--brave-gray)' }}>{a.dreGroup}</td>
                      <td><span className={`badge ${typeBadge(a.type)}`}>{a.type}</span></td>
                      <td>
                        <button className="btn btn-danger btn-sm" onClick={() => remove(a.id)}>✕</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {accounts.length > 0 && (
        <div className="card">
          <div style={{ fontFamily: 'var(--font-sub)', fontWeight: 600, fontSize: 13, marginBottom: 16 }}>
            Estrutura do Plano de Contas
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            {TYPES.map(t => (
              <div key={t} style={{ background: 'var(--brave-light)', borderRadius: 8, padding: '12px 16px' }}>
                <span className={`badge ${typeBadge(t)}`} style={{ marginBottom: 8, display: 'inline-block' }}>{t}</span>
                <div style={{ fontFamily: 'var(--font-title)', fontSize: 22, fontWeight: 700 }}>
                  {grouped[t].length}
                </div>
                <div style={{ fontSize: 11, color: 'var(--brave-gray)' }}>
                  {grouped[t].length === 1 ? 'conta' : 'contas'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </Shell>
  )
}
