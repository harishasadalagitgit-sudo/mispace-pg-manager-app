import { useMemo, useState } from 'react'
import { doc, setDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useCollection } from '../hooks/useCollection'
import {
  AppSettings,
  Booking,
  DashboardAlertState,
  DeskExpenseEntry,
  DeskIncomeEntry,
  WebsiteEnquiry,
  WebsiteExpense,
  WebsiteIncomingPayment,
  WebsiteResident,
  WebsiteRoom
} from '../lib/types'
import { getCurrentUserName } from '../lib/session'
import { showToast } from '../lib/toast'
import { useAuth } from '../lib/auth'
import { Link } from 'react-router-dom'
import bedIcon from '../assets/bedimageforicon.png'
import { nextDueDate, daysOverdue } from '../lib/rentCalc'

function currentMonthPrefix(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function toLocalISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`
}

function isMonthEndReminderDay(): boolean {
  const day = new Date().getDate()
  return day === 29 || day === 30
}

// Desktop expense entries preserve their fine-grained category (e.g. "Rent")
// in the notes field — needed to tell an actual "Rent" expense (the PG's own
// rent paid to the building owner) apart from the generic "Others" bucket
// both map to on the website side.
function expenseCategory(e: WebsiteExpense): string {
  const match = e.notes?.match(/^Category:\s*([^—]+)/)
  return match ? match[1].trim() : e.expenseType
}

const DEFAULT_EXPENSE_ALERT_THRESHOLD = 550000

export default function Dashboard(): React.JSX.Element {
  const { role } = useAuth()
  const { data: rooms } = useCollection<WebsiteRoom>('rooms')
  const { data: residents } = useCollection<WebsiteResident>('residents')
  const { data: incomingPayments } = useCollection<WebsiteIncomingPayment>('incomingPayments')
  const { data: expenses } = useCollection<WebsiteExpense>('expenses')
  const { data: deskIncome } = useCollection<DeskIncomeEntry>('deskIncomeEntries')
  const { data: deskExpense } = useCollection<DeskExpenseEntry>('deskExpenseEntries')
  const { data: bookings } = useCollection<Booking>('bookings')
  const { data: enquiries } = useCollection<WebsiteEnquiry>('enquiries')
  const { data: appSettings } = useCollection<AppSettings>('appSettings')
  const { data: dashboardAlerts } = useCollection<DashboardAlertState>('dashboardAlerts')

  const [showVacancies, setShowVacancies] = useState(false)
  const [showTodaysCollections, setShowTodaysCollections] = useState(false)

  // Residents whose next rent due date falls within the next 3 days
  // (today + 0..3) — e.g. today Aug 11 -> due dates Aug 11/12/13/14 qualify.
  type CollectionFlag = 'darkgreen' | 'green' | 'yellow' | 'orange' | 'red'

  const todaysCollections = useMemo(() => {
    const today = new Date()
    const todayStr = toLocalISODate(today)
    const windowEnd = new Date(today)
    windowEnd.setDate(windowEnd.getDate() + 3)
    const windowEndStr = toLocalISODate(windowEnd)

    return residents
      .filter((r) => r.joiningDate && (r.balanceAmount || 0) > 0)
      .map((r) => {
        const overdueDays = daysOverdue(r.rentAmount || 0, r.balanceAmount || 0, r.joiningDate, today)
        const rent = r.rentAmount || 0
        const balance = r.balanceAmount || 0
        // A balance that's an exact multiple of rent means nothing was paid
        // toward the outstanding cycle(s) — a partial payment leaves a
        // remainder. Only meaningful once they're actually overdue.
        const fullyUnpaid = overdueDays > 0 && rent > 0 && balance % rent === 0

        let flag: CollectionFlag
        let action: string
        if (overdueDays === 0) {
          flag = 'darkgreen'
          action = 'Send reminder — due date approaching'
        } else if (overdueDays <= 7) {
          // Small outstanding balance within the 1-week grace window isn't
          // worth an escalated color — treat it like a reminder, not a warning.
          flag = balance <= 2000 ? 'green' : 'yellow'
          action = fullyUnpaid ? 'Warning — full rent not paid' : 'Warning — partial rent paid'
        } else if (fullyUnpaid) {
          flag = 'red'
          action = 'Warning — full rent not paid'
        } else {
          flag = 'orange'
          action = 'Warning — partial rent paid'
        }

        // Reminders (not yet due): the upcoming month's full rent.
        // Fully unpaid last month: the full rent, since nothing was paid
        // toward it. Partially paid last month: only the remainder still
        // owed toward that cycle, not the full rent or the whole balance.
        const minDue = overdueDays === 0 ? rent : fullyUnpaid ? rent : balance % rent

        return {
          resident: r,
          due: nextDueDate(r.joiningDate, today),
          overdueDays,
          redFlag: overdueDays > 0,
          flag,
          action,
          minDue
        }
      })
      .filter(({ due, redFlag }) => redFlag || (due && due >= todayStr && due <= windowEndStr))
      .sort((a, b) => {
        const flagOrder: Record<CollectionFlag, number> = {
          red: 0,
          orange: 1,
          yellow: 2,
          green: 3,
          darkgreen: 4
        }
        if (flagOrder[a.flag] !== flagOrder[b.flag]) return flagOrder[a.flag] - flagOrder[b.flag]
        if (a.redFlag) return b.overdueDays - a.overdueDays
        return a.due.localeCompare(b.due)
      })
  }, [residents])

  const month = currentMonthPrefix()
  const expenseAlertThreshold =
    appSettings.find((s) => s.id === 'dashboard')?.expenseAlertThreshold ??
    DEFAULT_EXPENSE_ALERT_THRESHOLD
  const alertState = dashboardAlerts.find((a) => a.id === month)
  const expenseAlertDismissed = alertState?.expenseAlertDismissed === true

  async function dismissExpenseAlert(): Promise<void> {
    try {
      await setDoc(
        doc(db, 'dashboardAlerts', month),
        {
          month,
          expenseAlertDismissed: true,
          dismissedBy: getCurrentUserName() || 'Admin',
          dismissedAt: new Date().toISOString()
        },
        { merge: true }
      )
    } catch (err) {
      console.error(err)
      showToast('Failed to dismiss alert: ' + (err as Error).message, 'error')
    }
  }

  const monthIncome = useMemo(
    () =>
      incomingPayments
        .filter((p) => p.paymentDate?.startsWith(month))
        .reduce((sum, p) => sum + (p.amount || 0), 0),
    [incomingPayments, month]
  )

  const monthExpense = useMemo(
    () =>
      expenses
        .filter((e) => e.dateOfPayment?.startsWith(month))
        .reduce((sum, e) => sum + (e.amount || 0), 0),
    [expenses, month]
  )

  // Fixed building rent the PG itself pays — ₹4.5L/month, but 0 for
  // June and July 2026 (before the lease started).
  const BUILDING_RENT = 450000
  const buildingRentForMonth = month < '2026-08' ? 0 : BUILDING_RENT

  // Total expenses (Rent, gas, rice bags, groceries, utility bills, employee
  // salaries, meat, eggs, curd, vegetables, and everything else) excluding
  // the PG's own building Rent — alerts once it crosses the configurable
  // threshold set in Settings (see expenseAlertThreshold below).
  const monthExpenseExcludingRent = useMemo(
    () =>
      expenses
        .filter((e) => e.dateOfPayment?.startsWith(month) && expenseCategory(e) !== 'Rent')
        .reduce((sum, e) => sum + (e.amount || 0), 0),
    [expenses, month]
  )

  const pendingCount =
    deskIncome.filter((e) => e.status === 'pending').length +
    deskExpense.filter((e) => e.status === 'pending').length

  const totalCapacity = rooms.reduce((sum, r) => sum + (r.capacity || 6), 0)
  const totalOccupied = rooms.reduce((sum, r) => sum + (r.occupiedCount || 0), 0)
  const pendingBookingsList = bookings.filter((b) => b.status === 'pending')
  const pendingBookingsCount = pendingBookingsList.length
  const totalReservedByBookings = pendingBookingsList.filter((b) => b.roomNum && b.bedNum).length
  const totalVacantBeds = totalCapacity - totalOccupied - totalReservedByBookings
  const pendingEnquiriesCount = enquiries.filter((e) => e.status === 'Pending').length

  // Group rooms by sharing type (capacity), and work out exactly which beds
  // are vacant in each room from the residents actually assigned to it.
  const vacancyBySharing = useMemo(() => {
    const pendingBookings = bookings.filter((b) => b.status === 'pending')
    const roomsWithVacantBeds = rooms.map((room) => {
      const occupiedBeds = new Set(
        residents.filter((r) => r.roomNum === room.roomNum).map((r) => r.bedNum)
      )
      const reservedBeds = new Set(
        pendingBookings.filter((b) => b.roomNum === room.roomNum).map((b) => b.bedNum)
      )
      const vacantBedNums = Array.from({ length: room.capacity || 6 }, (_, i) => i + 1).filter(
        (b) => !occupiedBeds.has(b) && !reservedBeds.has(b)
      )
      const reservedBedNums = Array.from({ length: room.capacity || 6 }, (_, i) => i + 1).filter(
        (b) => reservedBeds.has(b)
      )
      const allBeds = Array.from({ length: room.capacity || 6 }, (_, i) => i + 1).map((b) => ({
        bedNum: b,
        status: occupiedBeds.has(b)
          ? ('occupied' as const)
          : reservedBeds.has(b)
            ? ('reserved' as const)
            : ('vacant' as const)
      }))
      return { room, vacantBedNums, reservedBedNums, allBeds }
    })

    const groups = new Map<number, { totalVacantBeds: number; rooms: typeof roomsWithVacantBeds }>()
    for (const entry of roomsWithVacantBeds) {
      if (entry.vacantBedNums.length === 0 && entry.reservedBedNums.length === 0) continue
      const capacity = entry.room.capacity || 6
      const group = groups.get(capacity) || { totalVacantBeds: 0, rooms: [] }
      group.totalVacantBeds += entry.vacantBedNums.length
      group.rooms.push(entry)
      groups.set(capacity, group)
    }
    return Array.from(groups.entries())
      .map(([capacity, group]) => ({ capacity, ...group }))
      .sort((a, b) => a.capacity - b.capacity)
  }, [rooms, residents, bookings])

  return (
    <>
      {monthExpenseExcludingRent > expenseAlertThreshold && !expenseAlertDismissed && (
        <div
          className="card"
          style={{
            borderColor: 'var(--danger)',
            borderWidth: 2,
            background: 'var(--danger-bg, #fdecec)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            marginBottom: 20
          }}
        >
          <div>
            ⚠ Expenses excluding Rent this month are{' '}
            <strong>₹{monthExpenseExcludingRent.toLocaleString()}</strong>, over the ₹
            {expenseAlertThreshold.toLocaleString()} alert threshold — keep an eye on spending.{' '}
            <Link to="/reports">Review expense report →</Link>
          </div>
          {role === 'admin' && (
            <button className="btn btn-secondary btn-sm" onClick={dismissExpenseAlert}>
              Dismiss
            </button>
          )}
        </div>
      )}

      <div className="page-header">
        <h1>Dashboard</h1>
        <p>Approved totals for the current month, live from the website database.</p>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="label">Income this month</div>
          <div className="value income">₹{monthIncome.toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="label">Expense this month</div>
          <div className="value expense">₹{monthExpense.toLocaleString()}</div>
        </div>
        <div className="stat-card">
          <div className="label">Net this month</div>
          <div className="value">
            ₹{(monthIncome - monthExpenseExcludingRent - buildingRentForMonth).toLocaleString()}
          </div>
          {buildingRentForMonth > 0 && (
            <span className="hint">Includes ₹{buildingRentForMonth.toLocaleString()} building rent</span>
          )}
        </div>
        <div className="stat-card">
          <div className="label">Expenses excl. Rent this month</div>
          <div
            className="value"
            style={
              monthExpenseExcludingRent > expenseAlertThreshold ? { color: 'var(--danger)' } : undefined
            }
          >
            ₹{monthExpenseExcludingRent.toLocaleString()}
          </div>
          <span className="hint">Target: stay under ₹{expenseAlertThreshold.toLocaleString()}</span>
        </div>
        <div className="stat-card">
          <div className="label">Occupancy</div>
          <div className="value">
            {totalOccupied}/{totalCapacity}
          </div>
        </div>
        <div className="stat-card">
          <div className="label">Vacant beds</div>
          <div className="value">{totalVacantBeds}</div>
          <Link to="/directory?tab=vacant" style={{ fontSize: 12 }}>
            View vacant rooms →
          </Link>
        </div>
        <div className="stat-card">
          <div className="label">Bookings not moved in</div>
          <div className="value">{pendingBookingsCount}</div>
          <Link to="/bookings" style={{ fontSize: 12 }}>
            View bookings →
          </Link>
        </div>
        <div className="stat-card">
          <div className="label">Pending enquiries</div>
          <div className="value">{pendingEnquiriesCount}</div>
          <Link to="/directory?tab=enquiries" style={{ fontSize: 12 }}>
            View enquiries →
          </Link>
        </div>
        <div
          className="stat-card"
          onClick={() => setShowTodaysCollections((v) => !v)}
          style={{ cursor: 'pointer' }}
        >
          <div className="label">Today's Collections</div>
          <div className="value">{todaysCollections.length}</div>
          <span style={{ fontSize: 12 }}>
            {showTodaysCollections ? 'Hide list ↑' : 'Due in next 3 days →'}
          </span>
        </div>
      </div>

      {showTodaysCollections && (
        <div className="card table-scroll">
          <div className="page-header" style={{ marginBottom: 12 }}>
            <h1 style={{ fontSize: 16 }}>Hostel Fee Overdue Alarms and Friendly Reminders</h1>
            <p>
              Next due between today and {toLocalISODate(new Date(Date.now() + 3 * 86400000))}, or
              already owing more than a full month's rent — follow up for collection.
            </p>
          </div>
          {todaysCollections.length === 0 ? (
            <div className="empty-state">Nobody with an outstanding balance is due in this window.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Flag</th>
                  <th>Next due</th>
                  <th>Name</th>
                  <th>Room</th>
                  <th>Bed</th>
                  <th>Rent</th>
                  <th>Balance</th>
                  <th>Min. amount to pay</th>
                  <th>Mobile</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {todaysCollections.map(({ resident: r, due, flag, action, overdueDays, minDue }) => {
                  const flagColors: Record<string, { bg: string; text: string; dot: string }> = {
                    red: { bg: 'var(--danger-bg)', text: 'var(--danger)', dot: '🔴' },
                    orange: { bg: '#fff4e5', text: '#c2660c', dot: '🟠' },
                    yellow: { bg: '#fff9db', text: '#8a6d00', dot: '🟡' },
                    green: { bg: '#f0fdf4', text: '#16a34a', dot: '🟢' },
                    darkgreen: { bg: '#dcfce7', text: '#166534', dot: '🟢' }
                  }
                  const c = flagColors[flag]
                  return (
                    <tr key={r.id} style={{ background: c.bg }}>
                      <td>{c.dot}</td>
                      <td>{due}</td>
                      <td>{r.name}</td>
                      <td>{r.roomNum}</td>
                      <td>{r.bedNum ?? '—'}</td>
                      <td>{r.rentAmount ? `₹${r.rentAmount}` : '—'}</td>
                      <td>{r.balanceAmount ? `₹${r.balanceAmount}` : '—'}</td>
                      <td style={{ fontWeight: 600 }}>
                        {/* Reminders (dark green): next month's rent, not yet due.
                            Alarms (green/yellow/orange/red): full rent if last
                            month was fully unpaid, or just the remaining
                            partial amount if some of it was already paid. */}
                        {minDue ? `₹${minDue}` : '—'}
                      </td>
                      <td>{r.mobileNumber || '—'}</td>
                      <td style={{ color: c.text, fontWeight: 600 }}>
                        {action}
                        {overdueDays > 0 && ` (${overdueDays}d)`}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="page-header" style={{ marginBottom: 0 }}>
            <h1 style={{ fontSize: 16 }}>Vacancies by sharing type</h1>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowVacancies(!showVacancies)}>
            {showVacancies ? 'Hide vacancies' : 'Show vacancies'}
          </button>
        </div>

        <div className="stat-grid" style={{ marginTop: 16, marginBottom: 0 }}>
          {vacancyBySharing.length === 0 ? (
            <div className="empty-state">No vacant beds right now.</div>
          ) : (
            vacancyBySharing.map((group) => (
              <div className="stat-card" key={group.capacity}>
                <div className="label">{group.capacity}-sharing</div>
                <div className="value">{group.totalVacantBeds}</div>
                <span className="hint">
                  vacant bed{group.totalVacantBeds === 1 ? '' : 's'} across {group.rooms.length} room
                  {group.rooms.length === 1 ? '' : 's'}
                </span>
              </div>
            ))
          )}
          {totalReservedByBookings > 0 && (
            <div className="stat-card">
              <div className="label">Booked beds</div>
              <div className="value">{totalReservedByBookings}</div>
              <span className="hint">
                advance paid, not yet moved in — {totalReservedByBookings} bed
                {totalReservedByBookings === 1 ? '' : 's'} reserved
              </span>
            </div>
          )}
        </div>

        {showVacancies && vacancyBySharing.length > 0 && (
          <div style={{ marginTop: 20 }}>
            {vacancyBySharing.map((group) => (
              <div key={group.capacity} style={{ marginBottom: 20 }}>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>
                  {group.capacity}-sharing
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))',
                    gap: 12
                  }}
                >
                  {group.rooms.map(({ room, allBeds }) => (
                    <div
                      key={room.id}
                      style={{
                        border: '1px solid var(--border)',
                        borderRadius: 12,
                        padding: 10
                      }}
                    >
                      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>
                        Room {room.roomNum}
                      </div>
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                          gap: 6
                        }}
                      >
                        {allBeds.map(({ bedNum, status }) => {
                          const color =
                            status === 'occupied'
                              ? 'var(--danger)'
                              : status === 'reserved'
                                ? 'var(--warning)'
                                : 'var(--success)'
                          const bg =
                            status === 'occupied'
                              ? 'var(--danger-bg)'
                              : status === 'reserved'
                                ? 'var(--warning-bg)'
                                : 'var(--success-bg)'
                          const iconFilter =
                            status === 'occupied'
                              ? 'sepia(1) saturate(8) hue-rotate(310deg) brightness(0.9)'
                              : status === 'reserved'
                                ? 'sepia(1) saturate(6) hue-rotate(10deg) brightness(1)'
                                : 'sepia(1) saturate(8) hue-rotate(80deg) brightness(0.9)'
                          return (
                            <div
                              key={bedNum}
                              style={{
                                background: bg,
                                border: `1px solid ${color}`,
                                borderRadius: 8,
                                padding: '4px 2px',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: 2,
                                minWidth: 0
                              }}
                            >
                              <img
                                src={bedIcon}
                                alt="bed"
                                style={{
                                  width: '100%',
                                  maxWidth: 40,
                                  height: 28,
                                  objectFit: 'contain',
                                  filter: iconFilter
                                }}
                              />
                              <span
                                style={{
                                  fontSize: 10,
                                  fontWeight: 700,
                                  color,
                                  whiteSpace: 'nowrap'
                                }}
                              >
                                {status === 'reserved' ? 'Booked' : `Bed ${bedNum}`}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {isMonthEndReminderDay() && (
        <div className="card" style={{ borderColor: 'var(--warning)' }}>
          The month is almost over — make sure this month's recurring bills are logged.{' '}
          <Link to="/checklist">Review checklist →</Link>
        </div>
      )}

      {pendingCount > 0 && (
        <div className="card" style={{ borderColor: 'var(--warning)' }}>
          <strong>{pendingCount}</strong> entr{pendingCount === 1 ? 'y' : 'ies'} waiting for
          approval. <Link to="/approvals">Review now →</Link>
        </div>
      )}
    </>
  )
}
