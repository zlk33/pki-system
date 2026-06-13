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
    <div>
      <div className="page-header">
        <h2>Certyfikaty</h2>
        <p>Lista wszystkich certyfikatów w systemie.</p>
      </div>

      {msg && <div className="alert alert-success">{msg}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Ładowanie...</div>
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
                      <div style={{ fontWeight: 500 }}>{c.common_name || '—'}</div>
                      <div className="mono">{c.serial_number}</div>
                    </td>
                    <td style={{ color: 'var(--text-muted)' }}>{c.organization || '—'}</td>
                    <td>
                      <span className={`badge badge-${String(c.type).toLowerCase()}`}>{c.type}</span>
                    </td>
                    <td>
                      <span className={`badge badge-${String(c.status).toLowerCase()}`}>{c.status}</span>
                    </td>
                    <td style={{ color: 'var(--text-muted)' }}>
                      {c.not_before ? new Date(c.not_before).toLocaleDateString('pl-PL') : '—'}
                    </td>
                    <td style={{ color: 'var(--text-muted)' }}>
                      {c.not_after ? new Date(c.not_after).toLocaleDateString('pl-PL') : '—'}
                    </td>
                    <td>
                      <div className="actions" style={{ gap: 8, flexWrap: 'wrap' }}>
                        <button
                          className="btn btn-ghost"
                          style={{ fontSize: 12, padding: '6px 12px' }}
                          onClick={() => openDetails(c)}
                          disabled={detailsLoading}
                        >
                          Szczegóły
                        </button>
                        <button
                          className="btn btn-ghost"
                          style={{ fontSize: 12, padding: '6px 12px' }}
                          onClick={() => downloadPem(c)}
                        >
                          Pobierz PEM
                        </button>
                        {c.status === 'VALID' && c.type !== 'ROOT' ? (
                          <button
                            className="btn btn-danger"
                            style={{ fontSize: 12, padding: '6px 12px' }}
                            onClick={() => openRevoke(c)}
                          >
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
      </div>

      {selected && (
        <div className="modal-overlay" onClick={closeDetailsModal}>
          <div
            className="modal"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(920px, calc(100vw - 32px))',
              maxHeight: '90vh',
              overflow: 'hidden',
              padding: 0,
            }}
          >
            <div
              className="modal-header"
              style={{
                padding: '20px 24px 16px',
                borderBottom: '1px solid var(--border)',
                position: 'sticky',
                top: 0,
                background: 'var(--surface)',
                zIndex: 2,
              }}
            >
              <h3>Szczegóły certyfikatu</h3>
              <button className="close-btn" onClick={closeDetailsModal}>
                ×
              </button>
            </div>

            <div
              style={{
                padding: 24,
                maxHeight: 'calc(90vh - 76px)',
                overflowY: 'auto',
                scrollbarWidth: 'none',
                msOverflowStyle: 'none',
              }}
              className="modal-content-no-scrollbar"
            >
              <div className="detail-grid" style={{ marginBottom: 16 }}>
                <div className="detail-item"><label>Common Name</label><span>{selected.common_name || '—'}</span></div>
                <div className="detail-item"><label>Organizacja</label><span>{selected.organization || '—'}</span></div>
                <div className="detail-item"><label>Typ</label><span><span className={`badge badge-${String(selected.type).toLowerCase()}`}>{selected.type}</span></span></div>
                <div className="detail-item"><label>Status</label><span><span className={`badge badge-${String(selected.status).toLowerCase()}`}>{selected.status}</span></span></div>
                <div className="detail-item"><label>Ważny od</label><span>{selected.not_before ? new Date(selected.not_before).toLocaleString('pl-PL') : '—'}</span></div>
                <div className="detail-item"><label>Ważny do</label><span>{selected.not_after ? new Date(selected.not_after).toLocaleString('pl-PL') : '—'}</span></div>
                {selected.revoked_at ? (
                  <div className="detail-item"><label>Unieważniony</label><span>{new Date(selected.revoked_at).toLocaleString('pl-PL')}</span></div>
                ) : null}
                {selected.revocation_reason ? (
                  <div className="detail-item"><label>Powód unieważnienia</label><span>{selected.revocation_reason}</span></div>
                ) : null}
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Numer seryjny
                </label>
                <div className="mono" style={{ marginTop: 4 }}>{selected.serial_number}</div>
              </div>

              <div>
                <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Certyfikat PEM
                </label>
                <pre
                  style={{
                    marginTop: 8,
                    padding: 16,
                    borderRadius: 12,
                    background: 'var(--surface-alt)',
                    border: '1px solid var(--border)',
                    overflowX: 'auto',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    fontSize: 12,
                    lineHeight: 1.5,
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                  }}
                >
                  {selected.pem_data || 'Brak danych PEM'}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}

      {revokeTarget && (
        <div className="modal-overlay" onClick={closeRevokeModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Unieważnij certyfikat</h3>
              <button className="close-btn" onClick={closeRevokeModal}>×</button>
            </div>

            <div className="alert alert-error">Ta operacja jest nieodwracalna.</div>

            <div className="form-group">
              <label>Powód unieważnienia</label>
              <select value={reason} onChange={(e) => setReason(e.target.value)}>
                <option value="Utrata zaufania do certyfikatu">Utrata zaufania do certyfikatu</option>
                <option value="keyCompromise">keyCompromise</option>
                <option value="cACompromise">cACompromise</option>
                <option value="affiliationChanged">affiliationChanged</option>
                <option value="superseded">superseded</option>
                <option value="cessationOfOperation">cessationOfOperation</option>
              </select>
            </div>

            <div className="actions" style={{ justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={closeRevokeModal}>Anuluj</button>
              <button className="btn btn-danger" onClick={handleRevoke} disabled={revokeLoading}>
                {revokeLoading ? <span className="spinner" /> : null}
                Unieważnij
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
