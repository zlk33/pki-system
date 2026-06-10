'use client'

import { useState } from 'react'
import Dashboard from './components/Dashboard'
import Certificates from './components/Certificates'
import IssueCert from './components/IssueCert'
import Requests from './components/Requests'
import CAInit from './components/CAInit'

type Page = 'dashboard' | 'certificates' | 'issue' | 'requests' | 'ca'

const NAV = [
  { id: 'dashboard', label: 'Pulpit', icon: '▦' },
  { id: 'ca', label: 'Root CA', icon: '⬡' },
  { id: 'certificates', label: 'Certyfikaty', icon: '◈' },
  { id: 'issue', label: 'Wystaw certyfikat', icon: '+' },
  { id: 'requests', label: 'Żądania CSR', icon: '◎' },
] as const

export default function Home() {
  const [page, setPage] = useState<Page>('dashboard')

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <h1>PKI System</h1>
          <p>Zarządzanie certyfikatami</p>
        </div>
        {NAV.map(n => (
          <button
            key={n.id}
            className={`nav-item${page === n.id ? ' active' : ''}`}
            onClick={() => setPage(n.id as Page)}
          >
            <span style={{ fontSize: 16 }}>{n.icon}</span>
            {n.label}
          </button>
        ))}
      </aside>
      <main className="main">
        {page === 'dashboard' && <Dashboard onNavigate={setPage} />}
        {page === 'ca' && <CAInit />}
        {page === 'certificates' && <Certificates />}
        {page === 'issue' && <IssueCert onDone={() => setPage('certificates')} />}
        {page === 'requests' && <Requests />}
      </main>
    </div>
  )
}
