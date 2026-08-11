import { NavLink, Outlet } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useCollection } from '../hooks/useCollection'
import { DeskExpenseEntry, DeskIncomeEntry } from '../lib/types'
import { getCurrentUserName, setCurrentUserName } from '../lib/session'
import { promptText } from '../lib/promptDialog'
import { useAuth } from '../lib/auth'
import { useOnlineStatus } from '../lib/offline'
import Toast from './Toast'
import PromptDialogHost from './PromptDialogHost'

export default function Layout(): React.JSX.Element {
  const { data: incomeEntries } = useCollection<DeskIncomeEntry>('deskIncomeEntries')
  const { data: expenseEntries } = useCollection<DeskExpenseEntry>('deskExpenseEntries')
  const { role, logout } = useAuth()
  const [userName, setUserName] = useState(getCurrentUserName())
  const isOnline = useOnlineStatus()

  useEffect(() => {
    if (!userName) {
      promptText('Your name (used to tag entries/approvals you make):').then((name) => {
        if (name) {
          setCurrentUserName(name)
          setUserName(name)
        }
      })
    }
  }, [userName])

  const pendingCount =
    incomeEntries.filter((e) => e.status === 'pending').length +
    expenseEntries.filter((e) => e.status === 'pending').length

  async function changeName(): Promise<void> {
    const name = await promptText('Your name:', userName)
    if (name) {
      setCurrentUserName(name)
      setUserName(name)
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <strong>MiSpace PG</strong>
          <span>Income &amp; Expense Manager</span>
        </div>
        <nav>
          <NavLink to="/" end>
            Dashboard
          </NavLink>
          <NavLink to="/income/new">New Income</NavLink>
          <NavLink to="/expense/new">New Expense</NavLink>
          <NavLink to="/bookings">Bookings</NavLink>
          <NavLink to="/records">Records</NavLink>
          <NavLink to="/directory">Directory</NavLink>
          <NavLink to="/reports">Reports</NavLink>
          <NavLink to="/checklist">Checklist</NavLink>
          <NavLink to="/cash-management">Cash Management</NavLink>
          <NavLink to="/update-employees">Employees</NavLink>
          <NavLink to="/update-residents">Residents</NavLink>
          {role === 'admin' && (
            <>
              <NavLink to="/approvals">
                <span>Approvals</span>
                {pendingCount > 0 && <span className="badge">{pendingCount}</span>}
              </NavLink>
              <NavLink to="/settings">Settings</NavLink>
            </>
          )}
        </nav>
        <div className="sidebar-user">
          {role === 'admin' ? 'Admin' : 'Supervisor'}: <strong>{userName || 'Unknown'}</strong>
          <br />
          <button onClick={changeName}>change name</button>
          {' · '}
          <button onClick={logout}>log out</button>
        </div>
      </aside>
      <main className="content">
        {!isOnline && (
          <div
            className="card"
            style={{
              borderColor: 'var(--warning)',
              background: 'var(--warning-bg)',
              marginBottom: 16,
              fontWeight: 600
            }}
          >
            ⚠ You're offline — entries you save now are stored locally and will sync
            automatically once your connection is back.
          </div>
        )}
        <Outlet />
      </main>
      <Toast />
      <PromptDialogHost />
    </div>
  )
}
