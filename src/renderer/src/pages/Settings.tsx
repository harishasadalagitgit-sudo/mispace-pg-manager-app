import { FormEvent, useState } from 'react'
import { doc, setDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { setAdminPassword } from '../lib/adminAuth'
import { hasSupervisorPassword, setSupervisorPassword } from '../lib/supervisorAuth'
import { getCurrentUserName, setCurrentUserName } from '../lib/session'
import { showToast } from '../lib/toast'
import { useCollection } from '../hooks/useCollection'
import { AppSettings, WebsiteRoom } from '../lib/types'
import { exportFullBackup } from '../lib/xlsxExport'
import RequireAdmin from '../components/RequireAdmin'
import { Link } from 'react-router-dom'

const DEFAULT_EXPENSE_ALERT_THRESHOLD = 550000

export default function Settings(): React.JSX.Element {
  const { data: rooms } = useCollection<WebsiteRoom>('rooms')
  const totalCapacity = rooms.reduce((sum, r) => sum + (r.capacity || 0), 0)
  const totalOccupied = rooms.reduce((sum, r) => sum + (r.occupiedCount || 0), 0)

  const { data: appSettings } = useCollection<AppSettings>('appSettings')
  const expenseAlertThreshold =
    appSettings.find((s) => s.id === 'dashboard')?.expenseAlertThreshold ??
    DEFAULT_EXPENSE_ALERT_THRESHOLD
  const [thresholdInput, setThresholdInput] = useState(String(expenseAlertThreshold))
  const hasSharedAdminPassword = Boolean(
    appSettings.find((s) => s.id === 'sharedAdmin')?.adminPasswordHash
  )

  async function saveExpenseAlertThreshold(e: FormEvent): Promise<void> {
    e.preventDefault()
    const value = Number(thresholdInput)
    if (!thresholdInput || isNaN(value) || value <= 0) {
      showToast('Enter a valid positive amount', 'error')
      return
    }
    try {
      await setDoc(doc(db, 'appSettings', 'dashboard'), { expenseAlertThreshold: value }, { merge: true })
      showToast('Expense alert threshold updated')
    } catch (err) {
      console.error(err)
      showToast('Failed to update threshold: ' + (err as Error).message, 'error')
    }
  }

  const [name, setName] = useState(getCurrentUserName())
  const [exporting, setExporting] = useState(false)

  const [adminPw1, setAdminPw1] = useState('')
  const [adminPw2, setAdminPw2] = useState('')

  const [supervisorPw1, setSupervisorPw1] = useState('')
  const [supervisorPw2, setSupervisorPw2] = useState('')

  function saveName(e: FormEvent): void {
    e.preventDefault()
    setCurrentUserName(name)
    showToast('Name updated')
  }

  async function saveAdminPassword(e: FormEvent): Promise<void> {
    e.preventDefault()
    if (adminPw1.length < 4) {
      showToast('Password must be at least 4 characters', 'error')
      return
    }
    if (adminPw1 !== adminPw2) {
      showToast('Passwords do not match', 'error')
      return
    }
    try {
      await setAdminPassword(adminPw1)
      setAdminPw1('')
      setAdminPw2('')
      showToast('Admin password updated — also changed on the website')
    } catch (err) {
      console.error(err)
      showToast('Failed to update admin password: ' + (err as Error).message, 'error')
    }
  }

  async function saveSupervisorPassword(e: FormEvent): Promise<void> {
    e.preventDefault()
    if (supervisorPw1.length < 4) {
      showToast('Password must be at least 4 characters', 'error')
      return
    }
    if (supervisorPw1 !== supervisorPw2) {
      showToast('Passwords do not match', 'error')
      return
    }
    await setSupervisorPassword(supervisorPw1)
    setSupervisorPw1('')
    setSupervisorPw2('')
    showToast('Supervisor password updated on this machine')
  }

  async function handleExport(): Promise<void> {
    setExporting(true)
    try {
      const result = await exportFullBackup()
      if (result.ok) showToast(`Saved to ${result.path}`)
    } catch (err) {
      console.error(err)
      showToast('Export failed: ' + (err as Error).message, 'error')
    } finally {
      setExporting(false)
    }
  }

  return (
    <RequireAdmin>
      <div className="page-header">
        <h1>Settings</h1>
        <p>Local to this machine — set it up separately on the other one too.</p>
      </div>

      <form className="card" onSubmit={saveName}>
        <div className="form-field full">
          <label>Your display name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} />
          <span className="hint">Used to tag entries you make and approvals you review.</span>
        </div>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary">
            Save
          </button>
        </div>
      </form>

      <form className="card" onSubmit={saveAdminPassword}>
        <div className="page-header" style={{ marginBottom: 12 }}>
          <h1 style={{ fontSize: 16 }}>Admin password</h1>
          <p>
            {hasSharedAdminPassword
              ? 'Shared with the website admin login too — changing it here changes it there.'
              : 'Not set yet.'}
          </p>
        </div>
        <div className="form-grid">
          <div className="form-field">
            <label>New password</label>
            <input type="password" value={adminPw1} onChange={(e) => setAdminPw1(e.target.value)} />
          </div>
          <div className="form-field">
            <label>Confirm password</label>
            <input type="password" value={adminPw2} onChange={(e) => setAdminPw2(e.target.value)} />
          </div>
        </div>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary">
            Change admin password
          </button>
        </div>
      </form>

      <form className="card" onSubmit={saveSupervisorPassword}>
        <div className="page-header" style={{ marginBottom: 12 }}>
          <h1 style={{ fontSize: 16 }}>Supervisor password</h1>
          <p>
            {hasSupervisorPassword()
              ? 'Shared by anyone entering income/expense records. They cannot see this page or Approvals.'
              : 'Not set yet — supervisors cannot log in until you set one.'}
          </p>
        </div>
        <div className="form-grid">
          <div className="form-field">
            <label>New password</label>
            <input
              type="password"
              value={supervisorPw1}
              onChange={(e) => setSupervisorPw1(e.target.value)}
            />
          </div>
          <div className="form-field">
            <label>Confirm password</label>
            <input
              type="password"
              value={supervisorPw2}
              onChange={(e) => setSupervisorPw2(e.target.value)}
            />
          </div>
        </div>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary">
            {hasSupervisorPassword() ? 'Change supervisor password' : 'Set supervisor password'}
          </button>
        </div>
      </form>

      <div className="card">
        <div className="page-header" style={{ marginBottom: 12 }}>
          <h1 style={{ fontSize: 16 }}>Full backup (Excel)</h1>
          <p>
            One .xlsx file with Residents, Rooms, Expenses, Income, and Employees sheets — a
            snapshot of the live website database.
          </p>
        </div>
        <button className="btn btn-primary" onClick={handleExport} disabled={exporting}>
          {exporting ? 'Exporting…' : 'Export full backup'}
        </button>
      </div>

      <form className="card" onSubmit={saveExpenseAlertThreshold}>
        <div className="page-header" style={{ marginBottom: 12 }}>
          <h1 style={{ fontSize: 16 }}>Expense alert threshold</h1>
          <p>Dashboard shows a warning once this month's expenses (excluding Rent) cross this amount.</p>
        </div>
        <div className="form-field">
          <label>Alert when expenses exceed (₹)</label>
          <input
            type="number"
            min="1"
            step="1"
            value={thresholdInput}
            onChange={(e) => setThresholdInput(e.target.value)}
          />
          <span className="hint">Currently ₹{expenseAlertThreshold.toLocaleString()}</span>
        </div>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary">
            Save threshold
          </button>
        </div>
      </form>

      <div className="card">
        <div className="page-header" style={{ marginBottom: 12 }}>
          <h1 style={{ fontSize: 16 }}>PG capacity</h1>
        </div>
        <p>
          {rooms.length} rooms · {totalOccupied} / {totalCapacity} beds occupied
        </p>
        <p className="hint">
          To edit a room's capacity, go to <Link to="/directory">Directory → Rooms</Link>.
        </p>
      </div>
    </RequireAdmin>
  )
}
