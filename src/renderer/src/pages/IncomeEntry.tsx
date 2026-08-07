import { FormEvent, useEffect, useMemo, useState } from 'react'
import { addDoc, collection } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useCollection } from '../hooks/useCollection'
import { DeskIncomeEntry, PaymentMode, WebsiteResident, WebsiteRoom } from '../lib/types'
import { getCurrentUserName } from '../lib/session'
import { showToast } from '../lib/toast'

function todayISODate(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`
}

function currentMonthValue(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function IncomeEntry(): React.JSX.Element {
  const { data: rooms } = useCollection<WebsiteRoom>('rooms')
  const { data: residents } = useCollection<WebsiteResident>('residents')

  const sortedRooms = useMemo(
    () => [...rooms].sort((a, b) => Number(a.roomNum) - Number(b.roomNum)),
    [rooms]
  )

  const [date, setDate] = useState(todayISODate())
  const [amount, setAmount] = useState('')
  const [roomNum, setRoomNum] = useState('')
  const [bedNum, setBedNum] = useState('')
  const [isAdvance, setIsAdvance] = useState(false)
  const [rentMonth, setRentMonth] = useState(currentMonthValue())
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('Cash')
  const [onlineReference, setOnlineReference] = useState('')
  const [paidTo, setPaidTo] = useState('')
  const [paidBy, setPaidBy] = useState('')
  const [paidByTouched, setPaidByTouched] = useState(false)
  const [remarks, setRemarks] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const selectedRoom = sortedRooms.find((r) => r.roomNum === roomNum)
  const bedOptions = selectedRoom
    ? Array.from({ length: selectedRoom.capacity }, (_, i) => i + 1)
    : []

  // Auto-fill "who paid" from the resident registered at that room/bed, unless
  // the reviewer has already typed something in manually.
  useEffect(() => {
    if (paidByTouched) return
    if (!roomNum || !bedNum) return
    const match = residents.find(
      (r) => r.roomNum === roomNum && String(r.bedNum) === String(bedNum)
    )
    setPaidBy(match ? match.name : '')
  }, [roomNum, bedNum, residents, paidByTouched])

  function resetForm(): void {
    setAmount('')
    setRoomNum('')
    setBedNum('')
    setIsAdvance(false)
    setRentMonth(currentMonthValue())
    setPaymentMode('Cash')
    setOnlineReference('')
    setPaidTo('')
    setPaidBy('')
    setPaidByTouched(false)
    setRemarks('')
    setDate(todayISODate())
  }

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault()
    if (!roomNum || !bedNum) {
      showToast('Please select room and bed', 'error')
      return
    }
    setSubmitting(true)
    try {
      const entry: DeskIncomeEntry = {
        date,
        amount: Number(amount),
        roomNum,
        bedNum: Number(bedNum),
        rentMonth: isAdvance ? 'Advance' : rentMonth,
        isAdvance,
        paymentMode,
        onlineReference: paymentMode === 'Online' ? onlineReference : '',
        paidTo,
        paidBy,
        remarks,
        enteredBy: getCurrentUserName() || 'Unknown',
        enteredAt: new Date().toISOString(),
        status: 'pending'
      }
      await addDoc(collection(db, 'deskIncomeEntries'), entry)
      showToast('Income entry submitted for approval')
      resetForm()
    } catch (err) {
      console.error(err)
      showToast('Failed to save entry: ' + (err as Error).message, 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <div className="page-header">
        <h1>New Income (Rent)</h1>
        <p>Submitted entries go to a reviewer for approval before they count.</p>
      </div>
      <form className="card" onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="form-field">
            <label>Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div className="form-field">
            <label>Rent amount (₹)</label>
            <input
              type="number"
              min="0"
              step="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>

          <div className="form-field">
            <label>Room</label>
            <select value={roomNum} onChange={(e) => { setRoomNum(e.target.value); setBedNum('') }} required>
              <option value="">Select room</option>
              {sortedRooms.map((r) => (
                <option key={r.id} value={r.roomNum}>
                  {r.roomNum} ({r.occupiedCount}/{r.capacity} occupied)
                </option>
              ))}
            </select>
            <span className="hint">Pulled live from the website's room list.</span>
          </div>
          <div className="form-field">
            <label>Bed</label>
            <select
              value={bedNum}
              onChange={(e) => setBedNum(e.target.value)}
              disabled={!selectedRoom}
              required
            >
              <option value="">Select bed</option>
              {bedOptions.map((b) => {
                const occupant = residents.find(
                  (r) => r.roomNum === roomNum && String(r.bedNum) === String(b)
                )
                return (
                  <option key={b} value={b}>
                    Bed {b} — {occupant ? occupant.name : 'Vacant'}
                  </option>
                )
              })}
            </select>
          </div>

          <div className="form-field full">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
              <input
                type="checkbox"
                checked={isAdvance}
                onChange={(e) => setIsAdvance(e.target.checked)}
                style={{ width: 'auto' }}
              />
              This is an advance / security deposit (not tied to a month)
            </label>
          </div>

          {!isAdvance && (
            <div className="form-field">
              <label>Month rent is for</label>
              <input
                type="month"
                value={rentMonth}
                onChange={(e) => setRentMonth(e.target.value)}
                required
              />
            </div>
          )}
          <div className="form-field">
            <label>Mode of payment</label>
            <div className="radio-row" style={{ height: 38, alignItems: 'center' }}>
              <label>
                <input
                  type="radio"
                  checked={paymentMode === 'Cash'}
                  onChange={() => setPaymentMode('Cash')}
                />
                Cash
              </label>
              <label>
                <input
                  type="radio"
                  checked={paymentMode === 'Online'}
                  onChange={() => setPaymentMode('Online')}
                />
                Online
              </label>
            </div>
          </div>

          {paymentMode === 'Online' && (
            <div className="form-field full">
              <label>Online reference / UTR number (optional)</label>
              <input value={onlineReference} onChange={(e) => setOnlineReference(e.target.value)} />
            </div>
          )}

          <div className="form-field">
            <label>Paid to (staff who received it)</label>
            <input value={paidTo} onChange={(e) => setPaidTo(e.target.value)} required />
          </div>
          <div className="form-field">
            <label>Paid by (resident)</label>
            <input
              value={paidBy}
              onChange={(e) => {
                setPaidBy(e.target.value)
                setPaidByTouched(true)
              }}
              required
            />
            <span className="hint">Auto-filled from the resident registered at that bed, if any.</span>
          </div>

          <div className="form-field full">
            <label>Remarks</label>
            <textarea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </div>
        </div>

        <div className="form-actions">
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Submitting…' : 'Submit for approval'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={resetForm}>
            Clear
          </button>
        </div>
      </form>
    </>
  )
}
