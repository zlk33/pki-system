'use client'

import { useState } from 'react'
import { api } from '../api'

interface Props {
  onDone: () => void
}

export default function IssueCert({ onDone }: Props) {
  const [form, setForm] = useState({
    common_name: '',
    organization: '',
    country: '',
    state: '',
    locality: '',
    type: 'SERVER' as 'SERVER' | 'CLIENT' | 'INTERMEDIATE',
    validity_days: 365,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ message: string; pem: string } | null>(null)

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.common_name || !form.organization) {
      setError('Common Name i Organizacja są wymagane')
      return
    }
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const res = await api.issueCertificate({
        ...form,
        validity_days: Number(form.validity_days),
      })
      setResult({ message: res.message, pem: res.certificate.pem_data })
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Błąd wystawiania certyfikatu')
    } finally {
      setLoading(false)
    }
  }

  if (result) {
    return (
      <div>
        <div className="page-header">
          <h2>Wystaw certyfikat</h2>
        </div>
        <div className="card">
          <div className="alert alert-success">{result.message}</div>
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Certyfikat PEM
            </label>
            <div className="pem-box">{result.pem}</div>
          </div>
          <div className="actions" style={{ marginTop: 16 }}>
            <button className="btn btn-primary" onClick={onDone}>Przejdź do certyfikatów</button>
            <button className="btn btn-ghost" onClick={() => setResult(null)}>Wystaw kolejny</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="page-header">
        <h2>Wystaw certyfikat</h2>
        <p>Generuj nowy certyfikat podpisany przez Root CA</p>
      </div>

      <div className="card">
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label>Common Name *</label>
              <input placeholder="np. example.com" value={form.common_name} onChange={set('common_name')} required />
            </div>
            <div className="form-group">
              <label>Organizacja *</label>
              <input placeholder="np. Moja Firma" value={form.organization} onChange={set('organization')} required />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Kraj</label>
              <input placeholder="PL" maxLength={2} value={form.country} onChange={set('country')} />
            </div>
            <div className="form-group">
              <label>Województwo / Stan</label>
              <input placeholder="Mazowieckie" value={form.state} onChange={set('state')} />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Miejscowość</label>
              <input placeholder="Warszawa" value={form.locality} onChange={set('locality')} />
            </div>
            <div className="form-group">
              <label>Typ certyfikatu</label>
              <select value={form.type} onChange={set('type')}>
                <option value="SERVER">SERVER - certyfikat serwera</option>
                <option value="CLIENT">CLIENT - certyfikat klienta</option>
                <option value="INTERMEDIATE">INTERMEDIATE - CA pośredni</option>
              </select>
            </div>
          </div>

          <div className="form-group" style={{ maxWidth: 200 }}>
            <label>Ważność (dni)</label>
            <input type="number" min={1} max={3650} value={form.validity_days} onChange={set('validity_days')} />
          </div>

          <div className="actions">
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? <span className="spinner" /> : null}
              {loading ? 'Generowanie...' : 'Wystaw certyfikat'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
