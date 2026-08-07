import { useMemo, useState } from 'react'
import { doc, setDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useCollection } from '../hooks/useCollection'
import {
  CHECKLIST_ITEM_KEYWORDS,
  CHECKLIST_ITEMS,
  ChecklistItemStatus,
  DeskExpenseEntry,
  MonthlyChecklist,
  WebsiteExpense
} from '../lib/types'
import { getCurrentUserName } from '../lib/session'
import { showToast } from '../lib/toast'

interface VerifyResult {
  found: boolean
  count: number
  amount: number
}

function currentMonthValue(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number)
  if (!y || !m) return month
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function Checklist(): React.JSX.Element {
  const { data: checklists } = useCollection<MonthlyChecklist>('monthlyChecklists')
  const { data: deskExpenses } = useCollection<DeskExpenseEntry>('deskExpenseEntries')
  const { data: liveExpenses } = useCollection<WebsiteExpense>('expenses')
  const [month, setMonth] = useState(currentMonthValue())
  const [verifyResults, setVerifyResults] = useState<Record<string, VerifyResult> | null>(null)

  const current = checklists.find((c) => c.month === month)
  const items = current?.items || {}
  const isCurrentMonth = month === currentMonthValue()

  const doneCount = useMemo(
    () => CHECKLIST_ITEMS.filter((item) => items[item]?.checked).length,
    [items]
  )

  function verify(): void {
    const monthDesk = deskExpenses.filter((e) => e.date?.startsWith(month))
    const monthLive = liveExpenses.filter((e) => e.dateOfPayment?.startsWith(month))

    const results: Record<string, VerifyResult> = {}
    for (const item of CHECKLIST_ITEMS) {
      const keywords = CHECKLIST_ITEM_KEYWORDS[item]
      let count = 0
      let amount = 0

      if (item === 'Other bills covered?') {
        for (const e of monthDesk) {
          if (e.category === 'Others') {
            count++
            amount += e.amount || 0
          }
        }
        for (const e of monthLive) {
          if (e.expenseType === 'Others') {
            count++
            amount += e.amount || 0
          }
        }
      } else if (keywords) {
        for (const e of monthDesk) {
          const haystack = `${e.category} ${e.paidTo} ${e.paidBy} ${e.remarks || ''}`.toLowerCase()
          if (keywords.some((k) => haystack.includes(k))) {
            count++
            amount += e.amount || 0
          }
        }
        for (const e of monthLive) {
          const haystack = `${e.expenseType} ${e.title} ${e.recipient} ${e.paidBy} ${e.notes || ''}`.toLowerCase()
          if (keywords.some((k) => haystack.includes(k))) {
            count++
            amount += e.amount || 0
          }
        }
      }

      results[item] = { found: count > 0, count, amount }
    }
    setVerifyResults(results)
  }

  async function toggle(item: string): Promise<void> {
    const existing = items[item]
    const next: ChecklistItemStatus = existing?.checked
      ? { checked: false }
      : {
          checked: true,
          checkedBy: getCurrentUserName() || 'Unknown',
          checkedAt: new Date().toISOString()
        }
    try {
      await setDoc(
        doc(db, 'monthlyChecklists', month),
        { month, items: { ...items, [item]: next } },
        { merge: true }
      )
    } catch (err) {
      console.error(err)
      showToast('Failed to update checklist: ' + (err as Error).message, 'error')
    }
  }

  return (
    <>
      <div className="page-header">
        <h1>Checklist — {monthLabel(month)}</h1>
        <p>Recurring monthly expenses to make sure nobody forgets. {doneCount}/{CHECKLIST_ITEMS.length} done.</p>
      </div>

      <div className="filter-bar card">
        <button className="btn btn-secondary btn-sm" onClick={() => setMonth(shiftMonth(month, -1))}>
          ← Previous month
        </button>
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => setMonth(currentMonthValue())}
          disabled={isCurrentMonth}
        >
          This month
        </button>
        <button className="btn btn-secondary btn-sm" onClick={() => setMonth(shiftMonth(month, 1))}>
          Next month →
        </button>
        <div style={{ flex: 1 }} />
        <button className="btn btn-primary btn-sm" onClick={verify}>
          Verify against expense records
        </button>
      </div>

      {verifyResults && (
        <div className="card" style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          Matched against {monthLabel(month)}&apos;s expense records by category/keyword — a best-effort
          check, not a guarantee. Please confirm manually if something looks off.
        </div>
      )}

      <div className="card">
        {CHECKLIST_ITEMS.map((item) => {
          const status = items[item]
          const result = verifyResults?.[item]
          return (
            <label
              key={item}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 0',
                borderBottom: '1px solid var(--border)',
                cursor: 'pointer'
              }}
            >
              <input
                type="checkbox"
                checked={!!status?.checked}
                onChange={() => toggle(item)}
                style={{ width: 18, height: 18 }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{item}</div>
                {status?.checked && (
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    Checked by {status.checkedBy} on{' '}
                    {status.checkedAt ? new Date(status.checkedAt).toLocaleString() : ''}
                  </div>
                )}
              </div>
              {result && (
                <span
                  className={`pill ${result.found ? 'pill-approved' : 'pill-rejected'}`}
                  title={result.found ? `${result.count} matching record(s), ₹${result.amount}` : ''}
                >
                  {result.found ? `✓ Found (${result.count}, ₹${result.amount})` : '⚠ Not found'}
                </span>
              )}
            </label>
          )
        })}
      </div>
    </>
  )
}
