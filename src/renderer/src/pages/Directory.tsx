import { useMemo, useState } from 'react'
import { doc, setDoc, updateDoc } from 'firebase/firestore'
import { useSearchParams } from 'react-router-dom'
import { db } from '../lib/firebase'
import { useCollection } from '../hooks/useCollection'
import {
  Booking,
  WebsiteEmployee,
  WebsiteEnquiry,
  WebsiteIncomingPayment,
  WebsiteResident,
  WebsiteRoom
} from '../lib/types'
import { calculateResidentBalance, nextDueDate } from '../lib/rentCalc'
import { showToast } from '../lib/toast'
import { useAuth } from '../lib/auth'

type Tab = 'residents' | 'bookings' | 'rooms' | 'vacant' | 'employees' | 'enquiries'
const VALID_TABS: Tab[] = ['residents', 'bookings', 'rooms', 'vacant', 'employees', 'enquiries']

export default function Directory(): React.JSX.Element {
  const { role } = useAuth()
  const [searchParams] = useSearchParams()
  const {
    data: residents,
    loading: residentsLoading,
    refetch: refetchResidents
  } = useCollection<WebsiteResident>('residents')
  const {
    data: rooms,
    loading: roomsLoading,
    refetch: refetchRooms
  } = useCollection<WebsiteRoom>('rooms')
  const {
    data: employees,
    loading: employeesLoading,
    refetch: refetchEmployees
  } = useCollection<WebsiteEmployee>('employees')
  const {
    data: bookings,
    loading: bookingsLoading,
    refetch: refetchBookings
  } = useCollection<Booking>('bookings')
  const {
    data: enquiries,
    loading: enquiriesLoading,
    refetch: refetchEnquiries
  } = useCollection<WebsiteEnquiry>('enquiries')
  const { data: incomingPayments } = useCollection<WebsiteIncomingPayment>('incomingPayments')
  const [recalculating, setRecalculating] = useState(false)

  function refreshAll(): void {
    refetchResidents()
    refetchRooms()
    refetchEmployees()
    refetchBookings()
    refetchEnquiries()
    showToast('Refreshed from database')
  }

  const requestedTab = searchParams.get('tab')
  let initialTab = VALID_TABS.includes(requestedTab as Tab) ? (requestedTab as Tab) : 'residents'
  if (initialTab === 'employees' && role !== 'admin') initialTab = 'residents'
  const [tab, setTab] = useState<Tab>(initialTab)
  const [search, setSearch] = useState('')
  const [showContacted, setShowContacted] = useState(false)
  const [showAllResidents, setShowAllResidents] = useState(false)
  const [showSalaryTotal, setShowSalaryTotal] = useState(false)
  const [showEstimatedIncome, setShowEstimatedIncome] = useState(false)

  const sortedRooms = useMemo(
    () => [...rooms].sort((a, b) => Number(a.roomNum) - Number(b.roomNum)),
    [rooms]
  )

  const filteredResidents = useMemo(() => {
    const q = search.trim().toLowerCase()
    return residents
      .filter((r) => showAllResidents || (r.balanceAmount || 0) > 0)
      .filter(
        (r) =>
          !q ||
          r.name?.toLowerCase().includes(q) ||
          r.roomNum?.includes(q) ||
          r.mobileNumber?.includes(q)
      )
      .sort((a, b) => Number(a.roomNum) - Number(b.roomNum))
  }, [residents, search, showAllResidents])

  // Always across every resident with a balance, independent of the
  // search box / "show all" toggle — a stable running total.
  const residentsWithBalance = useMemo(
    () => residents.filter((r) => (r.balanceAmount || 0) > 0),
    [residents]
  )
  const totalOutstandingBalance = residentsWithBalance.reduce(
    (sum, r) => sum + (r.balanceAmount || 0),
    0
  )

  // Estimated monthly rent income from currently occupied beds only — each
  // active resident's rentAmount already reflects their room type's rent.
  const estimatedIncomeByType = useMemo(() => {
    const roomCapacityByNum = new Map(rooms.map((r) => [r.roomNum, r.capacity || 6]))
    const groups = new Map<number, { count: number; total: number }>()
    residents.forEach((r) => {
      const capacity = roomCapacityByNum.get(r.roomNum) || 6
      const g = groups.get(capacity) || { count: 0, total: 0 }
      g.count += 1
      g.total += r.rentAmount || 0
      groups.set(capacity, g)
    })
    return Array.from(groups.entries())
      .map(([capacity, g]) => ({ capacity, ...g }))
      .sort((a, b) => a.capacity - b.capacity)
  }, [residents, rooms])
  const estimatedIncomeTotal = estimatedIncomeByType.reduce((sum, g) => sum + g.total, 0)
  const estimatedIncomeOccupiedBeds = estimatedIncomeByType.reduce((sum, g) => sum + g.count, 0)

  const pendingBookings = useMemo(
    () =>
      bookings
        .filter((b) => b.status === 'pending')
        .sort((a, b) => a.expectedJoiningDate.localeCompare(b.expectedJoiningDate)),
    [bookings]
  )

  const filteredBookings = useMemo(() => {
    const q = search.trim().toLowerCase()
    return pendingBookings.filter(
      (b) =>
        !q ||
        b.name?.toLowerCase().includes(q) ||
        b.roomNum?.includes(q) ||
        b.mobileNumber?.includes(q)
    )
  }, [pendingBookings, search])

  const filteredRooms = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return sortedRooms
    return sortedRooms.filter((r) => r.roomNum.includes(q))
  }, [sortedRooms, search])

  const vacantRooms = useMemo(() => {
    return sortedRooms
      .map((room) => {
        const occupiedBeds = new Set(
          residents.filter((r) => r.roomNum === room.roomNum).map((r) => r.bedNum)
        )
        const reservedBeds = new Set(
          pendingBookings.filter((b) => b.roomNum === room.roomNum).map((b) => b.bedNum)
        )
        const vacantBedNums = Array.from({ length: room.capacity || 6 }, (_, i) => i + 1).filter(
          (b) => !occupiedBeds.has(b) && !reservedBeds.has(b)
        )
        return { room, vacantBedNums }
      })
      .filter(({ vacantBedNums }) => vacantBedNums.length > 0)
  }, [sortedRooms, residents])

  const filteredVacantRooms = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return vacantRooms
    return vacantRooms.filter(({ room }) => room.roomNum.includes(q))
  }, [vacantRooms, search])

  const filteredEmployees = useMemo(() => {
    const q = search.trim().toLowerCase()
    return employees
      .filter(
        (e) =>
          !q ||
          e.name?.toLowerCase().includes(q) ||
          e.role?.toLowerCase().includes(q) ||
          e.mobileNumber?.includes(q)
      )
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [employees, search])

  // Net salary still owed (salary minus any advance already taken this
  // month), across active employees only.
  const totalSalariesToPay = employees
    .filter((e) => e.status === 'active')
    .reduce((sum, e) => sum + Math.max(0, (e.salary || 0) - (e.advanceAmount || 0)), 0)

  const filteredEnquiries = useMemo(() => {
    const q = search.trim().toLowerCase()
    return enquiries
      .filter(
        (e) =>
          e.status === 'Pending' ||
          e.status === 'Elapsed' ||
          (showContacted && e.status === 'Contacted')
      )
      .filter(
        (e) =>
          !q ||
          e.name?.toLowerCase().includes(q) ||
          e.email?.toLowerCase().includes(q) ||
          e.phone?.includes(q)
      )
      .sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : -1))
  }, [enquiries, search, showContacted])

  async function changeCapacity(roomNum: string, newCapacity: number): Promise<void> {
    try {
      await setDoc(doc(db, 'rooms', roomNum), { capacity: newCapacity }, { merge: true })
      showToast(`Room ${roomNum} capacity set to ${newCapacity}`)
    } catch (err) {
      console.error(err)
      showToast('Failed to update capacity: ' + (err as Error).message, 'error')
    }
  }

  // Recomputes every resident's balanceAmount from scratch (months elapsed
  // since joining x rent, minus rent actually paid — same formula used on
  // income approval) — fixes drift from historical data corrections.
  async function recalculateBalances(): Promise<void> {
    setRecalculating(true)
    try {
      let updated = 0
      for (const r of residents) {
        if (!r.joiningDate) continue
        const priorPaid = incomingPayments
          .filter(
            (p) =>
              p.roomNum === r.roomNum &&
              p.bedNum === r.bedNum &&
              p.paymentType === 'Hostel Resident Monthly'
          )
          .reduce((sum, p) => sum + (p.amount || 0), 0)
        const correctBalance = calculateResidentBalance(r.rentAmount || 0, r.joiningDate, priorPaid)
        if (correctBalance !== (r.balanceAmount || 0)) {
          await updateDoc(doc(db, 'residents', r.id), { balanceAmount: correctBalance })
          updated++
        }
      }
      showToast(
        updated > 0 ? `Recalculated ${updated} resident balance${updated === 1 ? '' : 's'}` : 'All balances already correct'
      )
    } catch (err) {
      console.error(err)
      showToast('Failed to recalculate balances: ' + (err as Error).message, 'error')
    } finally {
      setRecalculating(false)
    }
  }

  async function changeEnquiryStatus(
    enquiryId: string,
    status: WebsiteEnquiry['status']
  ): Promise<void> {
    try {
      await updateDoc(doc(db, 'enquiries', enquiryId), { status })
      showToast('Enquiry status updated')
    } catch (err) {
      console.error(err)
      showToast('Failed to update status: ' + (err as Error).message, 'error')
    }
  }

  return (
    <>
      <div className="page-header">
        <h1>Directory</h1>
        <p>Live lookup from the website database — residents, rooms, and employees.</p>
      </div>

      <div className="filter-bar card">
        <div className="form-field">
          <label>View</label>
          <select value={tab} onChange={(e) => setTab(e.target.value as Tab)}>
            <option value="residents">Residents</option>
            <option value="bookings">Bookings (not moved in)</option>
            <option value="rooms">Rooms</option>
            <option value="vacant">Vacant rooms</option>
            {role === 'admin' && <option value="employees">Employees</option>}
            <option value="enquiries">Enquiries</option>
          </select>
        </div>
        <div className="form-field" style={{ flex: 1 }}>
          <label>Search</label>
          <input
            placeholder={tab === 'rooms' || tab === 'vacant' ? 'Room number…' : 'Name, role, mobile…'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {tab === 'residents' && (
          <button className="btn btn-secondary" onClick={() => setShowAllResidents(!showAllResidents)}>
            {showAllResidents ? 'Show only pending balance' : 'Show all residents'}
          </button>
        )}
        {tab === 'residents' && (
          <button
            className="btn btn-secondary"
            onClick={recalculateBalances}
            disabled={recalculating}
          >
            {recalculating ? 'Recalculating…' : 'Recalculate balances'}
          </button>
        )}
        {tab === 'residents' && (
          <button
            className="btn btn-secondary"
            onClick={() => setShowEstimatedIncome(!showEstimatedIncome)}
          >
            {showEstimatedIncome ? 'Hide estimated income' : 'Show estimated income'}
          </button>
        )}
        {tab === 'employees' && role === 'admin' && (
          <button className="btn btn-secondary" onClick={() => setShowSalaryTotal(!showSalaryTotal)}>
            {showSalaryTotal ? 'Hide salaries total' : 'Show salaries total'}
          </button>
        )}
        {tab === 'enquiries' && (
          <button
            className="btn btn-secondary"
            onClick={() => setShowContacted(!showContacted)}
          >
            {showContacted ? 'Hide contacted' : 'Show contacted too'}
          </button>
        )}
        <button
          className="btn btn-secondary"
          onClick={refreshAll}
          disabled={
            residentsLoading || roomsLoading || employeesLoading || bookingsLoading || enquiriesLoading
          }
        >
          Refresh
        </button>
      </div>

      {tab === 'residents' && residentsWithBalance.length > 0 && (
        <div className="card" style={{ borderColor: 'var(--danger)' }}>
          ⚠ <strong>{residentsWithBalance.length}</strong> resident
          {residentsWithBalance.length === 1 ? '' : 's'} owe a total of{' '}
          <strong>₹{totalOutstandingBalance.toLocaleString()}</strong> in outstanding rent balance.
        </div>
      )}

      {tab === 'residents' && showEstimatedIncome && (
        <div className="card" style={{ borderColor: 'var(--success)' }}>
          <div style={{ marginBottom: estimatedIncomeByType.length > 0 ? 10 : 0 }}>
            Estimated monthly rent income from <strong>{estimatedIncomeOccupiedBeds}</strong>{' '}
            occupied bed{estimatedIncomeOccupiedBeds === 1 ? '' : 's'}:{' '}
            <strong>₹{estimatedIncomeTotal.toLocaleString()}</strong>
          </div>
          {estimatedIncomeByType.map((g) => (
            <div key={g.capacity} style={{ fontSize: 13, color: 'var(--text-muted)' }}>
              {g.capacity}-sharing: {g.count} bed{g.count === 1 ? '' : 's'} × avg ₹
              {Math.round(g.total / g.count).toLocaleString()} = ₹{g.total.toLocaleString()}
            </div>
          ))}
        </div>
      )}

      {tab === 'employees' && role === 'admin' && showSalaryTotal && (
        <div className="card" style={{ borderColor: 'var(--warning)' }}>
          Total salaries to be paid (active employees, net of any advance already taken):{' '}
          <strong>₹{totalSalariesToPay.toLocaleString()}</strong>
        </div>
      )}

      <div className="card table-scroll">
        {tab === 'residents' &&
          (residentsLoading ? (
            <div className="empty-state">Loading…</div>
          ) : filteredResidents.length === 0 ? (
            <div className="empty-state">
              {showAllResidents
                ? 'No residents match this search.'
                : 'No residents with a pending balance match this search.'}
            </div>
          ) : (
            (() => {
              const byRoom = new Map<string, typeof filteredResidents>()
              filteredResidents.forEach((r) => {
                const key = r.roomNum || 'Unassigned'
                byRoom.set(key, [...(byRoom.get(key) || []), r])
              })
              const groups = Array.from(byRoom.entries()).sort(([a], [b]) => {
                const an = Number(a)
                const bn = Number(b)
                if (isNaN(an) || isNaN(bn)) return a.localeCompare(b)
                return an - bn
              })

              return groups.map(([roomNum, rows]) => (
                <div key={roomNum} style={{ marginBottom: 18 }}>
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
                    <span>Room {roomNum}</span>
                    <span>
                      {rows.length} resident{rows.length === 1 ? '' : 's'}
                    </span>
                  </div>
                  <table>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Bed</th>
                        <th>Mobile</th>
                        <th>Joining date</th>
                        <th>Rent</th>
                        <th>Balance</th>
                        <th>Next due</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.id}>
                          <td>{r.name}</td>
                          <td>{r.bedNum ?? '—'}</td>
                          <td>{r.mobileNumber || '—'}</td>
                          <td>{r.joiningDate || '—'}</td>
                          <td>{r.rentAmount ? `₹${r.rentAmount}` : '—'}</td>
                          <td>{r.balanceAmount ? `₹${r.balanceAmount}` : '—'}</td>
                          <td>{r.joiningDate ? nextDueDate(r.joiningDate) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))
            })()
          ))}

        {tab === 'bookings' &&
          (bookingsLoading ? (
            <div className="empty-state">Loading…</div>
          ) : filteredBookings.length === 0 ? (
            <div className="empty-state">
              Nobody booked and waiting to move in. Admins can add a booking from the Bookings
              page.
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Room</th>
                  <th>Bed</th>
                  <th>Mobile</th>
                  <th>Expected joining</th>
                  <th>Advance paid</th>
                  <th>Rent</th>
                </tr>
              </thead>
              <tbody>
                {filteredBookings.map((b) => (
                  <tr key={b.id}>
                    <td>{b.name}</td>
                    <td>{b.roomNum || '—'}</td>
                    <td>{b.bedNum ?? '—'}</td>
                    <td>{b.mobileNumber || '—'}</td>
                    <td>{b.expectedJoiningDate}</td>
                    <td>{b.advanceAmount ? `₹${b.advanceAmount}` : '—'}</td>
                    <td>{b.rentAmount ? `₹${b.rentAmount}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}

        {tab === 'rooms' &&
          (roomsLoading ? (
            <div className="empty-state">Loading…</div>
          ) : filteredRooms.length === 0 ? (
            <div className="empty-state">No rooms match this search.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Room</th>
                  <th>Occupied</th>
                  <th>Capacity</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredRooms.map((r) => (
                  <tr key={r.id}>
                    <td>{r.roomNum}</td>
                    <td>{r.occupiedCount}</td>
                    <td>
                      {role === 'admin' ? (
                        <select
                          value={r.capacity}
                          onChange={(e) => changeCapacity(r.roomNum, Number(e.target.value))}
                        >
                          {[1, 2, 3, 4, 5, 6].map((n) => (
                            <option key={n} value={n}>
                              {n}
                            </option>
                          ))}
                        </select>
                      ) : (
                        r.capacity
                      )}
                    </td>
                    <td>{r.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}

        {tab === 'vacant' &&
          (roomsLoading ? (
            <div className="empty-state">Loading…</div>
          ) : filteredVacantRooms.length === 0 ? (
            <div className="empty-state">No vacant beds right now.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Room</th>
                  <th>Capacity</th>
                  <th>Occupied</th>
                  <th>Vacant beds</th>
                </tr>
              </thead>
              <tbody>
                {filteredVacantRooms.map(({ room, vacantBedNums }) => (
                  <tr key={room.id}>
                    <td>{room.roomNum}</td>
                    <td>{room.capacity || 6}</td>
                    <td>{(room.capacity || 6) - vacantBedNums.length}</td>
                    <td>{vacantBedNums.map((b) => `Bed ${b}`).join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}

        {tab === 'employees' &&
          role === 'admin' &&
          (employeesLoading ? (
            <div className="empty-state">Loading…</div>
          ) : filteredEmployees.length === 0 ? (
            <div className="empty-state">No employees match this search.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Type</th>
                  <th>Mobile</th>
                  <th>Status</th>
                  <th>Joining date</th>
                  <th>Salary</th>
                  <th>Advance (this month)</th>
                  <th>To pay</th>
                </tr>
              </thead>
              <tbody>
                {filteredEmployees.map((e) => (
                  <tr key={e.id} style={{ opacity: e.status === 'inactive' ? 0.55 : 1 }}>
                    <td>{e.name}</td>
                    <td>{e.role}</td>
                    <td>{e.employmentType}</td>
                    <td>{e.mobileNumber || '—'}</td>
                    <td>{e.status}</td>
                    <td>{e.joiningDate || '—'}</td>
                    <td>{e.salary ? `₹${e.salary}` : '—'}</td>
                    <td>{e.advanceAmount ? `₹${e.advanceAmount}` : '—'}</td>
                    <td>₹{Math.max(0, (e.salary || 0) - (e.advanceAmount || 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}

        {tab === 'enquiries' &&
          (enquiriesLoading ? (
            <div className="empty-state">Loading…</div>
          ) : filteredEnquiries.length === 0 ? (
            <div className="empty-state">No enquiries match this search.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>College/Company</th>
                  <th>Expected joining</th>
                  <th>Sharing interest</th>
                  <th>Submitted</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredEnquiries.map((en) => (
                  <tr key={en.id}>
                    <td>{en.name}</td>
                    <td>{en.email || '—'}</td>
                    <td>{en.phone || '—'}</td>
                    <td>{en.companyCollege || '—'}</td>
                    <td>{en.expectedJoiningDate || '—'}</td>
                    <td>{en.sharingInterest}</td>
                    <td>{en.submittedAt ? new Date(en.submittedAt).toLocaleDateString() : '—'}</td>
                    <td>
                      {role === 'admin' ? (
                        <select
                          value={en.status}
                          onChange={(e) =>
                            changeEnquiryStatus(en.id, e.target.value as WebsiteEnquiry['status'])
                          }
                        >
                          {(['Pending', 'Contacted', 'Elapsed', 'Closed'] as const).map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      ) : (
                        en.status
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
      </div>
    </>
  )
}
