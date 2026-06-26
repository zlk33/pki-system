'use client'

import { useEffect, useState } from 'react'
import { api, AuditLogEntry } from '../api'

const ACTION_LABELS: Record<string, string> = {
  USER_REGISTERED: 'Rejestracja konta',
  USER_CREATED: 'Utworzenie użytkownika',
  USER_UPDATED: 'Aktualizacja użytkownika',
  USER_DELETED: 'Usunięcie użytkownika',
  USER_PASSWORD_RESET: 'Reset hasła',
  CA_INITIALIZED: 'Inicjalizacja Root CA',
  CSR_SUBMITTED: 'Przesłanie CSR',
  CSR_APPROVED: 'Zatwierdzenie CSR',
  CSR_REJECTED: 'Odrzucenie CSR',
  CERT_ISSUED_FOR_USER: 'Wystawienie certyfikatu',
  CERT_REVOKED: 'Unieważnienie certyfikatu',
  DOCUMENT_SIGNED: 'Podpis dokumentu',
  PRIVATE_KEY_DOWNLOADED: 'Pobranie klucza',
  CRL_DOWNLOADED: 'Pobranie CRL',
}

const FIELD_LABELS: Record<string, string> = {
  first_name: 'imię',
  last_name: 'nazwisko',
  role: 'rola',
}

function formatChanges(metadata: AuditLogEntry['metadata']): string | null {
  if (!metadata || typeof metadata !== 'object' || !('changes' in metadata)) return null
  const changes = metadata.changes as Record<string, { from?: string; to?: string }>
  if (!changes || typeof changes !== 'object') return null

  const parts = Object.entries(changes).map(([field, value]) => {
    const label = FIELD_LABELS[field] || field
    return `${label}: „${value.from}” → „${value.to}”`
  })
  return parts.length > 0 ? parts.join(' · ') : null
}

function formatMetadataExtras(metadata: AuditLogEntry['metadata']): string | null {
  if (!metadata || typeof metadata !== 'object') return null
  const skip = new Set(['changes', 'note'])
  const parts: string[] = []

  for (const [key, value] of Object.entries(metadata)) {
    if (skip.has(key) || value == null) continue
    if (typeof value === 'object') continue
    parts.push(`${key}: ${String(value)}`)
  }

  return parts.length > 0 ? parts.join(' · ') : null
}

export default function AuditLog() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<AuditLogEntry | null>(null)

  useEffect(() => {
    api.getAuditLogs()
      .then(setLogs)
      .catch(e => setError(e instanceof Error ? e.message : 'Błąd ładowania'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div>
      <div className="page-header">
        <h2>Dziennik zdarzeń</h2>
        <p>Pełna historia operacji z informacją kto, co i na czym wykonał</p>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Ładowanie...</div>
        ) : logs.length === 0 ? (
          <div className="empty-state"><p>Brak wpisów w dzienniku</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Akcja</th>
                  <th>Wykonał</th>
                  <th>Cel</th>
                  <th>Opis</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => {
                  const changes = formatChanges(log.metadata)
                  const extras = formatMetadataExtras(log.metadata)
                  return (
                    <tr key={log.id}>
                      <td style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap', verticalAlign: 'top' }}>
                        {new Date(log.created_at).toLocaleString('pl-PL')}
                      </td>
                      <td style={{ verticalAlign: 'top' }}>
                        <span className="badge badge-pending" style={{ textTransform: 'none' }}>
                          {ACTION_LABELS[log.action] || log.action}
                        </span>
                      </td>
                      <td style={{ verticalAlign: 'top', minWidth: 180 }}>
                        <div style={{ fontWeight: 600 }}>
                          {log.actor.display_name || log.actor.email || '—'}
                        </div>
                        {log.actor.email && (
                          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{log.actor.email}</div>
                        )}
                        {log.actor.role && (
                          <span className={`badge badge-${log.actor.role === 'admin' ? 'root' : 'client'}`} style={{ marginTop: 6 }}>
                            {log.actor.role}
                          </span>
                        )}
                      </td>
                      <td style={{ verticalAlign: 'top' }}>
                        {log.target_label ? (
                          <div style={{ fontWeight: 500 }}>{log.target_label}</div>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>—</span>
                        )}
                        {log.resource_type && (
                          <div className="mono" style={{ fontSize: 11, marginTop: 4, color: 'var(--text-muted)' }}>
                            {log.resource_type}{log.resource_id ? ` #${log.resource_id}` : ''}
                          </div>
                        )}
                      </td>
                      <td style={{ verticalAlign: 'top', maxWidth: 360 }}>
                        <div>{log.summary || '—'}</div>
                        {changes && (
                          <div style={{ fontSize: 12, color: 'var(--accent)', marginTop: 6 }}>
                            Zmiany: {changes}
                          </div>
                        )}
                        {extras && (
                          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                            {extras}
                          </div>
                        )}
                      </td>
                      <td style={{ verticalAlign: 'top' }}>
                        <button
                          className="btn btn-ghost"
                          style={{ fontSize: 12, padding: '6px 10px' }}
                          onClick={() => setSelected(log)}
                        >
                          Więcej
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected && (
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 640 }}>
            <div className="modal-header">
              <h3>Szczegóły zdarzenia</h3>
              <button className="close-btn" onClick={() => setSelected(null)}>×</button>
            </div>
            <div className="detail-grid">
              <div className="detail-item">
                <label>Data</label>
                <span>{new Date(selected.created_at).toLocaleString('pl-PL')}</span>
              </div>
              <div className="detail-item">
                <label>Akcja</label>
                <span>{ACTION_LABELS[selected.action] || selected.action}</span>
              </div>
              <div className="detail-item">
                <label>Wykonał</label>
                <span>
                  {selected.actor.display_name || '—'}
                  {selected.actor.email ? ` (${selected.actor.email})` : ''}
                  {selected.actor.role ? ` · ${selected.actor.role}` : ''}
                </span>
              </div>
              <div className="detail-item">
                <label>Cel</label>
                <span>{selected.target_label || '—'}</span>
              </div>
            </div>
            <div style={{ marginTop: 16 }}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
                Opis
              </label>
              <p style={{ marginTop: 6 }}>{selected.summary || '—'}</p>
            </div>
            {selected.metadata && (
              <div style={{ marginTop: 16 }}>
                <label style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
                  Metadane
                </label>
                <div className="pem-box" style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                  {JSON.stringify(selected.metadata, null, 2)}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
