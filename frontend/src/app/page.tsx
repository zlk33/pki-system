'use client'

import { useState } from 'react'
import Dashboard from './components/Dashboard'
import Certificates from './components/Certificates'
import IssueCert from './components/IssueCert'
import Requests from './components/Requests'
import CAInit from './components/CAInit'
import GenerateCertificate from './components/GenerateCertificate'

type Page = 'dashboard' | 'certificates' | 'issue' | 'requests' | 'ca' | 'generate'

const NAV: { id: Page; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Pulpit', icon: '▦' },
  { id: 'ca', label: 'Root CA', icon: '⬡' },
  { id: 'certificates', label: 'Certyfikaty', icon: '◈' },
  { id: 'issue', label: 'Wystaw certyfikat', icon: '+' },
  { id: 'generate', label: 'Generuj z formularza', icon: '✦' },
  { id: 'requests', label: 'Żądania CSR', icon: '◎' },
]

export default function Home() {
  const [page, setPage] = useState<Page>('dashboard')

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <h1>Studenckie PKI</h1>
          <p>Panel zarządzania</p>
        </div>

        <nav>
          {NAV.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${page === item.id ? 'active' : ''}`}
              onClick={() => setPage(item.id)}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      <main className="main">
        {page === 'dashboard' && <Dashboard onNavigate={setPage} />}
        {page === 'ca' && <CAInit />}
        {page === 'certificates' && <Certificates />}
        {page === 'issue' && <IssueCert onDone={() => setPage('certificates')} />}
        {page === 'generate' && <GenerateCertificate />}
        {page === 'requests' && <Requests />}
      </main>
    </div>
  )
}
