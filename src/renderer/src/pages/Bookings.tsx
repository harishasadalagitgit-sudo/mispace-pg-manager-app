import { FormEvent, useMemo, useState } from 'react'
import { addDoc, collection, doc, updateDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useCollection } from '../hooks/useCollection'
import { Booking, EditableBookingFields, WebsiteResident, WebsiteRoom } from '../lib/types'
import { calculateResidentBalance } from '../lib/rentCalc'
import { recalculateRoomOccupancy } from '../lib/occupancy'
import { getCurrentUserName } from '../lib/session'
import { showToast } from '../lib/toast'
import { useAuth } from '../lib/auth'

function todayISODate(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`
}

const EMPTY_FORM: EditableBookingFields = {
  name: '',
  mobileNumber: '',
  roomNum: '',
  bedNum: null,
  expectedJoiningDate: '',
  advanceAmount: 0,
  rentAmount: 0,
  notes: ''
}

export default function Bookings(): React.JSX.Element {
  const { role } = useAuth()
  const { data: bookings, refetch: refetchBookings } = useCollection<Booking>('bookings')
  const { data: rooms } = useCollection<WebsiteRoom>('rooms')
  const { data: residents } = useCollection<WebsiteResident>('residents')

  const sortedRooms = useMemo(
    () => [...rooms].sort((a, b) => Number(a.roomNum) - Number(b.roomNum)),
    [rooms]
  )

  const [search, setSearch] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<EditableBookingFields>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [convertingId, setConvertingId] = useState<string | null>(null)
  const [convertRoomNum, setConvertRoomNum] = useState('')
  const [convertBedNum, setConvertBedNum] = useState<number | null>(null)
  const [convertJoiningDate, setConvertJoiningDate] = useState('')
  const [converting, setConverting] = useState(false)

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

  function vacantBedsFor(roomNum: string, excludeBookingId?: string): number[] {
    const room = sortedRooms.find((r) => r.roomNum === roomNum)
    if (!room) return []
    const occupiedByResidents = new Set(
      residents.filter((r) => r.roomNum === roomNum).map((r) => r.bedNum)
    )
    const heldByBookings = new Set(
      pendingBookings
        .filter((b) => b.roomNum === roomNum && b.id !== excludeBookingId)
        .map((b) => b.bedNum)
    )
    return Array.from({ length: room.capacity }, (_, i) => i + 1).filter(
      (b) => !occupiedByResidents.has(b) && !heldByBookings.has(b)
    )
  }

  const formRoom = sortedRooms.find((r) => r.roomNum === form.roomNum)
  const formVacantBeds = form.roomNum ? vacantBedsFor(form.roomNum, editingId || undefined) : []

  function openAdd(): void {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setIsOpen(true)
  }

  function openEdit(booking: Booking): void {
    setEditingId(booking.id)
    setForm({
      name: booking.name,
      mobileNumber: booking.mobileNumber,
      roomNum: booking.roomNum || '',
      bedNum: booking.bedNum ?? null,
      expectedJoiningDate: booking.expectedJoiningDate,
      advanceAmount: booking.advanceAmount || 0,
      rentAmount: booking.rentAmount || 0,
      notes: booking.notes || ''
    })
    setIsOpen(true)
  }

  function closeForm(): void {
    setIsOpen(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
  }

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault()
    if (!form.name || !form.mobileNumber || !form.expectedJoiningDate) {
      showToast('Name, mobile number and expected joining date are required', 'error')
      return
    }
    if (form.roomNum && form.bedNum) {
      const vacant = vacantBedsFor(form.roomNum, editingId || undefined)
      if (!vacant.includes(form.bedNum)) {
        showToast(`Bed ${form.bedNum} in Room ${form.roomNum} is not available`, 'error')
        return
      }
    }

    setSaving(true)
    try {
      const entry = {
        name: form.name,
        mobileNumber: form.mobileNumber,
        roomNum: form.roomNum || undefined,
        bedNum: form.bedNum || undefined,
        expectedJoiningDate: form.expectedJoiningDate,
        advanceAmount: Number(form.advanceAmount) || 0,
        rentAmount: Number(form.rentAmount) || 0,
        notes: form.notes || ''
      }
      if (editingId) {
        await updateDoc(doc(db, 'bookings', editingId), entry)
        showToast('Booking updated')
      } else {
        await addDoc(collection(db, 'bookings'), {
          ...entry,
          bookedBy: getCurrentUserName() || 'Unknown',
          bookedAt: new Date().toISOString(),
          status: 'pending'
        } as Omit<Booking, 'id'>)
        showToast('Booking added')
      }
      closeForm()
    } catch (err) {
      console.error(err)
      showToast('Failed to save booking: ' + (err as Error).message, 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleCancel(booking: Booking): Promise<void> {
    if (!window.confirm(`Cancel the booking for ${booking.name}?`)) return
    try {
      await updateDoc(doc(db, 'bookings', booking.id), { status: 'cancelled' })
      showToast('Booking cancelled')
    } catch (err) {
      console.error(err)
      showToast('Failed to cancel: ' + (err as Error).message, 'error')
    }
  }

  function openConvert(booking: Booking): void {
    setConvertingId(booking.id)
    setConvertRoomNum(booking.roomNum || '')
    setConvertBedNum(booking.bedNum ?? null)
    setConvertJoiningDate(todayISODate())
  }

  function closeConvert(): void {
    setConvertingId(null)
    setConvertRoomNum('')
    setConvertBedNum(null)
    setConvertJoiningDate('')
  }

  async function handleConvertSubmit(e: FormEvent, booking: Booking): Promise<void> {
    e.preventDefault()
    if (!convertRoomNum) {
      showToast('Select a room', 'error')
      return
    }
    const targetRoom = sortedRooms.find((r) => r.roomNum === convertRoomNum)
    if (!targetRoom) {
      showToast('This room does not exist', 'error')
      return
    }
    if (targetRoom.occupiedCount >= targetRoom.capacity) {
      showToast(
        `Room ${targetRoom.roomNum} is already at capacity (${targetRoom.capacity}/${targetRoom.capacity})`,
        'error'
      )
      return
    }
    if (convertBedNum) {
      const bedTaken = residents.find(
        (r) => r.roomNum === convertRoomNum && r.bedNum === convertBedNum
      )
      if (bedTaken) {
        showToast(`Bed ${convertBedNum} in Room ${convertRoomNum} is already taken by ${bedTaken.name}`, 'error')
        return
      }
    }

    setConverting(true)
    try {
      const joiningDate = convertJoiningDate || todayISODate()
      const balanceAmount = calculateResidentBalance(booking.rentAmount || 0, joiningDate, 0)
      await addDoc(collection(db, 'residents'), {
        name: booking.name,
        mobileNumber: booking.mobileNumber,
        whatsappNumber: booking.mobileNumber,
        roomNum: convertRoomNum,
        bedNum: convertBedNum || null,
        dob: '2000-01-01',
        joiningDate,
        balanceAmount,
        rentAmount: booking.rentAmount || 0,
        securityDeposit: booking.advanceAmount || 0,
        permanentAddress: '',
        currentWorkingCompanyOrCollege: '',
        parentsInformation: '',
        emergencyContact: '',
        specialNotes: booking.notes || ''
      })
      await updateDoc(doc(db, 'bookings', booking.id), { status: 'moved-in' })
      await recalculateRoomOccupancy(convertRoomNum)
      showToast(`${booking.name} moved in to Room ${convertRoomNum}${convertBedNum ? ` / Bed ${convertBedNum}` : ''}`)
      closeConvert()
    } catch (err) {
      console.error(err)
      showToast('Failed to move in: ' + (err as Error).message, 'error')
    } finally {
      setConverting(false)
    }
  }

  const convertingBooking = pendingBookings.find((b) => b.id === convertingId)
  const convertTargetRoom = sortedRooms.find((r) => r.roomNum === convertRoomNum)
  const convertVacantBeds = convertingBooking ? vacantBedsFor(convertRoomNum, convertingBooking.id) : []

  return (
    <>
      <div className="page-header">
        <h1>Bookings</h1>
        <p>People who paid an advance and reserved a room, but haven't moved in yet.</p>
      </div>

      <div className="filter-bar card">
        <div className="form-field" style={{ flex: 1 }}>
          <label>Search</label>
          <input
            placeholder="Name, room, mobile…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button className="btn btn-secondary" onClick={() => refetchBookings()}>
          Refresh
        </button>
        <button className="btn btn-primary" onClick={openAdd}>
          + Add booking
        </button>
      </div>

      {isOpen && (
        <form className="card" onSubmit={handleSubmit} style={{ borderColor: 'var(--primary)' }}>
          <div className="page-header" style={{ marginBottom: 12 }}>
            <h1 style={{ fontSize: 16 }}>{editingId ? 'Edit booking' : 'New booking'}</h1>
          </div>
          <div className="form-grid">
            <div className="form-field">
              <label>Name</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="form-field">
              <label>Mobile number</label>
              <input
                value={form.mobileNumber}
                onChange={(e) => setForm({ ...form, mobileNumber: e.target.value })}
                required
              />
            </div>

            <div className="form-field">
              <label>Room (optional)</label>
              <select
                value={form.roomNum}
                onChange={(e) => setForm({ ...form, roomNum: e.target.value, bedNum: null })}
              >
                <option value="">Not decided yet</option>
                {sortedRooms.map((r) => (
                  <option key={r.id} value={r.roomNum}>
                    {r.roomNum} ({r.occupiedCount}/{r.capacity} occupied)
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label>Bed (optional)</label>
              <select
                value={form.bedNum ?? ''}
                onChange={(e) => setForm({ ...form, bedNum: e.target.value ? Number(e.target.value) : null })}
                disabled={!formRoom}
              >
                <option value="">Not decided yet</option>
                {formVacantBeds.map((b) => (
                  <option key={b} value={b}>
                    Bed {b}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label>Expected joining date</label>
              <input
                type="date"
                value={form.expectedJoiningDate}
                onChange={(e) => setForm({ ...form, expectedJoiningDate: e.target.value })}
                required
              />
            </div>
            <div className="form-field">
              <label>Advance paid (₹)</label>
              <input
                type="number"
                value={form.advanceAmount}
                onChange={(e) => setForm({ ...form, advanceAmount: Number(e.target.value) })}
              />
            </div>
            <div className="form-field">
              <label>Agreed monthly rent (₹)</label>
              <input
                type="number"
                value={form.rentAmount}
                onChange={(e) => setForm({ ...form, rentAmount: Number(e.target.value) })}
              />
            </div>

            <div className="form-field full">
              <label>Notes</label>
              <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : editingId ? 'Save changes' : 'Add booking'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={closeForm}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {convertingBooking && (
        <form
          className="card"
          onSubmit={(e) => handleConvertSubmit(e, convertingBooking)}
          style={{ borderColor: 'var(--primary)' }}
        >
          <div className="page-header" style={{ marginBottom: 12 }}>
            <h1 style={{ fontSize: 16 }}>Move in {convertingBooking.name}</h1>
          </div>
          <div className="form-grid">
            <div className="form-field">
              <label>Room</label>
              <select
                value={convertRoomNum}
                onChange={(e) => {
                  setConvertRoomNum(e.target.value)
                  setConvertBedNum(null)
                }}
                required
              >
                <option value="">Select room</option>
                {sortedRooms.map((r) => (
                  <option key={r.id} value={r.roomNum}>
                    {r.roomNum} ({r.occupiedCount}/{r.capacity} occupied)
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label>Bed</label>
              <select
                value={convertBedNum ?? ''}
                onChange={(e) => setConvertBedNum(e.target.value ? Number(e.target.value) : null)}
                disabled={!convertTargetRoom}
              >
                <option value="">Unassigned</option>
                {convertVacantBeds.map((b) => (
                  <option key={b} value={b}>
                    Bed {b}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label>Actual joining date</label>
              <input
                type="date"
                value={convertJoiningDate}
                onChange={(e) => setConvertJoiningDate(e.target.value)}
              />
            </div>
          </div>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={converting}>
              {converting ? 'Moving in…' : 'Create resident & move in'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={closeConvert}>
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="card table-scroll">
        {filteredBookings.length === 0 ? (
          <div className="empty-state">No pending bookings.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Room</th>
                <th>Bed</th>
                <th>Mobile</th>
                <th>Expected joining</th>
                <th>Advance</th>
                <th>Rent</th>
                <th>Booked by</th>
                <th></th>
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
                  <td>{b.bookedBy}</td>
                  <td>
                    <button className="btn btn-secondary btn-sm" onClick={() => openEdit(b)}>
                      Edit
                    </button>{' '}
                    {role === 'admin' && (
                      <button className="btn btn-primary btn-sm" onClick={() => openConvert(b)}>
                        Move in
                      </button>
                    )}{' '}
                    <button className="btn btn-danger btn-sm" onClick={() => handleCancel(b)}>
                      Cancel
                    </button>
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
