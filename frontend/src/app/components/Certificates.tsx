'use client'

import { useEffect, useState } from 'react'
import { api, Certificate } from '../api'

export default function Certificates() {
  const [certs, setCerts] = useState<Certificate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await api.getCertificates()
      setCerts(data)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Błąd ładowania certyfikatów')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  return (
    <div className="card">
      <div className="page-header" style={{ marginBottom: 16 }}>
        <h2>Lista wszystkich certyfikatów w systemie</h2>
        <p>Przegląd aktywnych certyfikatów zapisanych w bazie.</p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <p>Ładowanie...</p>
      ) : certs.length === 0 ? (
        <div className="empty-state">
          <p>Brak certyfikatów w systemie.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Common Name</th>
                <th>Organizacja</th>
                <th>Typ</th>
                <th>Status</th>
                <th>Ważny od</th>
                <th>Ważny do</th>
                <th>Numer seryjny</th>
              </tr>
            </thead>
            <tbody>
              {certs.map((c) => (
                <tr key={c.id}>
                  <td>{c.common_name || '—'}</td>
                  <td>{c.organization || '—'}</td>
                  <td>
                    <span className={`badge badge-${String(c.type).toLowerCase()}`}>{c.type}</span>
                  </td>
                  <td>
                    <span className={`badge badge-${String(c.status).toLowerCase()}`}>{c.status}</span>
                  </td>
                  <td>{c.not_before ? new Date(c.not_before).toLocaleDateString('pl-PL') : '—'}</td>
                  <td>{c.not_after ? new Date(c.not_after).toLocaleDateString('pl-PL') : '—'}</td>
                  <td className="mono">{c.serial_number}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
