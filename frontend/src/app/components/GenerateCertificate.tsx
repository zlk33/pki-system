'use client'

import { FormEvent, useState } from 'react'
import { api, GeneratedCertificateResponse } from '../api'

export default function GenerateCertificate() {
  const [form, setForm] = useState({
    common_name: '',
    organization: 'Studenckie PKI',
    cert_type: 'SERVER' as 'SERVER' | 'CLIENT',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<GeneratedCertificateResponse | null>(null)

  const downloadText = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setResult(null)

    try {
      const res = await api.generateCertificate(form)
      setResult(res)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Nie udało się wygenerować certyfikatu')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card">
      <div className="page-header" style={{ marginBottom: 16 }}>
        <h2>Generowanie certyfikatu z formularza</h2>
        <p>Backend wygeneruje klucz prywatny i podpisany certyfikat bez ręcznego tworzenia CSR.</p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {result && <div className="alert alert-success">{result.message}</div>}

      <form onSubmit={handleSubmit} className="form-grid">
        <div className="form-group">
          <label htmlFor="common_name">Common Name</label>
          <input
            id="common_name"
            value={form.common_name}
            onChange={(e) => setForm((f) => ({ ...f, common_name: e.target.value }))}
            placeholder="np. client.local albo api.local"
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="organization">Organizacja</label>
          <input
            id="organization"
            value={form.organization}
            onChange={(e) => setForm((f) => ({ ...f, organization: e.target.value }))}
          />
        </div>

        <div className="form-group">
          <label htmlFor="cert_type">Typ certyfikatu</label>
          <select
            id="cert_type"
            value={form.cert_type}
            onChange={(e) => setForm((f) => ({ ...f, cert_type: e.target.value as 'SERVER' | 'CLIENT' }))}
          >
            <option value="SERVER">SERVER</option>
            <option value="CLIENT">CLIENT</option>
          </select>
        </div>

        <div className="actions">
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? 'Generowanie...' : 'Generuj certyfikat'}
          </button>
        </div>
      </form>

      {result && (
        <div style={{ marginTop: 24 }}>
          <div className="detail-grid" style={{ marginBottom: 20 }}>
            <div className="detail-item"><label>ID certyfikatu</label><span>{result.certificate_id}</span></div>
            <div className="detail-item"><label>Serial Number</label><span className="mono">{result.serial_number}</span></div>
          </div>

          <div className="form-group">
            <label>Certyfikat PEM</label>
            <textarea readOnly rows={12} value={result.certificate_pem} style={{ width: '100%', fontFamily: 'monospace', fontSize: 12 }} />
          </div>

          <div className="form-group" style={{ marginTop: 16 }}>
            <label>Klucz prywatny PEM</label>
            <textarea readOnly rows={12} value={result.private_key_pem} style={{ width: '100%', fontFamily: 'monospace', fontSize: 12 }} />
          </div>

          <div className="actions" style={{ marginTop: 20 }}>
            <button
              className="btn btn-secondary"
              onClick={() => downloadText(`${form.common_name || 'certificate'}.crt.pem`, result.certificate_pem)}
            >
              Pobierz certyfikat
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => downloadText(`${form.common_name || 'certificate'}.key.pem`, result.private_key_pem)}
            >
              Pobierz klucz prywatny
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
