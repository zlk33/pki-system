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

  const handleSubmitCSR = async (e: React.FormEvent) => {
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

  const handleApprove = async (id: number) => {
    setActionLoading(id)
    setMsg('')
    setError('')
    try {
      const res = await api.approveRequest(id)
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

      <div className="actions" style={{ marginBottom: 16 }}>
        <button className={`btn ${tab === 'list' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('list')}>
          Lista żądań
        </button>
        <button className={`btn ${tab === 'submit' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab('submit')}>
          Prześlij CSR
        </button>
      </div>

      {msg && <div className="alert alert-success">{msg}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      {tab === 'list' && (
        <>
          {loading ? (
            <p>Ładowanie...</p>
          ) : requests.length === 0 ? (
            <div className="empty-state">
              <p>Brak żądań CSR.</p>
            </div>
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
                  {requests.map((r) => (
                    <tr key={r.id}>
                      <td>{r.common_name}</td>
                      <td>
                        <span className={`badge badge-${r.status.toLowerCase()}`}>{r.status}</span>
                      </td>
                      <td>{new Date(r.created_at).toLocaleString('pl-PL')}</td>
                      <td>
                        {r.status === 'PENDING' ? (
                          <button
                            className="btn btn-primary"
                            onClick={() => handleApprove(r.id)}
                            disabled={actionLoading === r.id}
                          >
                            {actionLoading === r.id ? 'Zatwierdzanie...' : 'Zatwierdź'}
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
        </>
      )}

      {tab === 'submit' && (
        <form onSubmit={handleSubmitCSR}>
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
              style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: 12, width: '100%' }}
            />
          </div>

          <button className="btn btn-primary" type="submit" disabled={submitLoading}>
            {submitLoading ? 'Wysyłanie...' : 'Prześlij CSR'}
          </button>
        </form>
      )}
    </div>
  )
}
