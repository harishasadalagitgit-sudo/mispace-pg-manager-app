import { FormEvent, useMemo, useState } from 'react'
import { addDoc, collection, deleteDoc, doc, updateDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useCollection } from '../hooks/useCollection'
import { CashManagementEntry } from '../lib/types'
import { getCurrentUserName } from '../lib/session'
import { showToast } from '../lib/toast'
import { writeWithOfflineFallback } from '../lib/offline'

type Row = CashManagementEntry & { id: string }

type EditableFields = Omit<CashManagementEntry, 'enteredBy' | 'enteredAt'>

function todayISODate(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`
}

const EMPTY_FORM: EditableFields = {
  date: todayISODate(),
  supervisorName: '',
  managementPerson: '',
  cashFromManagement: 0,
  cashFromIncome: 0,
  cashCarriedForward: 0,
  spentGroceries: 0,
  spentVegetables: 0,
  spentAdvanceReturn: 0,
  spentOther: 0,
  cashReturnedToManagement: 0,
  remarks: ''
}

// Cash left over at the end of a day's log that hasn't been handed back —
// this becomes the next day's "carried forward" starting point.
function closingCarry(r: EditableFields): number {
  const available = r.cashCarriedForward + r.cashFromManagement + r.cashFromIncome
  const spent =
    r.spentGroceries + r.spentVegetables + r.spentAdvanceReturn + r.spentOther + r.cashReturnedToManagement
  return available - spent
}

export default function CashManagement(): React.JSX.Element {
  const { data: entries, loading, refetch } = useCollection<CashManagementEntry>('cashManagementLogs', 'date')

  const sortedEntries = useMemo(
    () => [...entries].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    [entries]
  )

  const [dateMode, setDateMode] = useState<'all' | 'month' | 'custom'>('all')
  const [filterMonth, setFilterMonth] = useState(() => todayISODate().slice(0, 7))
  const [filterStartDate, setFilterStartDate] = useState('')
  const [filterEndDate, setFilterEndDate] = useState('')
  const [groupByWeek, setGroupByWeek] = useState(false)

  const filteredEntries = useMemo(() => {
    if (dateMode === 'month') {
      return sortedEntries.filter((r) => r.date.startsWith(filterMonth))
    }
    if (dateMode === 'custom') {
      return sortedEntries.filter(
        (r) => (!filterStartDate || r.date >= filterStartDate) && (!filterEndDate || r.date <= filterEndDate)
      )
    }
    return sortedEntries
  }, [sortedEntries, dateMode, filterMonth, filterStartDate, filterEndDate])

  // Monday-start week bucket for a YYYY-MM-DD date string.
  function weekBucket(dateStr: string): { start: string; end: string } {
    const d = new Date(dateStr)
    const dow = d.getDay() // 0 = Sunday
    const diffToMonday = dow === 0 ? -6 : 1 - dow
    const start = new Date(d)
    start.setDate(d.getDate() + diffToMonday)
    const end = new Date(start)
    end.setDate(start.getDate() + 6)
    return { start: toLocalISODate(start), end: toLocalISODate(end) }
  }

  function toLocalISODate(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}`
  }

  const weekGroups = useMemo(() => {
    if (!groupByWeek) return []
    const map = new Map<string, { start: string; end: string; rows: Row[] }>()
    filteredEntries.forEach((r) => {
      const { start, end } = weekBucket(r.date)
      const key = start
      const g = map.get(key) || { start, end, rows: [] }
      g.rows.push(r)
      map.set(key, g)
    })
    return Array.from(map.values()).sort((a, b) => (a.start < b.start ? 1 : -1))
  }, [filteredEntries, groupByWeek])

  const [isOpen, setIsOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<EditableFields>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  function openAdd(): void {
    setEditingId(null)
    // Prefill "carried forward" from the most recent prior day's leftover —
    // still fully editable in case the actual handoff differed.
    const mostRecentPrior = sortedEntries[0]
    setForm({
      ...EMPTY_FORM,
      date: todayISODate(),
      supervisorName: getCurrentUserName() || '',
      cashCarriedForward: mostRecentPrior ? Math.max(0, closingCarry(mostRecentPrior)) : 0
    })
    setIsOpen(true)
  }

  function openEdit(row: Row): void {
    setEditingId(row.id)
    setForm({
      date: row.date,
      supervisorName: row.supervisorName,
      managementPerson: row.managementPerson,
      cashFromManagement: row.cashFromManagement,
      cashFromIncome: row.cashFromIncome,
      cashCarriedForward: row.cashCarriedForward,
      spentGroceries: row.spentGroceries,
      spentVegetables: row.spentVegetables,
      spentAdvanceReturn: row.spentAdvanceReturn,
      spentOther: row.spentOther,
      cashReturnedToManagement: row.cashReturnedToManagement,
      remarks: row.remarks || ''
    })
    setIsOpen(true)
  }

  function closeForm(): void {
    setIsOpen(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
  }

  const totalAvailable = form.cashCarriedForward + form.cashFromManagement + form.cashFromIncome
  const totalSpent =
    form.spentGroceries + form.spentVegetables + form.spentAdvanceReturn + form.spentOther
  const expectedCarryForward = totalAvailable - totalSpent - form.cashReturnedToManagement

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault()
    if (!form.supervisorName || !form.managementPerson) {
      showToast('Supervisor name and management person are required', 'error')
      return
    }
    setSaving(true)
    try {
      const payload = {
        ...form,
        enteredBy: getCurrentUserName() || 'Unknown',
        enteredAt: new Date().toISOString()
      }
      if (editingId) {
        await updateDoc(doc(db, 'cashManagementLogs', editingId), payload)
        showToast('Cash log updated')
      } else {
        const result = await writeWithOfflineFallback(addDoc(collection(db, 'cashManagementLogs'), payload))
        showToast(
          result === 'synced'
            ? 'Cash log saved'
            : "Saved offline — will sync automatically once you're back online"
        )
      }
      closeForm()
    } catch (err) {
      console.error(err)
      showToast('Save failed: ' + (err as Error).message, 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(row: Row): Promise<void> {
    if (!window.confirm(`Delete the cash log for ${row.date}? This cannot be undone.`)) return
    try {
      await deleteDoc(doc(db, 'cashManagementLogs', row.id))
      showToast('Cash log deleted')
      if (editingId === row.id) closeForm()
    } catch (err) {
      console.error(err)
      showToast('Delete failed: ' + (err as Error).message, 'error')
    }
  }

  const num = (v: number) => `₹${v.toLocaleString()}`

  return (
    <>
      <div className="page-header">
        <h1>Cash Management</h1>
        <p>
          Daily reconciliation of physical cash held by whoever is on duty — what they started
          with, what came in, what went out, and what's handed back to management.
        </p>
      </div>

      <div className="filter-bar card">
        <button className="btn btn-secondary" onClick={refetch} disabled={loading}>
          Refresh
        </button>
        <button className="btn btn-primary" onClick={openAdd}>
          + Log today's cash
        </button>
      </div>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="radio-row" style={{ flexWrap: 'wrap' }}>
          {(['all', 'month', 'custom'] as const).map((mode) => (
            <label key={mode}>
              <input
                type="radio"
                checked={dateMode === mode}
                onChange={() => setDateMode(mode)}
              />
              {mode === 'all' ? 'All Time' : mode === 'month' ? 'Month' : 'Custom Range'}
            </label>
          ))}
        </div>

        {dateMode === 'month' && (
          <div className="form-field" style={{ maxWidth: 220 }}>
            <label>Month</label>
            <input type="month" value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} />
          </div>
        )}

        {dateMode === 'custom' && (
          <div className="form-grid" style={{ maxWidth: 460 }}>
            <div className="form-field">
              <label>Start date</label>
              <input type="date" value={filterStartDate} onChange={(e) => setFilterStartDate(e.target.value)} />
            </div>
            <div className="form-field">
              <label>End date</label>
              <input type="date" value={filterEndDate} onChange={(e) => setFilterEndDate(e.target.value)} />
            </div>
          </div>
        )}

        <div>
          <button
            type="button"
            className={groupByWeek ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
            onClick={() => setGroupByWeek((v) => !v)}
          >
            {groupByWeek ? 'Grouped by week' : 'Group by week'}
          </button>
        </div>
      </div>

      {isOpen && (
        <form className="card" onSubmit={handleSubmit} style={{ borderColor: 'var(--primary)' }}>
          <div className="page-header" style={{ marginBottom: 12 }}>
            <h1 style={{ fontSize: 16 }}>{editingId ? 'Edit cash log' : "New day's cash log"}</h1>
          </div>
          <div className="form-grid">
            <div className="form-field">
              <label>Date</label>
              <input
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                required
              />
            </div>
            <div className="form-field">
              <label>Supervisor name</label>
              <input
                value={form.supervisorName}
                onChange={(e) => setForm({ ...form, supervisorName: e.target.value })}
                required
              />
            </div>
            <div className="form-field">
              <label>Management person</label>
              <input
                value={form.managementPerson}
                onChange={(e) => setForm({ ...form, managementPerson: e.target.value })}
                placeholder="Who handed over / will receive the cash"
                required
              />
            </div>

            <div className="form-field">
              <label>Cash left from previous day (₹)</label>
              <input
                type="number"
                value={form.cashCarriedForward}
                onChange={(e) => setForm({ ...form, cashCarriedForward: Number(e.target.value) })}
              />
            </div>
            <div className="form-field">
              <label>Cash received from management (₹)</label>
              <input
                type="number"
                value={form.cashFromManagement}
                onChange={(e) => setForm({ ...form, cashFromManagement: Number(e.target.value) })}
              />
            </div>
            <div className="form-field">
              <label>Cash received as income (₹)</label>
              <input
                type="number"
                value={form.cashFromIncome}
                onChange={(e) => setForm({ ...form, cashFromIncome: Number(e.target.value) })}
                placeholder="Rent / advance collected in cash today"
              />
            </div>

            <div className="form-field">
              <label>Spent on groceries (₹)</label>
              <input
                type="number"
                value={form.spentGroceries}
                onChange={(e) => setForm({ ...form, spentGroceries: Number(e.target.value) })}
              />
            </div>
            <div className="form-field">
              <label>Spent on vegetables (₹)</label>
              <input
                type="number"
                value={form.spentVegetables}
                onChange={(e) => setForm({ ...form, spentVegetables: Number(e.target.value) })}
              />
            </div>
            <div className="form-field">
              <label>Spent returning advance/rent (₹)</label>
              <input
                type="number"
                value={form.spentAdvanceReturn}
                onChange={(e) => setForm({ ...form, spentAdvanceReturn: Number(e.target.value) })}
              />
            </div>
            <div className="form-field">
              <label>Spent on other categories (₹)</label>
              <input
                type="number"
                value={form.spentOther}
                onChange={(e) => setForm({ ...form, spentOther: Number(e.target.value) })}
              />
            </div>

            <div className="form-field">
              <label>Cash returned to management (₹)</label>
              <input
                type="number"
                value={form.cashReturnedToManagement}
                onChange={(e) => setForm({ ...form, cashReturnedToManagement: Number(e.target.value) })}
              />
            </div>

            <div className="form-field full">
              <label>Remarks</label>
              <textarea
                rows={2}
                value={form.remarks}
                onChange={(e) => setForm({ ...form, remarks: e.target.value })}
              />
            </div>
          </div>

          <div
            className="card"
            style={{ marginTop: 4, background: 'var(--bg-secondary, #f1f2f4)', border: 'none' }}
          >
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 13 }}>
              <span>
                Total available: <strong>{num(totalAvailable)}</strong>
              </span>
              <span>
                Total spent: <strong>{num(totalSpent)}</strong>
              </span>
              <span>
                Carries forward to next day:{' '}
                <strong style={{ color: expectedCarryForward < 0 ? 'var(--danger)' : 'inherit' }}>
                  {num(expectedCarryForward)}
                </strong>
              </span>
            </div>
            {expectedCarryForward < 0 && (
              <p className="hint" style={{ color: 'var(--danger)', marginTop: 6 }}>
                Spent + returned is more than what was available — double-check the numbers.
              </p>
            )}
          </div>

          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : editingId ? 'Save changes' : 'Save cash log'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={closeForm}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {(() => {
        const renderRow = (r: Row) => (
          <tr key={r.id}>
            <td>{r.date}</td>
            <td>{r.supervisorName}</td>
            <td>{r.managementPerson}</td>
            <td>{num(r.cashFromManagement)}</td>
            <td>{num(r.cashReturnedToManagement)}</td>
            <td>{num(r.cashFromIncome)}</td>
            <td>{num(r.cashCarriedForward)}</td>
            <td>{num(r.spentGroceries)}</td>
            <td>{num(r.spentVegetables)}</td>
            <td>{num(r.spentAdvanceReturn)}</td>
            <td>{num(r.spentOther)}</td>
            <td style={{ color: closingCarry(r) < 0 ? 'var(--danger)' : undefined }}>
              {num(closingCarry(r))}
            </td>
            <td>
              <button className="btn btn-secondary btn-sm" onClick={() => openEdit(r)}>
                Edit
              </button>{' '}
              <button className="btn btn-danger btn-sm" onClick={() => handleDelete(r)}>
                Delete
              </button>
            </td>
          </tr>
        )

        const tableHead = (
          <thead>
            <tr>
              <th>Date</th>
              <th>Supervisor</th>
              <th>Management person</th>
              <th>From management</th>
              <th>Returned to mgmt</th>
              <th>Income (cash)</th>
              <th>Carried forward</th>
              <th>Groceries</th>
              <th>Vegetables</th>
              <th>Advance/rent return</th>
              <th>Other</th>
              <th>Carries to next day</th>
              <th></th>
            </tr>
          </thead>
        )

        if (filteredEntries.length === 0) {
          return (
            <div className="card">
              <div className="empty-state">No cash logs match this filter.</div>
            </div>
          )
        }

        if (!groupByWeek) {
          return (
            <div className="card table-scroll">
              <table>
                {tableHead}
                <tbody>{filteredEntries.map(renderRow)}</tbody>
              </table>
            </div>
          )
        }

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {weekGroups.map((g) => {
              const returned = g.rows.reduce((s, r) => s + r.cashReturnedToManagement, 0)
              const income = g.rows.reduce((s, r) => s + r.cashFromIncome, 0)
              const spent = g.rows.reduce(
                (s, r) => s + r.spentGroceries + r.spentVegetables + r.spentAdvanceReturn + r.spentOther,
                0
              )
              return (
                <div key={g.start}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      background: 'var(--bg-secondary, #f1f2f4)',
                      borderRadius: 8,
                      padding: '8px 12px',
                      marginBottom: 8,
                      fontWeight: 700,
                      fontSize: 13
                    }}
                  >
                    <span>
                      Week of {g.start} – {g.end}
                    </span>
                    <span>
                      {g.rows.length} day{g.rows.length === 1 ? '' : 's'} · Income {num(income)} · Spent{' '}
                      {num(spent)} · Returned {num(returned)}
                    </span>
                  </div>
                  <div className="card table-scroll">
                    <table>
                      {tableHead}
                      <tbody>{g.rows.map(renderRow)}</tbody>
                    </table>
                  </div>
                </div>
              )
            })}
          </div>
        )
      })()}
    </>
  )
}
