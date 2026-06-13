'use client'

import { useEffect, useState } from 'react'
import { api, Certificate } from '../api'

export default function Certificates() {
  const [certs, setCerts] = useState<Certificate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const [selected, setSelected] = useState<Certificate | null>(null)
  const [reason, setReason] = useState('')
  const [revokeLoading, setRevokeLoading] = useState(false)

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

  const openRevoke = (cert: Certificate) => {
    setSelected(cert)
    setReason('Utrata zaufania do certyfikatu')
    setMsg('')
    setError('')
  }

  const closeModal = () => {
    setSelected(null)
    setReason('')
    setRevokeLoading(false)
  }

  const handleRevoke = async () => {
    if (!selected) return
    if (!reason.trim()) {
      setError('Podaj powód unieważnienia')
      return
    }

    setRevokeLoading(true)
    setError('')
    setMsg('')
    try {
      const res = await api.revokeCertificate(selected.id, reason)
      setMsg(res.message)
      closeModal()
      await load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Błąd unieważniania certyfikatu')
      setRevokeLoading(false)
    }
  }

  return (
    <div className="card">
      <div className="page-header" style={{ marginBottom: 16 }}>
        <h2>Lista wszystkich certyfikatów w systemie</h2>
        <p>Przegląd aktywnych i unieważnionych certyfikatów zapisanych w bazie.</p>
      </div>

      {msg && <div className="alert alert-success">{msg}</div>}
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
                <th>Akcje</th>
              </tr>
            </thead>
            <tbody>
              {certs.map((c) => (
                <tr key={c.id}>
                  <td>
                    <div>{c.common_name || '—'}</div>
                    <div className="mono">{c.serial_number}</div>
                  </td>
                  <td>{c.organization || '—'}</td>
                  <td>
                    <span className={`badge badge-${String(c.type).toLowerCase()}`}>{c.type}</span>
                  </td>
                  <td>
                    <span className={`badge badge-${String(c.status).toLowerCase()}`}>{c.status}</span>
                    {c.status === 'REVOKED' && c.revoked_at ? (
                      <div className="mono" style={{ marginTop: 6 }}>
                        {new Date(c.revoked_at).toLocaleString('pl-PL')}
                      </div>
                    ) : null}
                  </td>
                  <td>{c.not_before ? new Date(c.not_before).toLocaleDateString('pl-PL') : '—'}</td>
                  <td>{c.not_after ? new Date(c.not_after).toLocaleDateString('pl-PL') : '—'}</td>
                  <td>
                    {c.status === 'VALID' && c.type !== 'ROOT' ? (
                      <button className="btn btn-danger" onClick={() => openRevoke(c)}>
                        Unieważnij
                      </button>
                    ) : (
                      <span>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3>Unieważnij certyfikat</h3>
              <button className="close-btn" onClick={closeModal}>
                ×
              </button>
            </div>

            <div className="detail-grid" style={{ marginBottom: 16 }}>
              <div className="detail-item">
                <label>Common Name</label>
                <span>{selected.common_name || '—'}</span>
              </div>
              <div className="detail-item">
                <label>Typ</label>
                <span>{selected.type}</span>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="revocation_reason">Powód unieważnienia</label>
              <textarea
                id="revocation_reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={4}
                style={{ resize: 'vertical', width: '100%' }}
              />
            </div>

            <div className="actions" style={{ marginTop: 20 }}>
              <button className="btn btn-danger" onClick={handleRevoke} disabled={revokeLoading}>
                {revokeLoading ? 'Unieważnianie...' : 'Potwierdź unieważnienie'}
              </button>
              <button className="btn btn-ghost" onClick={closeModal} disabled={revokeLoading}>
                Anuluj
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
