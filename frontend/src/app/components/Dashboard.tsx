'use client'

import { useEffect, useState } from 'react'
import { api, Certificate, CertRequest } from '../api'

interface Props {
  onNavigate: (page: 'dashboard' | 'certificates' | 'issue' | 'requests' | 'ca') => void
}

export default function Dashboard({ onNavigate }: Props) {
  const [certs, setCerts] = useState<Certificate[]>([])
  const [requests, setRequests] = useState<CertRequest[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.getCertificates().catch(() => [] as Certificate[]),
      api.getRequests().catch(() => [] as CertRequest[]),
    ]).then(([c, r]) => {
      setCerts(c)
      setRequests(r)
      setLoading(false)
    })
  }, [])

  const rootCA = certs.find((c) => c.type === 'ROOT')
  const valid = certs.filter((c) => c.status === 'VALID').length
  const revoked = certs.filter((c) => c.status === 'REVOKED').length
  const pending = requests.filter((r) => r.status === 'PENDING').length

  const stats = [
    { label: 'Wszystkie certyfikaty', value: certs.length, action: () => onNavigate('certificates') },
    { label: 'Ważne', value: valid, action: () => onNavigate('certificates') },
    { label: 'Unieważnione', value: revoked, action: () => onNavigate('certificates') },
    { label: 'Oczekujące żądania', value: pending, action: () => onNavigate('requests') },
  ]

  return (
    <>
      <div className="page-header">
        <h2>Pulpit</h2>
        <p>Przegląd stanu infrastruktury PKI.</p>
      </div>

      {loading ? (
        <div className="card">
          <p>Ładowanie...</p>
        </div>
      ) : (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 16,
              marginBottom: 20,
            }}
          >
            {stats.map((s) => (
              <button key={s.label} className="card" onClick={s.action} style={{ textAlign: 'left', marginBottom: 0 }}>
                <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 6 }}>{s.value}</div>
                <div style={{ color: 'var(--text-muted)' }}>{s.label}</div>
              </button>
            ))}
          </div>

          <div className="card">
            <div className="page-header" style={{ marginBottom: 16 }}>
              <h2>Status Root CA</h2>
              <p>Główny urząd certyfikacji i korzeń zaufania systemu.</p>
            </div>

            {rootCA ? (
              <div className="detail-grid">
                <div className="detail-item">
                  <label>Status</label>
                  <span className="badge badge-valid">AKTYWNY</span>
                </div>
                <div className="detail-item">
                  <label>Common Name</label>
                  <span>{rootCA.common_name}</span>
                </div>
                <div className="detail-item">
                  <label>Ważny do</label>
                  <span>{new Date(rootCA.not_after).toLocaleDateString('pl-PL')}</span>
                </div>
                <div className="detail-item">
                  <label>Numer seryjny</label>
                  <span className="mono">{rootCA.serial_number}</span>
                </div>
              </div>
            ) : (
              <>
                <div className="alert alert-info">Root CA nie zostało jeszcze zainicjowane.</div>
                <button className="btn btn-primary" onClick={() => onNavigate('ca')}>
                  Inicjalizuj Root CA
                </button>
              </>
            )}
          </div>

          <div className="card">
            <div className="page-header" style={{ marginBottom: 16 }}>
              <h2>Ostatnie certyfikaty</h2>
              <p>Pięć najnowszych wystawionych certyfikatów.</p>
            </div>

            {certs.filter((c) => c.type !== 'ROOT').length === 0 ? (
              <div className="empty-state">
                <p>Brak wystawionych certyfikatów.</p>
              </div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Common Name</th>
                      <th>Typ</th>
                      <th>Status</th>
                      <th>Ważny do</th>
                    </tr>
                  </thead>
                  <tbody>
                    {certs
                      .filter((c) => c.type !== 'ROOT')
                      .slice(0, 5)
                      .map((c) => (
                        <tr key={c.id}>
                          <td>{c.common_name}</td>
                          <td>{c.type}</td>
                          <td>
                            <span className={`badge badge-${String(c.status).toLowerCase()}`}>{c.status}</span>
                          </td>
                          <td>{new Date(c.not_after).toLocaleDateString('pl-PL')}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </>
  )
}
