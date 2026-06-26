'use client'

import { useEffect, useState } from 'react'
import { api, User } from '../api'

const EMPTY_FORM = {
  email: '',
  password: '',
  first_name: '',
  last_name: '',
  role: 'user' as 'user' | 'admin',
}

export default function Users() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [editUser, setEditUser] = useState<User | null>(null)
  const [resetUser, setResetUser] = useState<User | null>(null)
  const [deleteUser, setDeleteUser] = useState<User | null>(null)
  const [createForm, setCreateForm] = useState(EMPTY_FORM)
  const [editForm, setEditForm] = useState({ first_name: '', last_name: '', role: 'user' as 'user' | 'admin' })
  const [newPassword, setNewPassword] = useState('')
  const [actionLoading, setActionLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      setUsers(await api.getUsers())
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Błąd ładowania użytkowników')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setActionLoading(true)
    setMsg('')
    try {
      const res = await api.createUser(createForm)
      setMsg(res.message)
      setShowCreate(false)
      setCreateForm(EMPTY_FORM)
      load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Błąd tworzenia użytkownika')
    } finally {
      setActionLoading(false)
    }
  }

  const handleUpdate = async () => {
    if (!editUser) return
    setActionLoading(true)
    setError('')
    try {
      const res = await api.updateUser(editUser.id, editForm)
      setMsg(res.message)
      setEditUser(null)
      load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Błąd aktualizacji')
    } finally {
      setActionLoading(false)
    }
  }

  const handleResetPassword = async () => {
    if (!resetUser) return
    setActionLoading(true)
    setError('')
    try {
      const res = await api.resetUserPassword(resetUser.id, newPassword)
      setMsg(res.message)
      setResetUser(null)
      setNewPassword('')
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Błąd resetu hasła')
    } finally {
      setActionLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteUser) return
    setActionLoading(true)
    setError('')
    try {
      const res = await api.deleteUser(deleteUser.id)
      setMsg(res.message)
      setDeleteUser(null)
      load()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Błąd usuwania')
    } finally {
      setActionLoading(false)
    }
  }

  const openEdit = (user: User) => {
    setEditUser(user)
    setEditForm({
      first_name: user.first_name,
      last_name: user.last_name,
      role: user.role as 'user' | 'admin',
    })
  }

  return (
    <div>
      <div className="page-header">
        <h2>Użytkownicy</h2>
        <p>Zarządzanie kontami i rolami w systemie PKI</p>
      </div>

      {msg && <div className="alert alert-success">{msg}</div>}
      {error && <div className="alert alert-error">{error}</div>}

      <div className="actions" style={{ marginBottom: 16 }}>
        <button className="btn btn-primary" onClick={() => { setShowCreate(true); setError('') }}>
          + Dodaj użytkownika
        </button>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Ładowanie...</div>
        ) : users.length === 0 ? (
          <div className="empty-state"><p>Brak użytkowników</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Imię i nazwisko</th>
                  <th>Rola</th>
                  <th>Rejestracja</th>
                  <th>Akcje</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td>{u.email}</td>
                    <td>{u.first_name} {u.last_name}</td>
                    <td><span className={`badge badge-${u.role === 'admin' ? 'root' : 'client'}`}>{u.role}</span></td>
                    <td style={{ color: 'var(--text-muted)' }}>
                      {u.created_at ? new Date(u.created_at).toLocaleString('pl-PL') : '—'}
                    </td>
                    <td>
                      <div className="actions">
                        <button className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => openEdit(u)}>
                          Edytuj
                        </button>
                        <button className="btn btn-ghost" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => { setResetUser(u); setNewPassword(''); setError('') }}>
                          Reset hasła
                        </button>
                        <button className="btn btn-danger" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => { setDeleteUser(u); setError('') }}>
                          Usuń
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Nowy użytkownik</h3>
              <button className="close-btn" onClick={() => setShowCreate(false)}>×</button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="form-row">
                <div className="form-group">
                  <label>Imię</label>
                  <input value={createForm.first_name} onChange={e => setCreateForm(f => ({ ...f, first_name: e.target.value }))} required />
                </div>
                <div className="form-group">
                  <label>Nazwisko</label>
                  <input value={createForm.last_name} onChange={e => setCreateForm(f => ({ ...f, last_name: e.target.value }))} required />
                </div>
              </div>
              <div className="form-group">
                <label>Email</label>
                <input type="email" value={createForm.email} onChange={e => setCreateForm(f => ({ ...f, email: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label>Hasło</label>
                <input type="password" value={createForm.password} onChange={e => setCreateForm(f => ({ ...f, password: e.target.value }))} required minLength={6} />
              </div>
              <div className="form-group">
                <label>Rola</label>
                <select value={createForm.role} onChange={e => setCreateForm(f => ({ ...f, role: e.target.value as 'user' | 'admin' }))}>
                  <option value="user">user</option>
                  <option value="admin">admin</option>
                </select>
              </div>
              <div className="actions" style={{ justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-ghost" onClick={() => setShowCreate(false)}>Anuluj</button>
                <button type="submit" className="btn btn-primary" disabled={actionLoading}>
                  {actionLoading ? <span className="spinner" /> : null}
                  Utwórz
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editUser && (
        <div className="modal-overlay" onClick={() => setEditUser(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Edytuj użytkownika</h3>
              <button className="close-btn" onClick={() => setEditUser(null)}>×</button>
            </div>
            <p style={{ color: 'var(--text-muted)', marginBottom: 16 }}>{editUser.email}</p>
            <div className="form-row">
              <div className="form-group">
                <label>Imię</label>
                <input value={editForm.first_name} onChange={e => setEditForm(f => ({ ...f, first_name: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Nazwisko</label>
                <input value={editForm.last_name} onChange={e => setEditForm(f => ({ ...f, last_name: e.target.value }))} />
              </div>
            </div>
            <div className="form-group">
              <label>Rola</label>
              <select value={editForm.role} onChange={e => setEditForm(f => ({ ...f, role: e.target.value as 'user' | 'admin' }))}>
                <option value="user">user</option>
                <option value="admin">admin</option>
              </select>
            </div>
            <div className="actions" style={{ justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setEditUser(null)}>Anuluj</button>
              <button className="btn btn-primary" onClick={handleUpdate} disabled={actionLoading}>
                {actionLoading ? <span className="spinner" /> : null}
                Zapisz
              </button>
            </div>
          </div>
        </div>
      )}

      {resetUser && (
        <div className="modal-overlay" onClick={() => setResetUser(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Reset hasła</h3>
              <button className="close-btn" onClick={() => setResetUser(null)}>×</button>
            </div>
            <p style={{ marginBottom: 16 }}>Użytkownik: <strong>{resetUser.email}</strong></p>
            <div className="form-group">
              <label>Nowe hasło</label>
              <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} minLength={6} required />
            </div>
            <div className="actions" style={{ justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setResetUser(null)}>Anuluj</button>
              <button className="btn btn-primary" onClick={handleResetPassword} disabled={actionLoading || newPassword.length < 6}>
                {actionLoading ? <span className="spinner" /> : null}
                Zresetuj
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteUser && (
        <div className="modal-overlay" onClick={() => setDeleteUser(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Usuń użytkownika</h3>
              <button className="close-btn" onClick={() => setDeleteUser(null)}>×</button>
            </div>
            <div className="alert alert-error">Czy na pewno usunąć konto <strong>{deleteUser.email}</strong>? Tej operacji nie można cofnąć.</div>
            <div className="actions" style={{ justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setDeleteUser(null)}>Anuluj</button>
              <button className="btn btn-danger" onClick={handleDelete} disabled={actionLoading}>
                {actionLoading ? <span className="spinner" /> : null}
                Usuń
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
