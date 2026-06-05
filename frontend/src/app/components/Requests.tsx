'use client'

import { useEffect, useState } from 'react'
import { api, CertRequest } from '../api'

export default function Requests() {
  const [requests, setRequests] = useState<CertRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const [tab, setTab] = useState<'list' | 'submit'>('list')
  const [csrForm, setCsrForm] = useState({ common_name: '', csr_pem_data: '' })
  const [submitLoading, setSubmitLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState<number | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const data = await api.getRequests()
      setRequests(data)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Błąd ładowania')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleSubmitCSR = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitLoading(true)
    setMsg('')
    try {
      const res = await api.submitCSR(csrForm)
      setMsg(res.message)
      setCsrForm({ common_name: '', csr_pem_data: '' })
      setTab('list')
      load()
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : 'Błąd wysyłania')
    } finally {
      setSubmitLoading(false)
    }
  }

  const handleAction = async (id: number, action: 'approve' | 'reject') => {
    setActionLoading(id)
    try {
      const res = action === 'approve' ? await api.approveRequest(id) : await api.rejectRequest(id)
      setMsg(res.message)
      load()
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : 'Błąd operacji')
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2>Żądania CSR</h2>
        <p>Zarządzanie żądaniami podpisania certyfikatów</p>
      </div>

      {msg && <div className="alert alert-success">{msg}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button className={`btn ${tab === 'list' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('list')}>
          Lista żądań
        </button>
        <button className={`btn ${tab === 'submit' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('submit')}>
          Prześlij CSR
        </button>
      </div>

      {tab === 'list' && (
        <div className="card" style={{ padding: 0 }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Ładowanie...</div>
          ) : requests.length === 0 ? (
            <div className="empty-state"><p>Brak żądań CSR</p></div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Common Name</th>
                    <th>Status</th>
                    <th>Data przesłania</th>
                    <th>Akcje</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map(r => (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 500 }}>{r.common_name}</td>
                      <td><span className={`badge badge-${r.status.toLowerCase()}`}>{r.status}</span></td>
                      <td style={{ color: 'var(--text-muted)' }}>{new Date(r.created_at).toLocaleString('pl-PL')}</td>
                      <td>
                        {r.status === 'PENDING' && (
                          <div className="actions">
                            <button
                              className="btn btn-primary"
                              style={{ fontSize: 12, padding: '4px 10px' }}
                              disabled={actionLoading === r.id}
                              onClick={() => handleAction(r.id, 'approve')}
                            >
                              {actionLoading === r.id ? <span className="spinner" /> : 'Zatwierdz'}
                            </button>
                            <button
                              className="btn btn-danger"
                              style={{ fontSize: 12, padding: '4px 10px' }}
                              disabled={actionLoading === r.id}
                              onClick={() => handleAction(r.id, 'reject')}
                            >
                              Odrzuc
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'submit' && (
        <div className="card">
          <div className="card-title">Prześlij żądanie podpisania certyfikatu (CSR)</div>
          <form onSubmit={handleSubmitCSR}>
            <div className="form-group">
              <label>Common Name</label>
              <input
                placeholder="np. example.com"
                value={csrForm.common_name}
                onChange={e => setCsrForm(f => ({ ...f, common_name: e.target.value }))}
                required
              />
            </div>
            <div className="form-group">
              <label>CSR (PEM)</label>
              <textarea
                rows={10}
                placeholder="-----BEGIN CERTIFICATE REQUEST-----&#10;...&#10;-----END CERTIFICATE REQUEST-----"
                value={csrForm.csr_pem_data}
                onChange={e => setCsrForm(f => ({ ...f, csr_pem_data: e.target.value }))}
                required
                style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: 12 }}
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={submitLoading}>
              {submitLoading ? <span className="spinner" /> : null}
              Prześlij CSR
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
