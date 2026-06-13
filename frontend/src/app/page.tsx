'use client'

import { useState } from 'react'
import Dashboard from './components/Dashboard'
import Certificates from './components/Certificates'
import IssueCert from './components/IssueCert'
import Requests from './components/Requests'
import CAInit from './components/CAInit'
import GenerateCertificate from './components/GenerateCertificate'

type Page = 'dashboard' | 'certificates' | 'issue' | 'requests' | 'ca' | 'generate'

const NAV = [
  { id: 'dashboard', label: 'Pulpit', icon: '▦' },
  { id: 'ca', label: 'Root CA', icon: '⬡' },
  { id: 'certificates', label: 'Certyfikaty', icon: '◈' },
  { id: 'issue', label: 'Wystaw certyfikat', icon: '+' },
  { id: 'requests', label: 'Żądania CSR', icon: '◎' },
  { id: 'generate', label: 'Generuj certyfikat', icon: '✦' },
] as const

export default function Home() {
  const [page, setPage] = useState<Page>('dashboard')

  return (
    <>
      {page === 'dashboard' && <Dashboard />}
      {page === 'ca' && <CAInit />}
      {page === 'certificates' && <Certificates />}
      {page === 'issue' && <IssueCert onIssued={() => setPage('certificates')} />}
      {page === 'requests' && <Requests />}
      {page === 'generate' && <GenerateCertificate />}
    </>
  )
}