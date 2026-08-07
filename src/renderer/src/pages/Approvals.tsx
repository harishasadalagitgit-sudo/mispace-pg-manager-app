import { useMemo, useState } from 'react'
import { addDoc, collection, doc, updateDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useCollection } from '../hooks/useCollection'
import { DeskExpenseEntry, DeskIncomeEntry, WebsiteIncomingPayment, WebsiteResident } from '../lib/types'
import { expenseToWebsiteRecord, incomeToWebsiteRecord } from '../lib/mapping'
import { calculateResidentBalance } from '../lib/rentCalc'
import { getCurrentUserName } from '../lib/session'
import { showToast } from '../lib/toast'
import { promptText } from '../lib/promptDialog'
import RequireAdmin from '../components/RequireAdmin'

type PendingItem =
  | { kind: 'income'; entry: DeskIncomeEntry & { id: string } }
  | { kind: 'expense'; entry: DeskExpenseEntry & { id: string } }

export default function Approvals(): React.JSX.Element {
  const { data: incomeEntries } = useCollection<DeskIncomeEntry>('deskIncomeEntries', 'enteredAt')
  const { data: expenseEntries } = useCollection<DeskExpenseEntry>(
    'deskExpenseEntries',
    'enteredAt'
  )
  const { data: residents } = useCollection<WebsiteResident>('residents')
  const { data: incomingPayments } = useCollection<WebsiteIncomingPayment>('incomingPayments')

  const [busyId, setBusyId] = useState<string | null>(null)

  const pending: PendingItem[] = useMemo(() => {
    const incomeItems: PendingItem[] = incomeEntries
      .filter((e) => e.status === 'pending')
      .map((entry) => ({ kind: 'income', entry }))
    const expenseItems: PendingItem[] = expenseEntries
      .filter((e) => e.status === 'pending')
      .map((entry) => ({ kind: 'expense', entry }))
    return [...incomeItems, ...expenseItems].sort((a, b) =>
      a.entry.enteredAt < b.entry.enteredAt ? 1 : -1
    )
  }, [incomeEntries, expenseEntries])

  async function approve(item: PendingItem): Promise<void> {
    setBusyId(item.entry.id)
    try {
      const reviewedBy = getCurrentUserName() || 'Reviewer'
      const reviewedAt = new Date().toISOString()

      if (item.kind === 'income') {
        const record = incomeToWebsiteRecord(item.entry)
        const ref = await addDoc(collection(db, 'incomingPayments'), record)
        await updateDoc(doc(db, 'deskIncomeEntries', item.entry.id), {
          status: 'approved',
          reviewedBy,
          reviewedAt,
          linkedIncomingPaymentId: ref.id
        })

        const resident = residents.find(
          (r) => r.roomNum === item.entry.roomNum && r.bedNum === item.entry.bedNum
        )
        if (resident) {
          if (item.entry.isAdvance) {
            await updateDoc(doc(db, 'residents', resident.id), {
              securityDeposit: (resident.securityDeposit || 0) + item.entry.amount
            })
          } else {
            const priorPaid = incomingPayments
              .filter(
                (p) =>
                  p.roomNum === resident.roomNum &&
                  p.bedNum === resident.bedNum &&
                  p.paymentType === 'Hostel Resident Monthly'
              )
              .reduce((sum, p) => sum + (p.amount || 0), 0)
            const totalPaid = priorPaid + item.entry.amount
            const updatedBalance = calculateResidentBalance(
              resident.rentAmount || 0,
              resident.joiningDate || '',
              totalPaid
            )
            await updateDoc(doc(db, 'residents', resident.id), { balanceAmount: updatedBalance })
          }
        }
      } else {
        const record = expenseToWebsiteRecord(item.entry)
        const ref = await addDoc(collection(db, 'expenses'), record)
        await updateDoc(doc(db, 'deskExpenseEntries', item.entry.id), {
          status: 'approved',
          reviewedBy,
          reviewedAt,
          linkedExpenseId: ref.id
        })
      }
      showToast('Approved and written to the website database')
    } catch (err) {
      console.error(err)
      showToast('Approval failed: ' + (err as Error).message, 'error')
    } finally {
      setBusyId(null)
    }
  }

  async function reject(item: PendingItem): Promise<void> {
    const reason = (await promptText('Reason for rejecting (optional):')) || ''
    setBusyId(item.entry.id)
    try {
      const collectionName = item.kind === 'income' ? 'deskIncomeEntries' : 'deskExpenseEntries'
      await updateDoc(doc(db, collectionName, item.entry.id), {
        status: 'rejected',
        reviewedBy: getCurrentUserName() || 'Reviewer',
        reviewedAt: new Date().toISOString(),
        reviewNotes: reason
      })
      showToast('Entry rejected')
    } catch (err) {
      console.error(err)
      showToast('Failed to reject: ' + (err as Error).message, 'error')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <RequireAdmin>
      <div className="page-header">
        <h1>Approvals</h1>
        <p>{pending.length} entr{pending.length === 1 ? 'y' : 'ies'} waiting for review.</p>
      </div>

      {pending.length === 0 ? (
        <div className="card empty-state">Nothing pending. All caught up.</div>
      ) : (
        pending.map((item) => (
          <div className="card" key={item.entry.id}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span className="pill pill-pending">{item.kind === 'income' ? 'INCOME' : 'EXPENSE'}</span>
                <div style={{ marginTop: 8, fontSize: 15, fontWeight: 600 }}>
                  {item.kind === 'income'
                    ? `₹${item.entry.amount} — Room ${item.entry.roomNum} / Bed ${item.entry.bedNum} — ${
                        item.entry.isAdvance ? 'Advance / Security Deposit' : item.entry.rentMonth
                      }`
                    : `₹${item.entry.amount} — ${item.entry.category}`}
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
                  Date: {item.entry.date} · Mode: {item.entry.paymentMode} · Paid to:{' '}
                  {item.entry.paidTo} · Paid by: {item.entry.paidBy}
                  <br />
                  Entered by {item.entry.enteredBy} on{' '}
                  {new Date(item.entry.enteredAt).toLocaleString()}
                  {item.entry.remarks && <> · Remarks: {item.entry.remarks}</>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn btn-success btn-sm"
                  disabled={busyId === item.entry.id}
                  onClick={() => approve(item)}
                >
                  Approve
                </button>
                <button
                  className="btn btn-danger btn-sm"
                  disabled={busyId === item.entry.id}
                  onClick={() => reject(item)}
                >
                  Reject
                </button>
              </div>
            </div>
          </div>
        ))
      )}
    </RequireAdmin>
  )
}
