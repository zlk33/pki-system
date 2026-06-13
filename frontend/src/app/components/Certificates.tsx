'use client'

import { useEffect, useState } from 'react'
import { api, Certificate } from '../api'

export default function Certificates() {
  const [certs, setCerts] = useState<Certificate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const [selected, setSelected] = useState<Certificate | null>(null)
  const [revokeTarget, setRevokeTarget] = useState<Certificate | null>(null)
  const [reason, setReason] = useState('')
  const [revokeLoading, setRevokeLoading] = useState(false)
  const [detailsLoading, setDetailsLoading] = useState(false)

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

  const openDetails = async (cert: Certificate) => {
    setDetailsLoading(true)
    setError('')
    try {
      const details = await api.getCertificateDetails(cert.id)
      setSelected(details)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Błąd pobierania szczegółów certyfikatu')
    } finally {
      setDetailsLoading(false)
    }
  }

  const downloadPem = async (cert: Certificate) => {
    setError('')
    try {
      const pem = await api.getCertificatePem(cert.id)
      const blob = new Blob([pem], { type: 'application/x-pem-file' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${(cert.common_name || `cert-${cert.id}`).replace(/\s+/g, '_')}.pem`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Błąd pobierania PEM')
    }
  }

  const openRevoke = (cert: Certificate) => {
    setRevokeTarget(cert)
    setReason('Utrata zaufania do certyfikatu')
    setMsg('')
    setError('')
  }

  const closeRevokeModal = () => {
    setRevokeTarget(null)
    setReason('')
    setRevokeLoading(false)
  }

  const closeDetailsModal = () => {
    setSelected(null)
  }

  const handleRevoke = async () => {
    if (!revokeTarget) return
    if (!reason.trim()) {
      setError('Podaj powód unieważnienia')
      return
    }

    setRevokeLoading(true)
    setError('')
    setMsg('')
    try {
      const res = await api.revokeCertificate(revokeTarget.id, reason)
      setMsg(res.message)
      closeRevokeModal()
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
                    <div className="actions-inline">
                      <button className="btn btn-secondary" onClick={() => openDetails(c)} disabled={detailsLoading}>
                        Szczegóły
                      </button>
                      <button className="btn btn-ghost" onClick={() => downloadPem(c)}>
                        Pobierz PEM
                      </button>
                      {c.status === 'VALID' && c.type !== 'ROOT' ? (
                        <button className="btn btn-danger" onClick={() => openRevoke(c)}>
                          Unieważnij
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 900 }}>
            <div className="modal-header">
              <h3>Szczegóły certyfikatu</h3>
              <button className="close-btn" onClick={closeDetailsModal}>
                ×
              </button>
            </div>

            <div className="detail-grid">
              <div className="detail-item"><label>ID</label><span>{selected.id}</span></div>
              <div className="detail-item"><label>Serial Number</label><span className="mono">{selected.serial_number}</span></div>
              <div className="detail-item"><label>Common Name</label><span>{selected.common_name || '—'}</span></div>
              <div className="detail-item"><label>Organizacja</label><span>{selected.organization || '—'}</span></div>
              <div className="detail-item"><label>Typ</label><span>{selected.type}</span></div>
              <div className="detail-item"><label>Status</label><span>{selected.status}</span></div>
              <div className="detail-item"><label>Ważny od</label><span>{selected.not_before ? new Date(selected.not_before).toLocaleString('pl-PL') : '—'}</span></div>
              <div className="detail-item"><label>Ważny do</label><span>{selected.not_after ? new Date(selected.not_after).toLocaleString('pl-PL') : '—'}</span></div>
              <div className="detail-item"><label>Unieważniony</label><span>{selected.revoked_at ? new Date(selected.revoked_at).toLocaleString('pl-PL') : 'Nie'}</span></div>
              <div className="detail-item"><label>Powód unieważnienia</label><span>{selected.revocation_reason || '—'}</span></div>
            </div>

            <div className="form-group" style={{ marginTop: 20 }}>
              <label>PEM</label>
              <textarea readOnly value={selected.pem_data || ''} rows={14} style={{ width: '100%', fontFamily: 'monospace', fontSize: 12 }} />
            </div>

            <div className="actions" style={{ marginTop: 20 }}>
              <button className="btn btn-ghost" onClick={() => downloadPem(selected)}>
                Pobierz PEM
              </button>
            </div>
          </div>
        </div>
      )}

      {revokeTarget && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h3>Unieważnij certyfikat</h3>
              <button className="close-btn" onClick={closeRevokeModal}>
                ×
              </button>
            </div>

            <div className="detail-grid" style={{ marginBottom: 16 }}>
              <div className="detail-item">
                <label>Common Name</label>
                <span>{revokeTarget.common_name || '—'}</span>
              </div>
              <div className="detail-item">
                <label>Typ</label>
                <span>{revokeTarget.type}</span>
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
              <button className="btn btn-ghost" onClick={closeRevokeModal} disabled={revokeLoading}>
                Anuluj
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
