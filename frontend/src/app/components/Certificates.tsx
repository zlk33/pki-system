'use client'

import { useEffect, useState } from 'react'
import { api, Certificate } from '../api'

export default function Certificates() {
  const [certs, setCerts] = useState<Certificate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<Certificate | null>(null)
  const [revokeId, setRevokeId] = useState<number | null>(null)
  const [revokeReason, setRevokeReason] = useState('')
  const [revokeLoading, setRevokeLoading] = useState(false)
  const [keyLoadingId, setKeyLoadingId] = useState<number | null>(null)
  const [msg, setMsg] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const data = await api.getCertificates()
      setCerts(data)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Błąd ładowania')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleDownloadKey = async (certId: number) => {
    setKeyLoadingId(certId)
    setError('')
    try {
      await api.downloadPrivateKey(certId)
      setMsg('Klucz prywatny został pobrany')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Błąd pobierania klucza')
    } finally {
      setKeyLoadingId(null)
    }
  }

  const handleRevoke = async () => {
    if (!revokeId) return
    setRevokeLoading(true)
    try {
      const res = await api.revokeCertificate(revokeId, revokeReason || 'unspecified')
      setMsg(res.message)
      setRevokeId(null)
      setRevokeReason('')
      load()
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : 'Błąd unieważniania')
    } finally {
      setRevokeLoading(false)
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2>Certyfikaty</h2>
        <p>Lista wszystkich certyfikatów w systemie</p>
      </div>

      {msg && <div className="alert alert-success">{msg}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Ładowanie...</div>
        ) : certs.length === 0 ? (
          <div className="empty-state"><p>Brak certyfikatów w systemie</p></div>
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
                {certs.map(c => (
                  <tr key={c.id}>
                    <td style={{ fontWeight: 500 }}>{c.common_name}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{c.organization || '—'}</td>
                    <td><span className={`badge badge-${c.type.toLowerCase()}`}>{c.type}</span></td>
                    <td><span className={`badge badge-${c.status.toLowerCase()}`}>{c.status}</span></td>
                    <td style={{ color: 'var(--text-muted)' }}>{c.not_before ? new Date(c.not_before).toLocaleDateString('pl-PL') : '—'}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{c.not_after ? new Date(c.not_after).toLocaleDateString('pl-PL') : '—'}</td>
                    <td>
                      <div className="actions">
                        <button className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => setSelected(c)}>
                          Szczegóły
                        </button>
                        {c.has_private_key && (
                          <button
                            className="btn btn-ghost"
                            style={{ fontSize: 12, padding: '6px 12px' }}
                            disabled={keyLoadingId === c.id}
                            onClick={() => handleDownloadKey(c.id)}
                          >
                            {keyLoadingId === c.id ? <span className="spinner" /> : 'Pobierz klucz'}
                          </button>
                        )}
                        {c.status === 'VALID' && c.type !== 'ROOT' && (
                          <button className="btn btn-danger" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => setRevokeId(c.id)}>
                            Unieważnij
                          </button>
                        )}
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
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Szczegóły certyfikatu</h3>
              <button className="close-btn" onClick={() => setSelected(null)}>×</button>
            </div>
            <div className="detail-grid" style={{ marginBottom: 16 }}>
              <div className="detail-item">
                <label>Common Name</label>
                <span>{selected.common_name}</span>
              </div>
              <div className="detail-item">
                <label>Organizacja</label>
                <span>{selected.organization || '—'}</span>
              </div>
              <div className="detail-item">
                <label>Typ</label>
                <span><span className={`badge badge-${selected.type.toLowerCase()}`}>{selected.type}</span></span>
              </div>
              <div className="detail-item">
                <label>Status</label>
                <span><span className={`badge badge-${selected.status.toLowerCase()}`}>{selected.status}</span></span>
              </div>
              <div className="detail-item">
                <label>Ważny od</label>
                <span>{selected.not_before ? new Date(selected.not_before).toLocaleString('pl-PL') : '—'}</span>
              </div>
              <div className="detail-item">
                <label>Ważny do</label>
                <span>{selected.not_after ? new Date(selected.not_after).toLocaleString('pl-PL') : '—'}</span>
              </div>
              {selected.revoked_at && (
                <div className="detail-item">
                  <label>Unieważniony</label>
                  <span>{new Date(selected.revoked_at).toLocaleString('pl-PL')}</span>
                </div>
              )}
              {selected.revocation_reason && (
                <div className="detail-item">
                  <label>Powód unieważnienia</label>
                  <span>{selected.revocation_reason}</span>
                </div>
              )}
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Numer seryjny
              </label>
              <div className="mono" style={{ marginTop: 4, marginBottom: 12 }}>{selected.serial_number}</div>
            </div>
            <div>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Certyfikat PEM
              </label>
              <div className="pem-box">{selected.pem_data}</div>
            </div>
          </div>
        </div>
      )}

      {revokeId && (
        <div className="modal-overlay" onClick={() => setRevokeId(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Unieważnij certyfikat</h3>
              <button className="close-btn" onClick={() => setRevokeId(null)}>×</button>
            </div>
            <div className="alert alert-error">Ta operacja jest nieodwracalna.</div>
            <div className="form-group">
              <label>Powód unieważnienia</label>
              <select value={revokeReason} onChange={e => setRevokeReason(e.target.value)}>
                <option value="">unspecified</option>
                <option value="keyCompromise">keyCompromise</option>
                <option value="cACompromise">cACompromise</option>
                <option value="affiliationChanged">affiliationChanged</option>
                <option value="superseded">superseded</option>
                <option value="cessationOfOperation">cessationOfOperation</option>
              </select>
            </div>
            <div className="actions" style={{ justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setRevokeId(null)}>Anuluj</button>
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
