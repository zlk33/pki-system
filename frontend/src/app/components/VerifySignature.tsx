"use client"

import { useState } from 'react'
import { api, VerifySignatureResult } from '../api'

function VerifyResult({ result }: { result: VerifySignatureResult }) {
  return (
    <div className={`verify-result ${result.valid ? 'valid' : 'invalid'}`}>
      <h2>{result.valid ? 'Podpis poprawny' : 'Podpis niepoprawny'}</h2>
      <p>{result.message}</p>
      <ul>
        <li>Zgodność hasha: {result.hash_matches ? 'TAK' : 'NIE'}</li>
        <li>Poprawność podpisu kryptograficznego: {result.signature_valid ? 'TAK' : 'NIE'}</li>
        <li>Znacznik czasu poprawny: {result.timestamp_valid == null ? '—' : result.timestamp_valid ? 'TAK' : 'NIE'}</li>
        {result.signed_at && (
          <li>Data podpisu: {new Date(result.signed_at).toLocaleString('pl-PL')}</li>
        )}
        <li>Status certyfikatu poprawny: {result.certificate_status_valid ? 'TAK' : 'NIE'}</li>
        <li>Certyfikat w okresie ważności: {result.certificate_time_valid ? 'TAK' : 'NIE'}</li>
        <li>Certyfikat: {result.certificate.common_name || '—'} / {result.certificate.owner_email || '—'}</li>
        <li>Numer seryjny: {result.certificate.serial_number}</li>
      </ul>
    </div>
  )
}

export default function VerifySignature() {
  const [originalFile, setOriginalFile] = useState<File | null>(null)
  const [signatureFile, setSignatureFile] = useState<File | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<VerifySignatureResult | null>(null)

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!originalFile || !signatureFile) {
      setError('Wybierz oryginalny dokument oraz plik podpisu (.pki.sig.json)')
      return
    }

    setVerifying(true)
    setError('')
    setResult(null)
    try {
      const res = await api.verifySignaturePackage(originalFile, signatureFile)
      setResult(res)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Błąd weryfikacji')
    } finally {
      setVerifying(false)
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2>Weryfikacja podpisu</h2>
        <p>
          Wgraj oryginalny dokument oraz pobrany wcześniej plik podpisu
          {' '}(<span className="mono">.pki.sig.json</span>).
          Plik podpisu zawiera certyfikat i dane kryptograficzne potrzebne do sprawdzenia autentyczności.
        </p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        <form onSubmit={handleVerify}>
          <div className="form-group">
            <label>Oryginalny dokument</label>
            <input type="file" onChange={e => setOriginalFile(e.target.files?.[0] || null)} />
          </div>

          <div className="form-group">
            <label>Plik podpisu (.pki.sig.json)</label>
            <input
              type="file"
              accept=".json,.pki.sig.json,application/json"
              onChange={e => setSignatureFile(e.target.files?.[0] || null)}
            />
          </div>

          <button type="submit" className="btn btn-primary" disabled={verifying}>
            {verifying ? <><span className="spinner" /> Weryfikowanie...</> : 'Weryfikuj podpis'}
          </button>
        </form>
      </div>

      {result && <VerifyResult result={result} />}
    </div>
  )
}
