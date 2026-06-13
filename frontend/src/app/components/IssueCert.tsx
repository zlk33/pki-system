'use client'

import { useEffect, useState } from 'react'
import { api, CertRequest } from '../api'

interface Props {
  onDone: () => void
}

export default function IssueCert({ onDone }: Props) {
  const [requests, setRequests] = useState<CertRequest[]>([])
  const [selectedId, setSelectedId] = useState<number | ''>('')
  const [loading, setLoading] = useState(false)
  const [listLoading, setListLoading] = useState(true)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ message: string; serial_number: string } | null>(null)

  const loadRequests = async () => {
    setListLoading(true)
    setError('')
    try {
      const data = await api.getRequests()
      const pending = data.filter((r) => r.status === 'PENDING')
      setRequests(pending)
      setSelectedId(pending.length > 0 ? pending[0].id : '')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Błąd ładowania wniosków')
    } finally {
      setListLoading(false)
    }
  }

  useEffect(() => {
    loadRequests()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!selectedId) {
      setError('Wybierz wniosek CSR do wystawienia certyfikatu')
      return
    }

    setLoading(true)
    setError('')
    setResult(null)

    try {
      const res = await api.issueCertificate(Number(selectedId))
      setResult(res)
      await loadRequests()
      onDone()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Błąd wystawiania certyfikatu')
    } finally {
      setLoading(false)
    }
  }

  if (result) {
    return (
      <div className="card">
        <div className="page-header" style={{ marginBottom: 16 }}>
          <h2>Wystaw certyfikat</h2>
          <p>Żądanie zostało zatwierdzone i podpisane przez Root CA.</p>
        </div>

        <div className="alert alert-success">{result.message}</div>

        <div className="detail-grid">
          <div className="detail-item">
            <label>Numer seryjny</label>
            <span className="mono">{result.serial_number}</span>
          </div>
        </div>

        <div className="actions" style={{ marginTop: 20 }}>
          <button className="btn btn-primary" onClick={onDone}>
            Przejdź do certyfikatów
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => {
              setResult(null)
              loadRequests()
            }}
          >
            Wystaw kolejny
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="page-header" style={{ marginBottom: 16 }}>
        <h2>Wystaw certyfikat</h2>
        <p>Wybierz oczekujące żądanie CSR i podpisz je przez Root CA.</p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {listLoading ? (
        <p>Ładowanie żądań CSR...</p>
      ) : requests.length === 0 ? (
        <div className="alert alert-info">
          Brak oczekujących żądań CSR. Najpierw dodaj żądanie w zakładce Requests.
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="request_id">Wniosek CSR</label>
            <select
              id="request_id"
              value={selectedId}
              onChange={(e) => setSelectedId(Number(e.target.value))}
              disabled={loading}
            >
              {requests.map((r) => (
                <option key={r.id} value={r.id}>
                  #{r.id} — {r.common_name} — {new Date(r.created_at).toLocaleString('pl-PL')}
                </option>
              ))}
            </select>
          </div>

          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? 'Wystawianie...' : 'Wystaw certyfikat'}
          </button>
        </form>
      )}
    </div>
  )
}
