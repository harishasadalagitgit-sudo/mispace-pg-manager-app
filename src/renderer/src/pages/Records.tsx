import { useMemo, useState } from 'react'
import { deleteDoc, doc, updateDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useCollection } from '../hooks/useCollection'
import {
  DeskExpenseEntry,
  DeskIncomeEntry,
  EXPENSE_CATEGORIES,
  EntryStatus,
  ExpenseCategory,
  PaymentMode,
  WebsiteExpense,
  WebsiteIncomingPayment,
  WebsiteRoom
} from '../lib/types'
import { showToast } from '../lib/toast'

type Tab = 'income' | 'expense'
type DateMode = 'all' | 'month' | 'custom'
type IncomeRow = DeskIncomeEntry & { id: string }
type ExpenseRow = DeskExpenseEntry & { id: string }
type Source = 'Desktop' | 'Website'

function currentMonthValue(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function lastDayOfMonth(monthValue: string): string {
  const [y, m] = monthValue.split('-').map(Number)
  if (!y || !m) return monthValue
  const d = new Date(y, m, 0) // day 0 of next month = last day of this month
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`
}

interface UnifiedIncomeRow {
  id: string
  source: Source
  date: string
  amount: number
  roomBed: string
  rentMonth: string
  mode: string
  paidTo: string
  paidBy: string
  status: EntryStatus
  enteredBy: string
  remarks: string
  deskRow?: IncomeRow
}

interface UnifiedExpenseRow {
  id: string
  source: Source
  date: string
  category: string
  amount: number
  mode: string
  paidTo: string
  paidBy: string
  status: EntryStatus
  enteredBy: string
  remarks: string
  deskRow?: ExpenseRow
}

function StatusPill({ status }: { status: EntryStatus }): React.JSX.Element {
  return <span className={`pill pill-${status}`}>{status}</span>
}

export default function Records(): React.JSX.Element {
  const { data: incomeEntries } = useCollection<DeskIncomeEntry>('deskIncomeEntries', 'enteredAt')
  const { data: expenseEntries } = useCollection<DeskExpenseEntry>(
    'deskExpenseEntries',
    'enteredAt'
  )
  const { data: liveIncome } = useCollection<WebsiteIncomingPayment>('incomingPayments')
  const { data: liveExpenses } = useCollection<WebsiteExpense>('expenses')
  const { data: rooms } = useCollection<WebsiteRoom>('rooms')
  const sortedRooms = useMemo(
    () => [...rooms].sort((a, b) => Number(a.roomNum) - Number(b.roomNum)),
    [rooms]
  )

  const [tab, setTab] = useState<Tab>('income')
  const [statusFilter, setStatusFilter] = useState<'all' | EntryStatus>('all')
  const [dateMode, setDateMode] = useState<DateMode>('all')
  const [month, setMonth] = useState(currentMonthValue())
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [search, setSearch] = useState('')

  const fromDate = dateMode === 'month' ? `${month}-01` : dateMode === 'custom' ? customFrom : ''
  const toDate = dateMode === 'month' ? lastDayOfMonth(month) : dateMode === 'custom' ? customTo : ''

  const [editingIncome, setEditingIncome] = useState<IncomeRow | null>(null)
  const [editingExpense, setEditingExpense] = useState<ExpenseRow | null>(null)

  // Every desk entry that was approved carries the id of the live record it
  // created — exclude those from the live-collection side so they don't show
  // twice (once as the desk row, once as the live record it produced).
  const linkedIncomeIds = useMemo(
    () => new Set(incomeEntries.map((e) => e.linkedIncomingPaymentId).filter(Boolean)),
    [incomeEntries]
  )
  const linkedExpenseIds = useMemo(
    () => new Set(expenseEntries.map((e) => e.linkedExpenseId).filter(Boolean)),
    [expenseEntries]
  )

  const unifiedIncome: UnifiedIncomeRow[] = useMemo(() => {
    const fromDesk: UnifiedIncomeRow[] = incomeEntries.map((e) => ({
      id: e.id!,
      source: 'Desktop',
      date: e.date,
      amount: e.amount,
      roomBed: `${e.roomNum}/${e.bedNum}`,
      rentMonth: e.rentMonth,
      mode: e.paymentMode,
      paidTo: e.paidTo,
      paidBy: e.paidBy,
      status: e.status,
      enteredBy: e.enteredBy,
      remarks: e.remarks || '',
      deskRow: e as IncomeRow
    }))
    const fromWebsite: UnifiedIncomeRow[] = liveIncome
      .filter((p) => !linkedIncomeIds.has(p.id))
      .map((p) => ({
        id: p.id,
        source: 'Website',
        date: p.paymentDate,
        amount: p.amount,
        roomBed: p.bedNum ? `${p.roomNum}/${p.bedNum}` : p.roomNum || '—',
        rentMonth: '—',
        mode: p.paidInCash ? 'Cash' : 'Online',
        paidTo: p.payee || '',
        paidBy: p.residentName || '',
        status: 'approved',
        enteredBy: '—',
        remarks: p.notes || ''
      }))
    return [...fromDesk, ...fromWebsite].sort((a, b) => (a.date < b.date ? 1 : -1))
  }, [incomeEntries, liveIncome, linkedIncomeIds])

  const unifiedExpense: UnifiedExpenseRow[] = useMemo(() => {
    const fromDesk: UnifiedExpenseRow[] = expenseEntries.map((e) => ({
      id: e.id!,
      source: 'Desktop',
      date: e.date,
      category: e.category,
      amount: e.amount,
      mode: e.paymentMode,
      paidTo: e.paidTo,
      paidBy: e.paidBy,
      status: e.status,
      enteredBy: e.enteredBy,
      remarks: e.remarks || '',
      deskRow: e as ExpenseRow
    }))
    const fromWebsite: UnifiedExpenseRow[] = liveExpenses
      .filter((e) => !linkedExpenseIds.has(e.id))
      .map((e) => ({
        id: e.id,
        source: 'Website',
        date: e.dateOfPayment,
        category: e.title || e.expenseType,
        amount: e.amount,
        mode: e.paidInCash ? 'Cash' : 'Online',
        paidTo: e.recipient || '',
        paidBy: e.paidBy || '',
        status: 'approved',
        enteredBy: '—',
        remarks: e.notes || ''
      }))
    return [...fromDesk, ...fromWebsite].sort((a, b) => (a.date < b.date ? 1 : -1))
  }, [expenseEntries, liveExpenses, linkedExpenseIds])

  function matchesCommonFilters(date: string, haystack: string): boolean {
    if (fromDate && date < fromDate) return false
    if (toDate && date > toDate) return false
    if (search && !haystack.toLowerCase().includes(search.toLowerCase())) return false
    return true
  }

  const filteredIncome = useMemo(
    () =>
      unifiedIncome.filter((e) => {
        if (statusFilter !== 'all' && e.status !== statusFilter) return false
        return matchesCommonFilters(e.date, `${e.paidTo} ${e.paidBy} ${e.remarks} ${e.roomBed}`)
      }),
    [unifiedIncome, statusFilter, fromDate, toDate, search]
  )

  const filteredExpense = useMemo(
    () =>
      unifiedExpense.filter((e) => {
        if (statusFilter !== 'all' && e.status !== statusFilter) return false
        return matchesCommonFilters(e.date, `${e.paidTo} ${e.paidBy} ${e.remarks} ${e.category}`)
      }),
    [unifiedExpense, statusFilter, fromDate, toDate, search]
  )

  async function deleteEntry(row: UnifiedIncomeRow | UnifiedExpenseRow, kind: Tab): Promise<void> {
    if (row.source !== 'Desktop' || row.status !== 'pending') {
      showToast('Only pending, app-submitted entries can be deleted here', 'error')
      return
    }
    if (!window.confirm('Delete this entry? This cannot be undone.')) return
    const collectionName = kind === 'income' ? 'deskIncomeEntries' : 'deskExpenseEntries'
    await deleteDoc(doc(db, collectionName, row.id))
    showToast('Entry deleted')
  }

  async function saveIncomeEdit(): Promise<void> {
    if (!editingIncome) return
    const { id, ...fields } = editingIncome
    await updateDoc(doc(db, 'deskIncomeEntries', id), { ...fields })
    showToast('Income entry updated')
    setEditingIncome(null)
  }

  async function saveExpenseEdit(): Promise<void> {
    if (!editingExpense) return
    const { id, ...fields } = editingExpense
    await updateDoc(doc(db, 'deskExpenseEntries', id), { ...fields })
    showToast('Expense entry updated')
    setEditingExpense(null)
  }

  const editingRoom = sortedRooms.find((r) => r.roomNum === editingIncome?.roomNum)

  return (
    <>
      <div className="page-header">
        <h1>Records</h1>
        <p>Every income and expense record — from this app and the live website database.</p>
      </div>

      <div className="filter-bar card">
        <div className="form-field">
          <label>Type</label>
          <select value={tab} onChange={(e) => setTab(e.target.value as Tab)}>
            <option value="income">Income</option>
            <option value="expense">Expense</option>
          </select>
        </div>
        <div className="form-field">
          <label>Status</label>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as never)}>
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
        <div className="form-field">
          <label>Date range</label>
          <div className="radio-row" style={{ height: 38, alignItems: 'center' }}>
            <label>
              <input type="radio" checked={dateMode === 'all'} onChange={() => setDateMode('all')} />
              All
            </label>
            <label>
              <input
                type="radio"
                checked={dateMode === 'month'}
                onChange={() => setDateMode('month')}
              />
              Month
            </label>
            <label>
              <input
                type="radio"
                checked={dateMode === 'custom'}
                onChange={() => setDateMode('custom')}
              />
              Custom
            </label>
          </div>
        </div>

        {dateMode === 'month' && (
          <div className="form-field">
            <label>Month</label>
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </div>
        )}

        {dateMode === 'custom' && (
          <>
            <div className="form-field">
              <label>From</label>
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
            </div>
            <div className="form-field">
              <label>To</label>
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
            </div>
          </>
        )}

        <div className="form-field" style={{ flex: 1 }}>
          <label>Search</label>
          <input
            placeholder="Room, name, remarks…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {editingIncome && (
        <div className="card" style={{ borderColor: 'var(--primary)' }}>
          <div className="form-grid">
            <div className="form-field">
              <label>Date</label>
              <input
                type="date"
                value={editingIncome.date}
                onChange={(e) => setEditingIncome({ ...editingIncome, date: e.target.value })}
              />
            </div>
            <div className="form-field">
              <label>Amount</label>
              <input
                type="number"
                value={editingIncome.amount}
                onChange={(e) =>
                  setEditingIncome({ ...editingIncome, amount: Number(e.target.value) })
                }
              />
            </div>
            <div className="form-field">
              <label>Room</label>
              <select
                value={editingIncome.roomNum}
                onChange={(e) =>
                  setEditingIncome({ ...editingIncome, roomNum: e.target.value, bedNum: 1 })
                }
              >
                {sortedRooms.map((r) => (
                  <option key={r.id} value={r.roomNum}>
                    {r.roomNum}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label>Bed</label>
              <select
                value={editingIncome.bedNum}
                onChange={(e) =>
                  setEditingIncome({ ...editingIncome, bedNum: Number(e.target.value) })
                }
              >
                {Array.from({ length: editingRoom?.capacity || 1 }, (_, i) => i + 1).map((b) => (
                  <option key={b} value={b}>
                    Bed {b}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label>Rent month</label>
              <input
                type="month"
                value={editingIncome.rentMonth}
                onChange={(e) => setEditingIncome({ ...editingIncome, rentMonth: e.target.value })}
              />
            </div>
            <div className="form-field">
              <label>Mode</label>
              <select
                value={editingIncome.paymentMode}
                onChange={(e) =>
                  setEditingIncome({
                    ...editingIncome,
                    paymentMode: e.target.value as PaymentMode
                  })
                }
              >
                <option value="Cash">Cash</option>
                <option value="Online">Online</option>
              </select>
            </div>
            <div className="form-field">
              <label>Paid to</label>
              <input
                value={editingIncome.paidTo}
                onChange={(e) => setEditingIncome({ ...editingIncome, paidTo: e.target.value })}
              />
            </div>
            <div className="form-field">
              <label>Paid by</label>
              <input
                value={editingIncome.paidBy}
                onChange={(e) => setEditingIncome({ ...editingIncome, paidBy: e.target.value })}
              />
            </div>
            <div className="form-field full">
              <label>Remarks</label>
              <textarea
                rows={2}
                value={editingIncome.remarks || ''}
                onChange={(e) => setEditingIncome({ ...editingIncome, remarks: e.target.value })}
              />
            </div>
          </div>
          <div className="form-actions">
            <button className="btn btn-primary" onClick={saveIncomeEdit}>
              Save
            </button>
            <button className="btn btn-secondary" onClick={() => setEditingIncome(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {editingExpense && (
        <div className="card" style={{ borderColor: 'var(--primary)' }}>
          <div className="form-grid">
            <div className="form-field">
              <label>Date</label>
              <input
                type="date"
                value={editingExpense.date}
                onChange={(e) => setEditingExpense({ ...editingExpense, date: e.target.value })}
              />
            </div>
            <div className="form-field">
              <label>Category</label>
              <select
                value={editingExpense.category}
                onChange={(e) =>
                  setEditingExpense({
                    ...editingExpense,
                    category: e.target.value as ExpenseCategory
                  })
                }
              >
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label>Amount</label>
              <input
                type="number"
                value={editingExpense.amount}
                onChange={(e) =>
                  setEditingExpense({ ...editingExpense, amount: Number(e.target.value) })
                }
              />
            </div>
            <div className="form-field">
              <label>Mode</label>
              <select
                value={editingExpense.paymentMode}
                onChange={(e) =>
                  setEditingExpense({
                    ...editingExpense,
                    paymentMode: e.target.value as PaymentMode
                  })
                }
              >
                <option value="Cash">Cash</option>
                <option value="Online">Online</option>
              </select>
            </div>
            <div className="form-field">
              <label>Paid to</label>
              <input
                value={editingExpense.paidTo}
                onChange={(e) => setEditingExpense({ ...editingExpense, paidTo: e.target.value })}
              />
            </div>
            <div className="form-field">
              <label>Paid by</label>
              <input
                value={editingExpense.paidBy}
                onChange={(e) => setEditingExpense({ ...editingExpense, paidBy: e.target.value })}
              />
            </div>
            <div className="form-field full">
              <label>Remarks</label>
              <textarea
                rows={2}
                value={editingExpense.remarks || ''}
                onChange={(e) => setEditingExpense({ ...editingExpense, remarks: e.target.value })}
              />
            </div>
          </div>
          <div className="form-actions">
            <button className="btn btn-primary" onClick={saveExpenseEdit}>
              Save
            </button>
            <button className="btn btn-secondary" onClick={() => setEditingExpense(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="card table-scroll">
        {tab === 'income' ? (
          filteredIncome.length === 0 ? (
            <div className="empty-state">No income records match these filters.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Room/Bed</th>
                  <th>Rent month</th>
                  <th>Mode</th>
                  <th>Paid to</th>
                  <th>Paid by</th>
                  <th>Status</th>
                  <th>Entered by</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredIncome.map((e) => (
                  <tr key={`${e.source}-${e.id}`}>
                    <td>{e.source}</td>
                    <td>{e.date}</td>
                    <td>₹{e.amount}</td>
                    <td>{e.roomBed}</td>
                    <td>{e.rentMonth}</td>
                    <td>{e.mode}</td>
                    <td>{e.paidTo}</td>
                    <td>{e.paidBy}</td>
                    <td>
                      <StatusPill status={e.status} />
                    </td>
                    <td>{e.enteredBy}</td>
                    <td>
                      {e.source === 'Desktop' && e.status === 'pending' && e.deskRow && (
                        <>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => setEditingIncome(e.deskRow!)}
                          >
                            Edit
                          </button>{' '}
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => deleteEntry(e, 'income')}
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : filteredExpense.length === 0 ? (
          <div className="empty-state">No expense records match these filters.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Source</th>
                <th>Date</th>
                <th>Category</th>
                <th>Amount</th>
                <th>Mode</th>
                <th>Paid to</th>
                <th>Paid by</th>
                <th>Status</th>
                <th>Entered by</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredExpense.map((e) => (
                <tr key={`${e.source}-${e.id}`}>
                  <td>{e.source}</td>
                  <td>{e.date}</td>
                  <td>{e.category}</td>
                  <td>₹{e.amount}</td>
                  <td>{e.mode}</td>
                  <td>{e.paidTo}</td>
                  <td>{e.paidBy}</td>
                  <td>
                    <StatusPill status={e.status} />
                  </td>
                  <td>{e.enteredBy}</td>
                  <td>
                    {e.source === 'Desktop' && e.status === 'pending' && e.deskRow && (
                      <>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => setEditingExpense(e.deskRow!)}
                        >
                          Edit
                        </button>{' '}
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => deleteEntry(e, 'expense')}
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}
