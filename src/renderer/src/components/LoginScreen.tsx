import { FormEvent, useState } from 'react'
import { setAdminPassword } from '../lib/adminAuth'
import { hasSupervisorPassword } from '../lib/supervisorAuth'
import { useAuth } from '../lib/auth'
import { useCollection } from '../hooks/useCollection'
import { AppSettings } from '../lib/types'

type Tab = 'supervisor' | 'admin'

export default function LoginScreen(): React.JSX.Element {
  const { loginSupervisor, loginAdmin } = useAuth()
  // Admin password is shared with the website (appSettings/sharedAdmin) — it
  // only needs "first time setup" here if that shared doc has never been set.
  const { data: appSettings, loading: settingsLoading } = useCollection<AppSettings>('appSettings')
  const hasSharedAdminPassword = Boolean(
    appSettings.find((s) => s.id === 'sharedAdmin')?.adminPasswordHash
  )
  const needsAdminSetup = !settingsLoading && !hasSharedAdminPassword

  const [tab, setTab] = useState<Tab>('supervisor')
  const [supervisorPw, setSupervisorPw] = useState('')
  const [adminPw, setAdminPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSupervisorLogin(e: FormEvent): Promise<void> {
    e.preventDefault()
    setError('')
    if (!hasSupervisorPassword()) {
      setError('No supervisor password set yet — ask your admin to set one in Settings.')
      return
    }
    setBusy(true)
    const ok = await loginSupervisor(supervisorPw)
    setBusy(false)
    if (!ok) setError('Incorrect password')
  }

  async function handleAdminSetup(e: FormEvent): Promise<void> {
    e.preventDefault()
    setError('')
    if (adminPw.length < 4) {
      setError('Password must be at least 4 characters')
      return
    }
    if (adminPw !== confirmPw) {
      setError('Passwords do not match')
      return
    }
    setBusy(true)
    await setAdminPassword(adminPw)
    await loginAdmin(adminPw)
    setBusy(false)
  }

  async function handleAdminLogin(e: FormEvent): Promise<void> {
    e.preventDefault()
    setError('')
    setBusy(true)
    const ok = await loginAdmin(adminPw)
    setBusy(false)
    if (!ok) setError('Incorrect password')
  }

  if (settingsLoading) {
    return (
      <div className="lock-screen">
        <div className="page-header">
          <h1>MiSpace PG</h1>
          <p>Loading…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="lock-screen">
      <div className="page-header">
        <h1>MiSpace PG</h1>
        <p>Log in to continue.</p>
      </div>

      {!needsAdminSetup && (
        <div className="radio-row" style={{ justifyContent: 'center', marginBottom: 16 }}>
          <button
            type="button"
            className={tab === 'supervisor' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
            onClick={() => {
              setTab('supervisor')
              setError('')
            }}
          >
            Supervisor
          </button>
          <button
            type="button"
            className={tab === 'admin' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
            onClick={() => {
              setTab('admin')
              setError('')
            }}
          >
            Admin
          </button>
        </div>
      )}

      {tab === 'supervisor' && !needsAdminSetup && (
        <form className="card" onSubmit={handleSupervisorLogin}>
          <div className="form-field">
            <label>Supervisor password</label>
            <input
              type="password"
              value={supervisorPw}
              onChange={(e) => setSupervisorPw(e.target.value)}
              autoFocus
            />
          </div>
          {error && (
            <p className="hint" style={{ color: 'var(--danger)', marginTop: 8 }}>
              {error}
            </p>
          )}
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={busy}>
              Log in
            </button>
          </div>
        </form>
      )}

      {tab === 'admin' && !needsAdminSetup && (
        <form className="card" onSubmit={handleAdminLogin}>
          <div className="form-field">
            <label>Admin password</label>
            <input
              type="password"
              value={adminPw}
              onChange={(e) => setAdminPw(e.target.value)}
              autoFocus
            />
          </div>
          {error && (
            <p className="hint" style={{ color: 'var(--danger)', marginTop: 8 }}>
              {error}
            </p>
          )}
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={busy}>
              Log in
            </button>
          </div>
        </form>
      )}

      {needsAdminSetup && (
        <form className="card" onSubmit={handleAdminSetup}>
          <p className="hint" style={{ marginBottom: 12 }}>
            First time on this machine — set the admin password. You'll set a supervisor
            password afterwards in Settings.
          </p>
          <div className="form-field">
            <label>Admin password</label>
            <input
              type="password"
              value={adminPw}
              onChange={(e) => setAdminPw(e.target.value)}
              autoFocus
            />
          </div>
          <div className="form-field" style={{ marginTop: 12 }}>
            <label>Confirm password</label>
            <input type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} />
          </div>
          {error && (
            <p className="hint" style={{ color: 'var(--danger)', marginTop: 8 }}>
              {error}
            </p>
          )}
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={busy}>
              Set admin password &amp; log in
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
