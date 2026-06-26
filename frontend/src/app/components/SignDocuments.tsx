"use client"

import { useEffect, useState } from 'react'
import { api, Certificate, SignedDocument, saveSignaturePackage } from '../api'

export default function SignDocuments() {
  const [certificates, setCertificates] = useState<Certificate[]>([])
  const [documents, setDocuments] = useState<SignedDocument[]>([])
  const [certificateId, setCertificateId] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(true)
  const [signing, setSigning] = useState(false)
  const [downloadingId, setDownloadingId] = useState<number | null>(null)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [certs, docs] = await Promise.all([
        api.getCertificates(),
        api.getSignedDocuments(),
      ])
      const usable = certs.filter(c => c.type !== 'ROOT' && c.status === 'VALID')
      setCertificates(usable)
      setDocuments(docs)
      if (usable.length > 0 && !certificateId) {
        setCertificateId(String(usable[0].id))
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Błąd ładowania danych')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const handleDownload = async (documentId: number) => {
    setDownloadingId(documentId)
    setError('')
    try {
      await api.downloadSignaturePackage(documentId)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Błąd pobierania pliku podpisu')
    } finally {
      setDownloadingId(null)
    }
  }

  const handleSign = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!certificateId || !selectedFile) {
      setError('Wybierz certyfikat i plik do podpisania')
      return
    }

    setSigning(true)
    setError('')
    setMsg('')
    try {
      const res = await api.signDocument(Number(certificateId), selectedFile)
      saveSignaturePackage(res.signature_package, res.signature_package_filename)
      setMsg(
        `${res.message}: ${res.file_name}. Pobrano plik podpisu (${res.signature_package_filename}) — zachowaj go razem z oryginalnym dokumentem.`,
      )
      setSelectedFile(null)
      await load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Błąd podpisywania dokumentu')
    } finally {
      setSigning(false)
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2>Podpisywanie dokumentów</h2>
        <p>
          Podpisz dokument certyfikatem. Oryginalny plik zostaje u Ciebie — system generuje osobny plik podpisu
          {' '}(<span className="mono">.pki.sig.json</span>), który możesz pobrać i później użyć do weryfikacji.
        </p>
      </div>

      {msg && <div className="alert alert-success">{msg}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      {loading ? (
        <div style={{ color: 'var(--text-muted)', padding: '40px 0' }}>Ładowanie...</div>
      ) : (
        <>
          <div className="card">
            <form onSubmit={handleSign}>
              <div className="form-group">
                <label>Certyfikat użytkownika</label>
                <select value={certificateId} onChange={e => setCertificateId(e.target.value)} disabled={certificates.length === 0}>
                  {certificates.length === 0 ? (
                    <option value="">Brak dostępnych certyfikatów</option>
                  ) : (
                    certificates.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.common_name} ({c.type})
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div className="form-group">
                <label>Plik do podpisania</label>
                <input type="file" onChange={e => setSelectedFile(e.target.files?.[0] || null)} />
              </div>

              <button type="submit" className="btn btn-primary" disabled={signing || certificates.length === 0}>
                {signing ? <><span className="spinner" /> Podpisywanie...</> : 'Podpisz i pobierz plik podpisu'}
              </button>
            </form>
          </div>

          <div className="card" style={{ padding: 0 }}>
            <div style={{ padding: '20px 24px 0' }}>
              <div className="card-title" style={{ marginBottom: 0 }}>Historia podpisanych dokumentów</div>
            </div>
            {documents.length === 0 ? (
              <div className="empty-state"><p>Brak podpisanych dokumentów.</p></div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Plik</th>
                      <th>Certyfikat ID</th>
                      <th>Data podpisu</th>
                      <th>Hash dokumentu</th>
                      <th>Akcje</th>
                    </tr>
                  </thead>
                  <tbody>
                    {documents.map(d => (
                      <tr key={d.id}>
                        <td>{d.file_name}</td>
                        <td>{d.certificate_id}</td>
                        <td style={{ color: 'var(--text-muted)' }}>
                          {new Date(d.signed_at || d.created_at).toLocaleString('pl-PL')}
                        </td>
                        <td className="mono">{d.document_hash.slice(0, 32)}...</td>
                        <td>
                          <button
                            className="btn btn-ghost"
                            style={{ fontSize: 12, padding: '6px 12px' }}
                            disabled={downloadingId === d.id}
                            onClick={() => handleDownload(d.id)}
                          >
                            {downloadingId === d.id ? <span className="spinner" /> : 'Pobierz podpis'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
