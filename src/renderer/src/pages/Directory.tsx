import { useMemo, useState } from 'react'
import { doc, setDoc, updateDoc } from 'firebase/firestore'
import { useSearchParams } from 'react-router-dom'
import { db } from '../lib/firebase'
import { useCollection } from '../hooks/useCollection'
import { Booking, WebsiteEmployee, WebsiteEnquiry, WebsiteResident, WebsiteRoom } from '../lib/types'
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

  function refreshAll(): void {
    refetchResidents()
    refetchRooms()
    refetchEmployees()
    refetchBookings()
    refetchEnquiries()
    showToast('Refreshed from database')
  }

  const requestedTab = searchParams.get('tab')
  const initialTab = VALID_TABS.includes(requestedTab as Tab) ? (requestedTab as Tab) : 'residents'
  const [tab, setTab] = useState<Tab>(initialTab)
  const [search, setSearch] = useState('')
  const [showContacted, setShowContacted] = useState(false)

  const sortedRooms = useMemo(
    () => [...rooms].sort((a, b) => Number(a.roomNum) - Number(b.roomNum)),
    [rooms]
  )

  const filteredResidents = useMemo(() => {
    const q = search.trim().toLowerCase()
    return residents
      .filter(
        (r) =>
          !q ||
          r.name?.toLowerCase().includes(q) ||
          r.roomNum?.includes(q) ||
          r.mobileNumber?.includes(q)
      )
      .sort((a, b) => Number(a.roomNum) - Number(b.roomNum))
  }, [residents, search])

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
        const vacantBedNums = Array.from({ length: room.capacity }, (_, i) => i + 1).filter(
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
            <option value="employees">Employees</option>
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

      <div className="card table-scroll">
        {tab === 'residents' &&
          (residentsLoading ? (
            <div className="empty-state">Loading…</div>
          ) : filteredResidents.length === 0 ? (
            <div className="empty-state">No residents match this search.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Room</th>
                  <th>Bed</th>
                  <th>Mobile</th>
                  <th>Joining date</th>
                  <th>Rent</th>
                  <th>Balance</th>
                </tr>
              </thead>
              <tbody>
                {filteredResidents.map((r) => (
                  <tr key={r.id}>
                    <td>{r.name}</td>
                    <td>{r.roomNum}</td>
                    <td>{r.bedNum ?? '—'}</td>
                    <td>{r.mobileNumber || '—'}</td>
                    <td>{r.joiningDate || '—'}</td>
                    <td>{r.rentAmount ? `₹${r.rentAmount}` : '—'}</td>
                    <td>{r.balanceAmount ? `₹${r.balanceAmount}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
                  <th>Floor</th>
                  <th>Occupied</th>
                  <th>Capacity</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredRooms.map((r) => (
                  <tr key={r.id}>
                    <td>{r.roomNum}</td>
                    <td>{r.floor}</td>
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
                  <th>Floor</th>
                  <th>Capacity</th>
                  <th>Occupied</th>
                  <th>Vacant beds</th>
                </tr>
              </thead>
              <tbody>
                {filteredVacantRooms.map(({ room, vacantBedNums }) => (
                  <tr key={room.id}>
                    <td>{room.roomNum}</td>
                    <td>{room.floor}</td>
                    <td>{room.capacity}</td>
                    <td>{room.capacity - vacantBedNums.length}</td>
                    <td>{vacantBedNums.map((b) => `Bed ${b}`).join(', ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}

        {tab === 'employees' &&
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
