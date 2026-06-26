'use client'

import { useState } from 'react'
import { api } from '../api'

export default function CAInit() {
  const [loading, setLoading] = useState(false)
  const [crlLoading, setCrlLoading] = useState(false)
  const [result, setResult] = useState<{ message: string; serial_number: string } | null>(null)
  const [error, setError] = useState('')
  const [crlMsg, setCrlMsg] = useState('')

  const handleInit = async () => {
    setLoading(true)
    setError('')
    setResult(null)
    try {
      const res = await api.initCA()
      setResult(res)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Nieznany błąd')
    } finally {
      setLoading(false)
    }
  }

  const handleDownloadCrl = async () => {
    setCrlLoading(true)
    setCrlMsg('')
    setError('')
    try {
      await api.downloadCrl()
      setCrlMsg('Lista CRL została pobrana (studenckie-pki.crl.pem)')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Błąd pobierania CRL')
    } finally {
      setCrlLoading(false)
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2>Root CA</h2>
        <p>Inicjalizacja głównego urzędu certyfikacji</p>
      </div>

      <div className="card">
        <div className="card-title">Inicjalizacja Root CA</div>
        <p style={{ color: 'var(--text-muted)', marginBottom: 20, fontSize: 13 }}>
          Root CA to korzeń zaufania całej infrastruktury PKI. Operacja ta generuje klucz RSA-2048
          i samopodpisany certyfikat ważny przez 10 lat. Może być wykonana tylko raz.
        </p>

        {error && <div className="alert alert-error">{error}</div>}

        {result && (
          <div className="alert alert-success">
            <strong>{result.message}</strong>
            <br />
            <span style={{ fontFamily: 'monospace', fontSize: 12 }}>
              Serial: {result.serial_number}
            </span>
          </div>
        )}

        <button className="btn btn-primary" onClick={handleInit} disabled={loading}>
          {loading ? <span className="spinner" /> : null}
          {loading ? 'Generowanie...' : 'Inicjalizuj Root CA'}
        </button>
      </div>

      <div className="card">
        <div className="card-title">Informacje techniczne</div>
        <div className="detail-grid">
          <div className="detail-item">
            <label>Algorytm klucza</label>
            <span>RSA-2048</span>
          </div>
          <div className="detail-item">
            <label>Algorytm podpisu</label>
            <span>SHA-256</span>
          </div>
          <div className="detail-item">
            <label>Ważność</label>
            <span>10 lat</span>
          </div>
          <div className="detail-item">
            <label>Organizacja</label>
            <span>Studenckie PKI</span>
          </div>
          <div className="detail-item">
            <label>Common Name</label>
            <span>Studenckie Root CA</span>
          </div>
          <div className="detail-item">
            <label>Przechowywanie klucza</label>
            <span>Wolumen Docker (/app/certs)</span>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Lista unieważnień (CRL)</div>
        <p style={{ color: 'var(--text-muted)', marginBottom: 16, fontSize: 13 }}>
          Certificate Revocation List zawiera numery seryjne wszystkich unieważnionych certyfikatów,
          podpisaną przez Root CA. Można ją dystrybuować klientom weryfikującym łańcuch zaufania.
        </p>
        {crlMsg && <div className="alert alert-success">{crlMsg}</div>}
        <button className="btn btn-ghost" onClick={handleDownloadCrl} disabled={crlLoading}>
          {crlLoading ? <span className="spinner" /> : null}
          {crlLoading ? 'Generowanie...' : 'Pobierz CRL (PEM)'}
        </button>
      </div>
    </div>
  )
}
