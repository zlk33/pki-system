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

  const rootCA = certs.find(c => c.type === 'ROOT')
  const valid = certs.filter(c => c.status === 'VALID').length
  const revoked = certs.filter(c => c.status === 'REVOKED').length
  const pending = requests.filter(r => r.status === 'PENDING').length

  const stats = [
    { label: 'Wszystkie certyfikaty', value: certs.length, color: 'var(--accent)', action: () => onNavigate('certificates') },
    { label: 'Ważne', value: valid, color: 'var(--success)', action: () => onNavigate('certificates') },
    { label: 'Unieważnione', value: revoked, color: 'var(--error)', action: () => onNavigate('certificates') },
    { label: 'Oczekujące żądania', value: pending, color: 'var(--warning)', action: () => onNavigate('requests') },
  ]

  return (
    <div>
      <div className="page-header">
        <h2>Pulpit</h2>
        <p>Przegląd stanu infrastruktury PKI</p>
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-muted)', padding: '40px 0' }}>Ładowanie...</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
            {stats.map(s => (
              <div
                key={s.label}
                className="card"
                style={{ cursor: 'pointer', marginBottom: 0 }}
                onClick={s.action}
              >
                <div style={{ fontSize: 32, fontWeight: 700, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{s.label}</div>
              </div>
            ))}
          </div>

          <div className="card">
            <div className="card-title">Status Root CA</div>
            {rootCA ? (
              <div className="detail-grid">
                <div className="detail-item">
                  <label>Status</label>
                  <span><span className="badge badge-valid">AKTYWNY</span></span>
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
                  <span className="mono">{rootCA.serial_number.slice(0, 24)}...</span>
                </div>
              </div>
            ) : (
              <div>
                <div className="alert alert-info" style={{ marginBottom: 12 }}>
                  Root CA nie zostało jeszcze zainicjowane.
                </div>
                <button className="btn btn-primary" onClick={() => onNavigate('ca')}>
                  Inicjalizuj Root CA
                </button>
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-title">
              Ostatnie certyfikaty
              <button className="btn btn-ghost" style={{ marginLeft: 'auto', fontSize: 12, padding: '4px 10px' }} onClick={() => onNavigate('certificates')}>
                Wszystkie
              </button>
            </div>
            {certs.filter(c => c.type !== 'ROOT').length === 0 ? (
              <div className="empty-state">
                <p>Brak wystawionych certyfikatów</p>
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
                    {certs.filter(c => c.type !== 'ROOT').slice(0, 5).map(c => (
                      <tr key={c.id}>
                        <td>{c.common_name}</td>
                        <td><span className={`badge badge-${c.type.toLowerCase()}`}>{c.type}</span></td>
                        <td><span className={`badge badge-${c.status.toLowerCase()}`}>{c.status}</span></td>
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
    </div>
  )
}
