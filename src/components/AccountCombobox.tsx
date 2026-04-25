'use client'
import { useState, useRef, useEffect } from 'react'

interface Account {
  id: number
  code: string
  name: string
  type: string
}

interface Props {
  accounts: Account[]
  value: string
  onChange: (value: string) => void
}

export default function AccountCombobox({ accounts, value, onChange }: Props) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const selected = accounts.find(a => String(a.id) === value)

  const filtered = query.trim()
    ? accounts.filter(a =>
        a.name.toLowerCase().includes(query.toLowerCase()) ||
        a.code.toLowerCase().includes(query.toLowerCase())
      )
    : accounts

  const neutroItems = filtered.filter(a => a.type === 'NEUTRO')
  const otherItems = filtered.filter(a => a.type !== 'NEUTRO')
  const sorted = [...neutroItems, ...otherItems]

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const select = (account: Account) => {
    onChange(String(account.id))
    setQuery('')
    setOpen(false)
  }

  const clear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange('')
    setQuery('')
    setOpen(false)
  }

  const displayValue = open ? query : (selected?.name ?? '')

  return (
    <div ref={containerRef} style={{ position: 'relative', minWidth: 200 }}>
      <div style={{ position: 'relative' }}>
        <input
          type="text"
          className="form-input"
          style={{ fontSize: 12, padding: '5px 8px', paddingRight: value ? 26 : 8, width: '100%' }}
          value={displayValue}
          placeholder="— Buscar conta..."
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => { setQuery(''); setOpen(true) }}
        />
        {value && (
          <button
            onMouseDown={clear}
            style={{
              position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--brave-gray)', fontSize: 11, padding: 0, lineHeight: 1,
            }}
          >✕</button>
        )}
      </div>

      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 2px)',
          left: 0, right: 0,
          background: 'var(--brave-white)',
          border: '1px solid rgba(43,45,66,0.15)',
          borderRadius: 8,
          zIndex: 300,
          maxHeight: 240,
          overflowY: 'auto',
          boxShadow: '0 6px 16px rgba(0,0,0,0.12)',
        }}>
          {sorted.length === 0 ? (
            <div style={{ padding: '10px 12px', fontSize: 12, color: 'var(--brave-gray)' }}>
              Nenhuma conta encontrada
            </div>
          ) : sorted.map((a, i) => {
            const isNeutro = a.type === 'NEUTRO'
            const showSep = i === neutroItems.length && neutroItems.length > 0
            return (
              <div key={a.id}>
                {showSep && <div style={{ height: 1, background: 'var(--brave-light)', margin: '2px 0' }} />}
                <div
                  onMouseDown={() => select(a)}
                  style={{
                    padding: '8px 12px',
                    cursor: 'pointer',
                    fontSize: 12,
                    color: isNeutro ? '#546e7a' : 'var(--brave-dark)',
                    fontWeight: isNeutro ? 600 : 400,
                    background: String(a.id) === value ? 'var(--brave-light)' : isNeutro ? '#f5f7f8' : 'transparent',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#edf2f4')}
                  onMouseLeave={e => (e.currentTarget.style.background =
                    String(a.id) === value ? 'var(--brave-light)' : isNeutro ? '#f5f7f8' : 'transparent'
                  )}
                >
                  {isNeutro ? '↔ ' : <span style={{ color: 'var(--brave-gray)', marginRight: 6 }}>{a.code} —</span>}
                  {a.name}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
