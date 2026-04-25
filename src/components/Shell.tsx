'use client'
import { usePathname, useRouter } from 'next/navigation'
import LogoBrave from '@/components/LogoBrave'

const NAV = [
  { href: '/dashboard', icon: '◈', label: 'Dashboard' },
  { href: '/unidades', icon: '🏢', label: 'Unidades' },
  { href: '/plano-de-contas', icon: '≡', label: 'Plano de Contas' },
  { href: '/lancamentos', icon: '↑↓', label: 'Lançamentos / OFX' },
  { href: '/saldo', icon: '◉', label: 'Saldo Bancário' },
  { href: '/dre', icon: '▦', label: 'DRE' },
]

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()

  return (
    <>
      <header className="topbar">
        <div className="topbar-logo">
          <LogoBrave height={32} />
          <span style={{ marginLeft: 8 }}>Prism</span>
        </div>
        <div className="topbar-right">
          <span className="topbar-badge">v1.0</span>
        </div>
      </header>

      <nav className="sidebar">
        <div className="sidebar-section">
          <div className="sidebar-label">Menu</div>
          {NAV.map(n => (
            <button
              key={n.href}
              className={`sidebar-item ${pathname.startsWith(n.href) ? 'active' : ''}`}
              onClick={() => router.push(n.href)}
            >
              <span className="sidebar-icon">{n.icon}</span>
              {n.label}
            </button>
          ))}
        </div>
      </nav>

      <main className="main">{children}</main>
    </>
  )
}
