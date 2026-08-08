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

function currentMonthPrefix(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
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

  const totalCapacity = rooms.reduce((sum, r) => sum + (r.capacity || 0), 0)
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
      const vacantBedNums = Array.from({ length: room.capacity }, (_, i) => i + 1).filter(
        (b) => !occupiedBeds.has(b) && !reservedBeds.has(b)
      )
      const allBeds = Array.from({ length: room.capacity }, (_, i) => i + 1).map((b) => ({
        bedNum: b,
        occupied: occupiedBeds.has(b) || reservedBeds.has(b)
      }))
      return { room, vacantBedNums, allBeds }
    })

    const groups = new Map<number, { totalVacantBeds: number; rooms: typeof roomsWithVacantBeds }>()
    for (const entry of roomsWithVacantBeds) {
      if (entry.vacantBedNums.length === 0) continue
      const capacity = entry.room.capacity
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
          <div className="value">₹{(monthIncome - monthExpense).toLocaleString()}</div>
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
      </div>

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
                        {allBeds.map(({ bedNum, occupied }) => (
                          <div
                            key={bedNum}
                            style={{
                              background: occupied ? 'var(--danger-bg)' : 'var(--success-bg)',
                              border: `1px solid ${occupied ? 'var(--danger)' : 'var(--success)'}`,
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
                                filter: occupied
                                  ? 'sepia(1) saturate(8) hue-rotate(310deg) brightness(0.9)'
                                  : 'sepia(0.3) saturate(1.5) hue-rotate(80deg) brightness(1.05)'
                              }}
                            />
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                color: occupied ? 'var(--danger)' : 'var(--success)',
                                whiteSpace: 'nowrap'
                              }}
                            >
                              Bed {bedNum}
                            </span>
                          </div>
                        ))}
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
