import { FormEvent, useState } from 'react'
import { addDoc, collection } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { DeskExpenseEntry, EXPENSE_CATEGORIES, ExpenseCategory, PaymentMode } from '../lib/types'
import { getCurrentUserName } from '../lib/session'
import { showToast } from '../lib/toast'
import { writeWithOfflineFallback } from '../lib/offline'

function todayISODate(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`
}

export default function ExpenseEntry(): React.JSX.Element {
  const [date, setDate] = useState(todayISODate())
  const [category, setCategory] = useState<ExpenseCategory>(EXPENSE_CATEGORIES[0])
  const [amount, setAmount] = useState('')
  const [paidTo, setPaidTo] = useState('')
  const [paidBy, setPaidBy] = useState('')
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('Cash')
  const [onlineReference, setOnlineReference] = useState('')
  const [remarks, setRemarks] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function resetForm(): void {
    setDate(todayISODate())
    setCategory(EXPENSE_CATEGORIES[0])
    setAmount('')
    setPaidTo('')
    setPaidBy('')
    setPaymentMode('Cash')
    setOnlineReference('')
    setRemarks('')
  }

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault()
    setSubmitting(true)
    try {
      const entry: DeskExpenseEntry = {
        date,
        category,
        amount: Number(amount),
        paidTo,
        paidBy,
        paymentMode,
        onlineReference: paymentMode === 'Online' ? onlineReference : '',
        remarks,
        enteredBy: getCurrentUserName() || 'Unknown',
        enteredAt: new Date().toISOString(),
        status: 'pending'
      }
      const result = await writeWithOfflineFallback(addDoc(collection(db, 'deskExpenseEntries'), entry))
      showToast(
        result === 'synced'
          ? 'Expense entry submitted for approval'
          : 'Saved offline — will sync automatically once you\'re back online'
      )
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
        <h1>New Expense</h1>
        <p>Submitted entries go to a reviewer for approval before they count.</p>
      </div>
      <form className="card" onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="form-field">
            <label>Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </div>
          <div className="form-field">
            <label>Type of expense</label>
            <select value={category} onChange={(e) => setCategory(e.target.value as ExpenseCategory)}>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label>Amount (₹)</label>
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
            <label>Paid to</label>
            <input value={paidTo} onChange={(e) => setPaidTo(e.target.value)} required />
          </div>
          <div className="form-field">
            <label>Paid by</label>
            <input value={paidBy} onChange={(e) => setPaidBy(e.target.value)} required />
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
