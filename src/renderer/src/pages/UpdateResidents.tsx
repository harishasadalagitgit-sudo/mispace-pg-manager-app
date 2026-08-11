import { FormEvent, useMemo, useState } from 'react'
import { addDoc, collection, deleteDoc, doc, updateDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useCollection } from '../hooks/useCollection'
import { EditableResidentFields, VacatedResident, WebsiteResident, WebsiteRoom } from '../lib/types'
import { recalculateRoomOccupancy } from '../lib/occupancy'
import { showToast } from '../lib/toast'
import { promptText } from '../lib/promptDialog'
import { getCurrentUserName } from '../lib/session'
import { useAuth } from '../lib/auth'

type SearchField = 'roomNum' | 'name' | 'mobileNumber'

function todayISODate(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`
}

const EMPTY_FORM: EditableResidentFields = {
  name: '',
  mobileNumber: '',
  whatsappNumber: '',
  roomNum: '',
  bedNum: null,
  dob: '',
  joiningDate: '',
  balanceAmount: 0,
  rentAmount: 0,
  securityDeposit: 0,
  permanentAddress: '',
  currentWorkingCompanyOrCollege: '',
  parentsInformation: '',
  emergencyContact: '',
  specialNotes: ''
}

type View = 'active' | 'vacated'

export default function UpdateResidents(): React.JSX.Element {
  const { role } = useAuth()
  const {
    data: residents,
    loading: residentsLoading,
    refetch: refetchResidents
  } = useCollection<WebsiteResident>('residents')
  const { data: rooms, refetch: refetchRooms } = useCollection<WebsiteRoom>('rooms')
  const {
    data: vacatedResidents,
    loading: vacatedLoading,
    refetch: refetchVacated
  } = useCollection<VacatedResident>('vacatedResidents', 'vacatedAt')

  function refreshAll(): void {
    refetchResidents()
    refetchRooms()
    refetchVacated()
    showToast('Refreshed from database')
  }

  const sortedRooms = useMemo(
    () => [...rooms].sort((a, b) => Number(a.roomNum) - Number(b.roomNum)),
    [rooms]
  )

  const [view, setView] = useState<View>('active')
  const [search, setSearch] = useState('')
  const [searchField, setSearchField] = useState<SearchField>('roomNum')
  const [isOpen, setIsOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<EditableResidentFields>(EMPTY_FORM)
  const [originalRoomNum, setOriginalRoomNum] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [movingResident, setMovingResident] = useState<(WebsiteResident & { id: string }) | null>(
    null
  )
  const [moveRoomNum, setMoveRoomNum] = useState('')
  const [moveBedNum, setMoveBedNum] = useState<number | null>(null)
  const [moving, setMoving] = useState(false)

  const [restoringResident, setRestoringResident] = useState<
    (VacatedResident & { id: string }) | null
  >(null)
  const [restoreRoomNum, setRestoreRoomNum] = useState('')
  const [restoreBedNum, setRestoreBedNum] = useState<number | null>(null)
  const [restoreJoiningDate, setRestoreJoiningDate] = useState('')
  const [restoring, setRestoring] = useState(false)

  function matchesSearchField(
    r: { name?: string; roomNum?: string; mobileNumber?: string },
    field: SearchField,
    q: string
  ): boolean {
    if (!q) return true
    if (field === 'name') return Boolean(r.name?.toLowerCase().includes(q))
    if (field === 'mobileNumber') return Boolean(r.mobileNumber?.includes(q))
    return Boolean(r.roomNum?.includes(q))
  }

  const filteredResidents = useMemo(() => {
    const q = search.trim().toLowerCase()
    return residents
      .filter((r) => matchesSearchField(r, searchField, q))
      .sort((a, b) => Number(a.roomNum) - Number(b.roomNum))
  }, [residents, search, searchField])

  const filteredVacated = useMemo(() => {
    const q = search.trim().toLowerCase()
    return vacatedResidents.filter((r) => matchesSearchField(r, searchField, q))
  }, [vacatedResidents, search, searchField])

  const selectedRoom = sortedRooms.find((r) => r.roomNum === form.roomNum)

  const moveTargetRoom = sortedRooms.find((r) => r.roomNum === moveRoomNum)
  const moveVacantBeds = useMemo(() => {
    if (!moveTargetRoom) return []
    const occupiedBeds = new Set(
      residents
        .filter((r) => r.roomNum === moveTargetRoom.roomNum && r.id !== movingResident?.id)
        .map((r) => r.bedNum)
    )
    return Array.from({ length: moveTargetRoom.capacity }, (_, i) => i + 1).filter(
      (b) => !occupiedBeds.has(b)
    )
  }, [moveTargetRoom, residents, movingResident])

  const restoreTargetRoom = sortedRooms.find((r) => r.roomNum === restoreRoomNum)
  const restoreVacantBeds = useMemo(() => {
    if (!restoreTargetRoom) return []
    const occupiedBeds = new Set(
      residents.filter((r) => r.roomNum === restoreTargetRoom.roomNum).map((r) => r.bedNum)
    )
    return Array.from({ length: restoreTargetRoom.capacity }, (_, i) => i + 1).filter(
      (b) => !occupiedBeds.has(b)
    )
  }, [restoreTargetRoom, residents])

  function openAdd(): void {
    setEditingId(null)
    setOriginalRoomNum(null)
    setForm(EMPTY_FORM)
    setIsOpen(true)
  }

  function openEdit(res: WebsiteResident & { id: string }): void {
    setEditingId(res.id)
    setOriginalRoomNum(res.roomNum)
    setForm({
      name: res.name || '',
      mobileNumber: res.mobileNumber || '',
      whatsappNumber: res.whatsappNumber || '',
      roomNum: res.roomNum || '',
      bedNum: res.bedNum ?? null,
      dob: res.dob || '',
      joiningDate: res.joiningDate || '',
      balanceAmount: res.balanceAmount || 0,
      rentAmount: res.rentAmount || 0,
      securityDeposit: res.securityDeposit || 0,
      permanentAddress: res.permanentAddress || '',
      currentWorkingCompanyOrCollege: res.currentWorkingCompanyOrCollege || '',
      parentsInformation: res.parentsInformation || '',
      emergencyContact: res.emergencyContact || '',
      specialNotes: res.specialNotes || ''
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
    if (!form.name || !form.roomNum || !form.mobileNumber) {
      showToast('Name, room and mobile number are required', 'error')
      return
    }

    const targetRoom = sortedRooms.find((r) => r.roomNum === form.roomNum)
    if (!targetRoom) {
      showToast('This room does not exist', 'error')
      return
    }

    const roomIsChanging = !editingId || originalRoomNum !== form.roomNum
    if (roomIsChanging && targetRoom.occupiedCount >= targetRoom.capacity) {
      showToast(
        `Room ${targetRoom.roomNum} is already at capacity (${targetRoom.capacity}/${targetRoom.capacity})`,
        'error'
      )
      return
    }

    if (form.bedNum) {
      const bedTaken = residents.find(
        (r) => r.roomNum === form.roomNum && r.bedNum === form.bedNum && r.id !== editingId
      )
      if (bedTaken) {
        showToast(`Bed ${form.bedNum} in Room ${form.roomNum} is already taken by ${bedTaken.name}`, 'error')
        return
      }
    }

    setSaving(true)
    try {
      const payload = {
        name: form.name,
        mobileNumber: form.mobileNumber,
        whatsappNumber: form.whatsappNumber || form.mobileNumber,
        roomNum: form.roomNum,
        bedNum: form.bedNum || null,
        dob: form.dob || '2000-01-01',
        joiningDate: form.joiningDate || todayISODate(),
        balanceAmount: Number(form.balanceAmount) || 0,
        rentAmount: Number(form.rentAmount) || 0,
        securityDeposit: Number(form.securityDeposit) || 0,
        permanentAddress: form.permanentAddress || '',
        currentWorkingCompanyOrCollege: form.currentWorkingCompanyOrCollege || '',
        parentsInformation: form.parentsInformation || '',
        emergencyContact: form.emergencyContact || '',
        specialNotes: form.specialNotes || ''
      }

      if (editingId) {
        await updateDoc(doc(db, 'residents', editingId), payload)
        showToast('Resident updated')
      } else {
        await addDoc(collection(db, 'residents'), payload)
        showToast('Resident added')
      }

      await recalculateRoomOccupancy(form.roomNum)
      if (originalRoomNum && originalRoomNum !== form.roomNum) {
        await recalculateRoomOccupancy(originalRoomNum)
      }
      closeForm()
    } catch (err) {
      console.error(err)
      showToast('Save failed: ' + (err as Error).message, 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleVacate(res: WebsiteResident & { id: string }): Promise<void> {
    if (!window.confirm(`Move ${res.name} to vacated residents? They'll be removed from the active list.`)) {
      return
    }
    const reason = (await promptText(`Reason ${res.name} is vacating (optional):`)) || ''
    try {
      const { id, ...rest } = res
      await addDoc(collection(db, 'vacatedResidents'), {
        ...rest,
        originalResidentId: id,
        vacatedAt: new Date().toISOString(),
        vacatedBy: getCurrentUserName() || 'Admin',
        reason
      })
      await deleteDoc(doc(db, 'residents', id))
      await recalculateRoomOccupancy(res.roomNum)
      showToast(`${res.name} moved to vacated residents`)
      if (editingId === id) closeForm()
    } catch (err) {
      console.error(err)
      showToast('Failed to vacate: ' + (err as Error).message, 'error')
    }
  }

  async function handleDelete(res: WebsiteResident & { id: string }): Promise<void> {
    if (
      !window.confirm(
        `Permanently delete ${res.name}? Unlike "Mark vacated", this keeps no record — use it only to correct a mistake or duplicate.`
      )
    ) {
      return
    }
    try {
      await deleteDoc(doc(db, 'residents', res.id))
      await recalculateRoomOccupancy(res.roomNum)
      showToast(`${res.name} deleted`)
      if (editingId === res.id) closeForm()
    } catch (err) {
      console.error(err)
      showToast('Failed to delete: ' + (err as Error).message, 'error')
    }
  }

  function openMove(res: WebsiteResident & { id: string }): void {
    setMovingResident(res)
    setMoveRoomNum('')
    setMoveBedNum(null)
  }

  function closeMove(): void {
    setMovingResident(null)
    setMoveRoomNum('')
    setMoveBedNum(null)
  }

  async function handleMoveSubmit(e: FormEvent): Promise<void> {
    e.preventDefault()
    if (!movingResident) return
    if (!moveRoomNum) {
      showToast('Select a room to move to', 'error')
      return
    }
    if (moveRoomNum === movingResident.roomNum && moveBedNum === (movingResident.bedNum ?? null)) {
      showToast('Pick a different room or bed', 'error')
      return
    }

    const targetRoom = sortedRooms.find((r) => r.roomNum === moveRoomNum)
    if (!targetRoom) {
      showToast('This room does not exist', 'error')
      return
    }
    if (moveRoomNum !== movingResident.roomNum && targetRoom.occupiedCount >= targetRoom.capacity) {
      showToast(
        `Room ${targetRoom.roomNum} is already at capacity (${targetRoom.capacity}/${targetRoom.capacity})`,
        'error'
      )
      return
    }
    if (moveBedNum) {
      const bedTaken = residents.find(
        (r) => r.roomNum === moveRoomNum && r.bedNum === moveBedNum && r.id !== movingResident.id
      )
      if (bedTaken) {
        showToast(`Bed ${moveBedNum} in Room ${moveRoomNum} is already taken by ${bedTaken.name}`, 'error')
        return
      }
    }

    setMoving(true)
    try {
      const previousRoomNum = movingResident.roomNum
      await updateDoc(doc(db, 'residents', movingResident.id), {
        roomNum: moveRoomNum,
        bedNum: moveBedNum || null
      })
      await recalculateRoomOccupancy(moveRoomNum)
      if (previousRoomNum !== moveRoomNum) {
        await recalculateRoomOccupancy(previousRoomNum)
      }
      showToast(`${movingResident.name} moved to Room ${moveRoomNum}${moveBedNum ? ` / Bed ${moveBedNum}` : ''}`)
      closeMove()
    } catch (err) {
      console.error(err)
      showToast('Move failed: ' + (err as Error).message, 'error')
    } finally {
      setMoving(false)
    }
  }

  function openRestore(res: VacatedResident & { id: string }): void {
    setRestoringResident(res)
    setRestoreRoomNum('')
    setRestoreBedNum(null)
    setRestoreJoiningDate(todayISODate())
  }

  function closeRestore(): void {
    setRestoringResident(null)
    setRestoreRoomNum('')
    setRestoreBedNum(null)
    setRestoreJoiningDate('')
  }

  async function handleRestoreSubmit(e: FormEvent): Promise<void> {
    e.preventDefault()
    if (!restoringResident) return
    if (!restoreRoomNum) {
      showToast('Select a room to restore into', 'error')
      return
    }

    const targetRoom = sortedRooms.find((r) => r.roomNum === restoreRoomNum)
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
    if (restoreBedNum) {
      const bedTaken = residents.find(
        (r) => r.roomNum === restoreRoomNum && r.bedNum === restoreBedNum
      )
      if (bedTaken) {
        showToast(`Bed ${restoreBedNum} in Room ${restoreRoomNum} is already taken by ${bedTaken.name}`, 'error')
        return
      }
    }

    setRestoring(true)
    try {
      const { id, vacatedAt, vacatedBy, reason, originalResidentId, ...rest } = restoringResident
      await addDoc(collection(db, 'residents'), {
        ...rest,
        roomNum: restoreRoomNum,
        bedNum: restoreBedNum || null,
        joiningDate: restoreJoiningDate || todayISODate()
      })
      await deleteDoc(doc(db, 'vacatedResidents', id))
      await recalculateRoomOccupancy(restoreRoomNum)
      showToast(`${restoringResident.name} restored to Room ${restoreRoomNum}${restoreBedNum ? ` / Bed ${restoreBedNum}` : ''}`)
      closeRestore()
    } catch (err) {
      console.error(err)
      showToast('Restore failed: ' + (err as Error).message, 'error')
    } finally {
      setRestoring(false)
    }
  }

  return (
    <>
      <div className="page-header">
        <h1>Residents</h1>
        <p>
          {role !== 'admin'
            ? 'View only — ask an Admin to add, edit, move, or vacate a resident.'
            : view === 'active'
              ? "Adds/edits write directly to the website's live residents database."
              : 'Residents who have moved out, kept for record.'}
        </p>
      </div>

      <div className="filter-bar card">
        <div className="form-field">
          <label>Search by</label>
          <select value={searchField} onChange={(e) => setSearchField(e.target.value as SearchField)}>
            <option value="roomNum">Room number</option>
            <option value="name">Resident name</option>
            <option value="mobileNumber">Mobile number</option>
          </select>
        </div>
        <div className="form-field" style={{ flex: 1 }}>
          <label>Search</label>
          <input
            placeholder={
              searchField === 'roomNum'
                ? 'Room number…'
                : searchField === 'name'
                  ? 'Resident name…'
                  : 'Mobile number…'
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button className="btn btn-secondary" onClick={refreshAll} disabled={residentsLoading || vacatedLoading}>
          Refresh
        </button>
        <button
          className="btn btn-secondary"
          onClick={() => setView(view === 'active' ? 'vacated' : 'active')}
        >
          {view === 'active' ? 'View vacated residents' : 'Back to active residents'}
        </button>
        {view === 'active' && role === 'admin' && (
          <button className="btn btn-primary" onClick={openAdd}>
            + Add resident
          </button>
        )}
      </div>

      {view === 'active' && isOpen && (() => {
        const readOnly = role !== 'admin'
        return (
        <form className="card" onSubmit={handleSubmit} style={{ borderColor: 'var(--primary)' }}>
          <div className="page-header" style={{ marginBottom: 12 }}>
            <h1 style={{ fontSize: 16 }}>
              {readOnly ? 'Resident details' : editingId ? 'Edit resident' : 'New resident'}
            </h1>
          </div>
          <div className="form-grid">
            <div className="form-field">
              <label>Name</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                disabled={readOnly}
              />
            </div>
            <div className="form-field">
              <label>Mobile number</label>
              <input
                value={form.mobileNumber}
                onChange={(e) => setForm({ ...form, mobileNumber: e.target.value })}
                required
                disabled={readOnly}
              />
            </div>
            <div className="form-field">
              <label>WhatsApp number</label>
              <input
                value={form.whatsappNumber}
                onChange={(e) => setForm({ ...form, whatsappNumber: e.target.value })}
                placeholder="Same as mobile if left blank"
                disabled={readOnly}
              />
            </div>
            <div className="form-field">
              <label>Emergency contact</label>
              <input
                value={form.emergencyContact}
                onChange={(e) => setForm({ ...form, emergencyContact: e.target.value })}
                disabled={readOnly}
              />
            </div>

            <div className="form-field">
              <label>Room</label>
              <select
                value={form.roomNum}
                onChange={(e) => setForm({ ...form, roomNum: e.target.value, bedNum: null })}
                required
                disabled={readOnly}
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
                value={form.bedNum ?? ''}
                onChange={(e) => setForm({ ...form, bedNum: e.target.value ? Number(e.target.value) : null })}
                disabled={readOnly || !selectedRoom}
              >
                <option value="">Unassigned</option>
                {selectedRoom &&
                  Array.from({ length: selectedRoom.capacity }, (_, i) => i + 1).map((b) => (
                    <option key={b} value={b}>
                      Bed {b}
                    </option>
                  ))}
              </select>
            </div>

            <div className="form-field">
              <label>Date of birth</label>
              <input
                type="date"
                value={form.dob}
                onChange={(e) => setForm({ ...form, dob: e.target.value })}
                disabled={readOnly}
              />
            </div>
            <div className="form-field">
              <label>Joining date</label>
              <input
                type="date"
                value={form.joiningDate}
                onChange={(e) => setForm({ ...form, joiningDate: e.target.value })}
                disabled={readOnly}
              />
            </div>

            <div className="form-field">
              <label>Company / college</label>
              <input
                value={form.currentWorkingCompanyOrCollege}
                onChange={(e) => setForm({ ...form, currentWorkingCompanyOrCollege: e.target.value })}
                disabled={readOnly}
              />
            </div>
            <div className="form-field">
              <label>Monthly rent amount (₹)</label>
              <input
                type="number"
                value={form.rentAmount}
                onChange={(e) => setForm({ ...form, rentAmount: Number(e.target.value) })}
                disabled={readOnly}
              />
            </div>
            <div className="form-field">
              <label>Security deposit (₹)</label>
              <input
                type="number"
                value={form.securityDeposit}
                onChange={(e) => setForm({ ...form, securityDeposit: Number(e.target.value) })}
                disabled={readOnly}
              />
            </div>
            <div className="form-field">
              <label>Balance amount (₹)</label>
              <input
                type="number"
                value={form.balanceAmount}
                onChange={(e) => setForm({ ...form, balanceAmount: Number(e.target.value) })}
                disabled={readOnly}
              />
            </div>

            <div className="form-field full">
              <label>Permanent address</label>
              <textarea
                rows={2}
                value={form.permanentAddress}
                onChange={(e) => setForm({ ...form, permanentAddress: e.target.value })}
                disabled={readOnly}
              />
            </div>
            <div className="form-field full">
              <label>Parents' information</label>
              <input
                value={form.parentsInformation}
                onChange={(e) => setForm({ ...form, parentsInformation: e.target.value })}
                placeholder="e.g. Father: Kumar, Mother: Rita"
                disabled={readOnly}
              />
            </div>
            <div className="form-field full">
              <label>Special notes</label>
              <textarea
                rows={2}
                value={form.specialNotes}
                onChange={(e) => setForm({ ...form, specialNotes: e.target.value })}
                disabled={readOnly}
              />
            </div>
          </div>

          <div className="form-actions">
            {readOnly ? (
              <button type="button" className="btn btn-secondary" onClick={closeForm}>
                Close
              </button>
            ) : (
              <>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving…' : editingId ? 'Save changes' : 'Add resident'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={closeForm}>
                  Cancel
                </button>
              </>
            )}
          </div>
        </form>
        )
      })()}

      {view === 'active' && movingResident && (
        <form className="card" onSubmit={handleMoveSubmit} style={{ borderColor: 'var(--primary)' }}>
          <div className="page-header" style={{ marginBottom: 12 }}>
            <h1 style={{ fontSize: 16 }}>
              Move {movingResident.name} — currently Room {movingResident.roomNum}
              {movingResident.bedNum ? ` / Bed ${movingResident.bedNum}` : ''}
            </h1>
          </div>
          <div className="form-grid">
            <div className="form-field">
              <label>New room</label>
              <select
                value={moveRoomNum}
                onChange={(e) => {
                  setMoveRoomNum(e.target.value)
                  setMoveBedNum(null)
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
              <label>New bed</label>
              <select
                value={moveBedNum ?? ''}
                onChange={(e) => setMoveBedNum(e.target.value ? Number(e.target.value) : null)}
                disabled={!moveTargetRoom}
              >
                <option value="">Unassigned</option>
                {moveVacantBeds.map((b) => (
                  <option key={b} value={b}>
                    Bed {b}
                  </option>
                ))}
              </select>
              {moveTargetRoom && moveVacantBeds.length === 0 && (
                <span className="hint" style={{ color: 'var(--danger)' }}>
                  No vacant beds in this room.
                </span>
              )}
            </div>
          </div>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={moving}>
              {moving ? 'Moving…' : 'Move resident'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={closeMove}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {view === 'vacated' && restoringResident && (
        <form className="card" onSubmit={handleRestoreSubmit} style={{ borderColor: 'var(--primary)' }}>
          <div className="page-header" style={{ marginBottom: 12 }}>
            <h1 style={{ fontSize: 16 }}>Restore {restoringResident.name} to an active room</h1>
          </div>
          <div className="form-grid">
            <div className="form-field">
              <label>Room</label>
              <select
                value={restoreRoomNum}
                onChange={(e) => {
                  setRestoreRoomNum(e.target.value)
                  setRestoreBedNum(null)
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
                value={restoreBedNum ?? ''}
                onChange={(e) => setRestoreBedNum(e.target.value ? Number(e.target.value) : null)}
                disabled={!restoreTargetRoom}
              >
                <option value="">Unassigned</option>
                {restoreVacantBeds.map((b) => (
                  <option key={b} value={b}>
                    Bed {b}
                  </option>
                ))}
              </select>
              {restoreTargetRoom && restoreVacantBeds.length === 0 && (
                <span className="hint" style={{ color: 'var(--danger)' }}>
                  No vacant beds in this room.
                </span>
              )}
            </div>
            <div className="form-field">
              <label>New joining date</label>
              <input
                type="date"
                value={restoreJoiningDate}
                onChange={(e) => setRestoreJoiningDate(e.target.value)}
              />
              <span className="hint">Rent billing restarts from this date.</span>
            </div>
          </div>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={restoring}>
              {restoring ? 'Restoring…' : 'Restore resident'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={closeRestore}>
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="card table-scroll">
        {view === 'active' ? (
          filteredResidents.length === 0 ? (
            <div className="empty-state">No residents match this search.</div>
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
                        <th>Rent</th>
                        <th>Balance</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.id}>
                          <td>
                            <button
                              type="button"
                              onClick={() => openEdit(r)}
                              className="link-button"
                              style={{
                                background: 'none',
                                border: 'none',
                                padding: 0,
                                color: 'var(--primary)',
                                textDecoration: 'underline',
                                cursor: 'pointer',
                                font: 'inherit'
                              }}
                            >
                              {r.name}
                            </button>
                          </td>
                          <td>{r.bedNum ?? '—'}</td>
                          <td>{r.mobileNumber || '—'}</td>
                          <td>{r.rentAmount ? `₹${r.rentAmount}` : '—'}</td>
                          <td>{r.balanceAmount ? `₹${r.balanceAmount}` : '—'}</td>
                          <td>
                            {role === 'admin' && (
                              <>
                                <button className="btn btn-secondary btn-sm" onClick={() => openEdit(r)}>
                                  Edit
                                </button>{' '}
                                <button className="btn btn-secondary btn-sm" onClick={() => openMove(r)}>
                                  Move room
                                </button>{' '}
                                <button className="btn btn-danger btn-sm" onClick={() => handleVacate(r)}>
                                  Mark vacated
                                </button>{' '}
                                <button className="btn btn-danger btn-sm" onClick={() => handleDelete(r)}>
                                  Delete
                                </button>
                              </>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))
            })()
          )
        ) : filteredVacated.length === 0 ? (
          <div className="empty-state">No vacated residents recorded yet.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Last room/bed</th>
                <th>Mobile</th>
                <th>Deposit to return</th>
                <th>Vacated on</th>
                <th>Vacated by</th>
                <th>Reason</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredVacated.map((r) => (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td>
                    {r.roomNum}
                    {r.bedNum ? `/${r.bedNum}` : ''}
                  </td>
                  <td>{r.mobileNumber || '—'}</td>
                  <td>{r.securityDeposit ? `₹${r.securityDeposit}` : '—'}</td>
                  <td>{new Date(r.vacatedAt).toLocaleDateString()}</td>
                  <td>{r.vacatedBy}</td>
                  <td>{r.reason || '—'}</td>
                  <td>
                    {role === 'admin' && (
                      <button className="btn btn-primary btn-sm" onClick={() => openRestore(r)}>
                        Restore to room
                      </button>
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
