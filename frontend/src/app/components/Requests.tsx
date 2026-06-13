'use client'

import { FormEvent, useEffect, useState } from 'react'
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
    setError('')
    try {
      const data = await api.getRequests()
      setRequests(data)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Błąd ładowania')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const handleSubmitCSR = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitLoading(true)
    setMsg('')
    setError('')
    try {
      const res = await api.submitCSR(csrForm)
      setMsg(res.message)
      setCsrForm({ common_name: '', csr_pem_data: '' })
      setTab('list')
      await load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Błąd wysyłania')
    } finally {
      setSubmitLoading(false)
    }
  }

  const handleAction = async (id: number, action: 'approve' | 'reject') => {
    setActionLoading(id)
    setMsg('')
    setError('')
    try {
      const res = action === 'approve' ? await api.approveRequest(id) : await api.rejectRequest(id)
      setMsg(res.message)
      await load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Błąd operacji')
    } finally {
      setActionLoading(null)
    }
  }

  return (
    <div className="card">
      <div className="page-header" style={{ marginBottom: 16 }}>
        <h2>Żądania CSR</h2>
        <p>Zarządzanie żądaniami podpisania certyfikatów.</p>
      </div>

      {msg && <div className="alert alert-success">{msg}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      <div className="tabbar" style={{ marginBottom: 16 }}>
        <button className={`tab ${tab === 'list' ? 'active' : ''}`} onClick={() => setTab('list')}>
          Lista żądań
        </button>
        <button className={`tab ${tab === 'submit' ? 'active' : ''}`} onClick={() => setTab('submit')}>
          Prześlij CSR
        </button>
      </div>

      {tab === 'list' && (
        <div className="table-wrap">
          {loading ? (
            <p>Ładowanie...</p>
          ) : requests.length === 0 ? (
            <div className="empty-state">
              <p>Brak żądań CSR.</p>
            </div>
          ) : (
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
                {requests.map((r) => (
                  <tr key={r.id}>
                    <td>{r.common_name}</td>
                    <td>
                      <span className={`badge badge-${String(r.status).toLowerCase()}`}>{r.status}</span>
                    </td>
                    <td>{r.created_at ? new Date(r.created_at).toLocaleString('pl-PL') : '—'}</td>
                    <td>
                      {r.status === 'PENDING' ? (
                        <div className="actions-inline">
                          <button
                            className="btn btn-primary"
                            onClick={() => handleAction(r.id, 'approve')}
                            disabled={actionLoading === r.id}
                          >
                            {actionLoading === r.id ? 'Przetwarzanie...' : 'Zatwierdź'}
                          </button>
                          <button
                            className="btn btn-danger"
                            onClick={() => handleAction(r.id, 'reject')}
                            disabled={actionLoading === r.id}
                          >
                            Odrzuć
                          </button>
                        </div>
                      ) : (
                        <span>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'submit' && (
        <form onSubmit={handleSubmitCSR} className="form-grid">
          <div className="form-group">
            <label htmlFor="common_name">Common Name</label>
            <input
              id="common_name"
              value={csrForm.common_name}
              onChange={(e) => setCsrForm((f) => ({ ...f, common_name: e.target.value }))}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="csr_pem_data">CSR (PEM)</label>
            <textarea
              id="csr_pem_data"
              value={csrForm.csr_pem_data}
              onChange={(e) => setCsrForm((f) => ({ ...f, csr_pem_data: e.target.value }))}
              required
              rows={12}
              style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: 12 }}
            />
          </div>

          <div className="actions">
            <button className="btn btn-primary" type="submit" disabled={submitLoading}>
              {submitLoading ? 'Wysyłanie...' : 'Prześlij CSR'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
