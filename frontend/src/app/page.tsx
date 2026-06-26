"use client"

import { useEffect, useState } from 'react'
import Dashboard from './components/Dashboard'
import Certificates from './components/Certificates'
import IssueCert from './components/IssueCert'
import Requests from './components/Requests'
import CAInit from './components/CAInit'
import SignDocuments from './components/SignDocuments'
import VerifySignature from './components/VerifySignature'
import Users from './components/Users'
import AuditLog from './components/AuditLog'
import { api, User } from './api'

type Page = 'dashboard' | 'certificates' | 'issue' | 'requests' | 'ca' | 'sign' | 'verify' | 'users' | 'audit'
type AuthMode = 'login' | 'register'

const ALL_NAV: { id: Page; label: string; icon: string; adminOnly?: boolean }[] = [
  { id: 'dashboard', label: 'Pulpit', icon: '▦' },
  { id: 'ca', label: 'Root CA', icon: '⬡', adminOnly: true },
  { id: 'certificates', label: 'Certyfikaty', icon: '◈' },
  { id: 'issue', label: 'Wystaw certyfikat', icon: '+', adminOnly: true },
  { id: 'requests', label: 'Żądania CSR', icon: '◎' },
  { id: 'users', label: 'Użytkownicy', icon: '👤', adminOnly: true },
  { id: 'audit', label: 'Dziennik', icon: '📋', adminOnly: true },
  { id: 'sign', label: 'Podpisz dokument', icon: '✎' },
  { id: 'verify', label: 'Weryfikuj podpis', icon: '✓' },
]

const PAGE_TITLES: Record<Page, string> = {
  dashboard: 'Pulpit',
  ca: 'Root CA',
  certificates: 'Certyfikaty',
  issue: 'Wystaw certyfikat',
  requests: 'Żądania CSR',
  users: 'Użytkownicy',
  audit: 'Dziennik zdarzeń',
  sign: 'Podpisz dokument',
  verify: 'Weryfikuj podpis',
}

export default function Home() {
  const [page, setPage] = useState<Page>('dashboard')
  const [user, setUser] = useState<User | null>(null)
  const [loadingAuth, setLoadingAuth] = useState(true)
  const [authMode, setAuthMode] = useState<AuthMode>('login')
  const [error, setError] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [loginForm, setLoginForm] = useState({ email: '', password: '' })
  const [registerForm, setRegisterForm] = useState({ email: '', password: '', first_name: '', last_name: '' })

  useEffect(() => {
    const bootstrap = async () => {
      const token = api.getStoredToken()
      if (!token) {
        setLoadingAuth(false)
        return
      }
      try {
        const me = await api.me()
        setUser(me)
      } catch {
        api.clearSession()
        setUser(null)
      } finally {
        setLoadingAuth(false)
      }
    }
    bootstrap()
  }, [])

  useEffect(() => {
    document.body.style.overflow = mobileNavOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [mobileNavOpen])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setAuthLoading(true)
    setError('')
    try {
      const res = await api.login(loginForm)
      api.setSession(res.access_token, res.user)
      setUser(res.user)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Błąd logowania')
    } finally {
      setAuthLoading(false)
    }
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setAuthLoading(true)
    setError('')
    try {
      await api.register(registerForm)
      const loginRes = await api.login({
        email: registerForm.email,
        password: registerForm.password,
      })
      api.setSession(loginRes.access_token, loginRes.user)
      setUser(loginRes.user)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Błąd rejestracji')
    } finally {
      setAuthLoading(false)
    }
  }

  const logout = () => {
    api.clearSession()
    setUser(null)
    setPage('dashboard')
    setMobileNavOpen(false)
  }

  const navigate = (next: Page) => {
    setPage(next)
    setMobileNavOpen(false)
  }

  if (loadingAuth) {
    return <div className="auth-loading">Sprawdzanie sesji...</div>
  }

  if (!user) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1>Studenckie PKI</h1>
          <p>Zaloguj się do panelu albo utwórz konto użytkownika.</p>

          <div className="auth-tabs">
            <button
              type="button"
              className={`auth-tab ${authMode === 'login' ? 'active' : ''}`}
              onClick={() => { setAuthMode('login'); setError('') }}
            >
              Logowanie
            </button>
            <button
              type="button"
              className={`auth-tab ${authMode === 'register' ? 'active' : ''}`}
              onClick={() => { setAuthMode('register'); setError('') }}
            >
              Rejestracja
            </button>
          </div>

          {error && <div className="alert alert-error">{error}</div>}

          {authMode === 'login' ? (
            <form onSubmit={handleLogin} className="auth-form">
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Email</label>
                <input
                  type="email"
                  placeholder="twoj@email.pl"
                  value={loginForm.email}
                  onChange={e => setLoginForm(f => ({ ...f, email: e.target.value }))}
                  required
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Hasło</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={loginForm.password}
                  onChange={e => setLoginForm(f => ({ ...f, password: e.target.value }))}
                  required
                />
              </div>
              <button type="submit" className="btn btn-primary btn-full" disabled={authLoading}>
                {authLoading ? <><span className="spinner" /> Logowanie...</> : 'Zaloguj się'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="auth-form">
              <div className="form-row">
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Imię</label>
                  <input
                    placeholder="Jan"
                    value={registerForm.first_name}
                    onChange={e => setRegisterForm(f => ({ ...f, first_name: e.target.value }))}
                    required
                  />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Nazwisko</label>
                  <input
                    placeholder="Kowalski"
                    value={registerForm.last_name}
                    onChange={e => setRegisterForm(f => ({ ...f, last_name: e.target.value }))}
                    required
                  />
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Email</label>
                <input
                  type="email"
                  placeholder="twoj@email.pl"
                  value={registerForm.email}
                  onChange={e => setRegisterForm(f => ({ ...f, email: e.target.value }))}
                  required
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label>Hasło</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={registerForm.password}
                  onChange={e => setRegisterForm(f => ({ ...f, password: e.target.value }))}
                  required
                />
              </div>
              <button type="submit" className="btn btn-primary btn-full" disabled={authLoading}>
                {authLoading ? <><span className="spinner" /> Tworzenie konta...</> : 'Utwórz konto'}
              </button>
            </form>
          )}
        </div>
      </div>
    )
  }

  const nav = ALL_NAV.filter(item => !item.adminOnly || user.role === 'admin')

  return (
    <div className="layout">
      {mobileNavOpen && (
        <div className="sidebar-backdrop" onClick={() => setMobileNavOpen(false)} aria-hidden="true" />
      )}

      <aside className={`sidebar ${mobileNavOpen ? 'open' : ''}`}>
        <div className="sidebar-logo">
          <h1>Studenckie PKI</h1>
          <p>System certyfikatów</p>
        </div>

        <div className="sidebar-user">
          <div className="sidebar-user-name">{user.first_name} {user.last_name}</div>
          <div className="sidebar-user-email">{user.email}</div>
          <span className="sidebar-user-role">{user.role}</span>
        </div>

        <nav className="sidebar-nav">
          {nav.map(item => (
            <button
              key={item.id}
              className={`nav-item ${page === item.id ? 'active' : ''}`}
              onClick={() => navigate(item.id)}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button className="btn btn-ghost btn-full" onClick={logout}>Wyloguj</button>
        </div>
      </aside>

      <div className="content-wrap">
        <header className="mobile-header">
          <button
            type="button"
            className="mobile-menu-btn"
            onClick={() => setMobileNavOpen(true)}
            aria-label="Otwórz menu"
          >
            ☰
          </button>
          <span className="mobile-header-title">{PAGE_TITLES[page]}</span>
        </header>

        <main className="main">
          {page === 'dashboard' && <Dashboard onNavigate={navigate} />}
          {page === 'ca' && user.role === 'admin' && <CAInit />}
          {page === 'certificates' && <Certificates />}
          {page === 'issue' && user.role === 'admin' && <IssueCert onDone={() => navigate('certificates')} />}
        {page === 'requests' && <Requests />}
        {page === 'users' && user.role === 'admin' && <Users />}
        {page === 'audit' && user.role === 'admin' && <AuditLog />}
        {page === 'sign' && <SignDocuments />}
          {page === 'verify' && <VerifySignature />}
        </main>
      </div>
    </div>
  )
}
