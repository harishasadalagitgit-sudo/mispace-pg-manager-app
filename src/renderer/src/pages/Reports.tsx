import { useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { useCollection } from '../hooks/useCollection'
import { WebsiteExpense, WebsiteIncomingPayment } from '../lib/types'
import { toCSV } from '../lib/csv'
import { showToast } from '../lib/toast'

// Desktop expense entries preserve their fine-grained category (e.g. "Curd",
// "Rice bags") in the website record's notes as "Category: X — remarks",
// even though they get bucketed into one of 7 coarse website expenseTypes.
// Recover the original category for reporting when it's there; otherwise
// fall back to the coarse expenseType (website-native entries).
function expenseCategory(e: WebsiteExpense): string {
  const match = e.notes?.match(/^Category:\s*([^—]+)/)
  return match ? match[1].trim() : e.expenseType
}

// Advance/security-deposit income is stored as paymentType "Others" with a
// distinguishing notes prefix (see mapping.ts) — recover that distinction
// here so it doesn't just show up as generic "Others" income.
function incomeCategory(p: WebsiteIncomingPayment): string {
  if (p.notes?.startsWith('Advance / security deposit')) return 'Advance / Security Deposit'
  return p.paymentType
}

function firstOfMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

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

function lastDayOfMonth(monthValue: string): string {
  const [y, m] = monthValue.split('-').map(Number)
  if (!y || !m) return monthValue
  const d = new Date(y, m, 0) // day 0 of next month = last day of this month
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`
}

type ReportType = 'expense' | 'income'
type ReportMode = 'month' | 'custom'

export default function Reports(): React.JSX.Element {
  const { data: expenses, loading: expensesLoading } = useCollection<WebsiteExpense>('expenses')
  const { data: incomingPayments, loading: incomeLoading } =
    useCollection<WebsiteIncomingPayment>('incomingPayments')

  const [reportType, setReportType] = useState<ReportType>('expense')
  const [mode, setMode] = useState<ReportMode>('month')
  const [month, setMonth] = useState(currentMonthValue())
  const [customFrom, setCustomFrom] = useState(firstOfMonth())
  const [customTo, setCustomTo] = useState(todayISODate())
  // Excluded (unchecked) categories, rather than a selected set — so newly
  // seen categories default to included without needing extra sync logic.
  // Kept separate per report type so switching types doesn't carry over
  // an unrelated exclusion (e.g. "Repairs" excluded on Expense shouldn't
  // affect Income at all, but the sets are also just semantically distinct).
  const [excludedExpenseCategories, setExcludedExpenseCategories] = useState<Set<string>>(
    new Set()
  )
  const [excludedIncomeCategories, setExcludedIncomeCategories] = useState<Set<string>>(new Set())

  const loading = reportType === 'expense' ? expensesLoading : incomeLoading
  const excludedCategories =
    reportType === 'expense' ? excludedExpenseCategories : excludedIncomeCategories
  const setExcludedCategories =
    reportType === 'expense' ? setExcludedExpenseCategories : setExcludedIncomeCategories

  const fromDate = mode === 'month' ? `${month}-01` : customFrom
  const toDate = mode === 'month' ? lastDayOfMonth(month) : customTo

  const allCategories = useMemo(() => {
    const set =
      reportType === 'expense'
        ? new Set(expenses.map(expenseCategory))
        : new Set(incomingPayments.map(incomeCategory))
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [reportType, expenses, incomingPayments])

  function toggleCategory(category: string): void {
    setExcludedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(category)) next.delete(category)
      else next.add(category)
      return next
    })
  }

  const filteredExpenses = useMemo(
    () =>
      expenses.filter((e) => {
        if (excludedExpenseCategories.has(expenseCategory(e))) return false
        if (fromDate && e.dateOfPayment < fromDate) return false
        if (toDate && e.dateOfPayment > toDate) return false
        return true
      }),
    [expenses, excludedExpenseCategories, fromDate, toDate]
  )

  const filteredIncome = useMemo(
    () =>
      incomingPayments.filter((p) => {
        if (excludedIncomeCategories.has(incomeCategory(p))) return false
        if (fromDate && p.paymentDate < fromDate) return false
        if (toDate && p.paymentDate > toDate) return false
        return true
      }),
    [incomingPayments, excludedIncomeCategories, fromDate, toDate]
  )

  const byType = useMemo(() => {
    const totals = new Map<string, { amount: number; count: number }>()
    if (reportType === 'expense') {
      for (const e of filteredExpenses) {
        const category = expenseCategory(e)
        const entry = totals.get(category) || { amount: 0, count: 0 }
        entry.amount += e.amount || 0
        entry.count += 1
        totals.set(category, entry)
      }
    } else {
      for (const p of filteredIncome) {
        const category = incomeCategory(p)
        const entry = totals.get(category) || { amount: 0, count: 0 }
        entry.amount += p.amount || 0
        entry.count += 1
        totals.set(category, entry)
      }
    }
    return Array.from(totals.entries())
      .map(([type, v]) => ({ type, ...v }))
      .sort((a, b) => b.amount - a.amount)
  }, [reportType, filteredExpenses, filteredIncome])

  const grandTotal = byType.reduce((sum, r) => sum + r.amount, 0)
  const maxAmount = Math.max(1, ...byType.map((r) => r.amount))
  const lineItemCount = reportType === 'expense' ? filteredExpenses.length : filteredIncome.length

  // Chronological order (oldest first) for exports/tables — the underlying
  // useCollection listeners don't guarantee any particular order.
  const sortedExpenses = useMemo(
    () => [...filteredExpenses].sort((a, b) => a.dateOfPayment.localeCompare(b.dateOfPayment)),
    [filteredExpenses]
  )
  const sortedIncome = useMemo(
    () => [...filteredIncome].sort((a, b) => a.paymentDate.localeCompare(b.paymentDate)),
    [filteredIncome]
  )

  // Exports both expense and income line items (for the active date range,
  // each respecting its own category checkboxes) into one workbook as two
  // sheets, regardless of which report is currently on screen.
  async function exportXlsx(): Promise<void> {
    const expenseRows = sortedExpenses.map((e) => ({
      Date: e.dateOfPayment,
      Type: expenseCategory(e),
      Title: e.title,
      Recipient: e.recipient,
      Amount: e.amount,
      Mode: e.paidInCash ? 'Cash' : 'Online',
      'Paid By': e.paidBy,
      Notes: e.notes || ''
    }))
    const incomeRows = sortedIncome.map((p) => ({
      Date: p.paymentDate,
      Type: incomeCategory(p),
      Title: p.title,
      Resident: p.residentName,
      Room: p.roomNum,
      Bed: p.bedNum ?? '',
      Amount: p.amount,
      Mode: p.paidInCash ? 'Cash' : 'Online',
      Payee: p.payee,
      Notes: p.notes || ''
    }))

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(expenseRows), 'Expenses')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(incomeRows), 'Income')

    const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
    const result = await window.api.exportBinary(
      new Uint8Array(buffer),
      `income-expense-report-${fromDate}-to-${toDate}.xlsx`
    )
    if (result.ok) showToast(`Saved to ${result.path}`)
  }

  async function exportExpensesCSV(): Promise<void> {
    const rows = sortedExpenses.map((e) => ({
      date: e.dateOfPayment,
      type: expenseCategory(e),
      title: e.title,
      recipient: e.recipient,
      amount: e.amount,
      mode: e.paidInCash ? 'Cash' : 'Online',
      paidBy: e.paidBy,
      notes: e.notes || ''
    }))
    const csv = toCSV(rows, ['date', 'type', 'title', 'recipient', 'amount', 'mode', 'paidBy', 'notes'])
    const result = await window.api.exportCSV(csv, `expense-report-${fromDate}-to-${toDate}.csv`)
    if (result.ok) showToast(`Saved to ${result.path}`)
  }

  async function exportIncomeCSV(): Promise<void> {
    const rows = sortedIncome.map((p) => ({
      date: p.paymentDate,
      type: incomeCategory(p),
      title: p.title,
      resident: p.residentName,
      room: p.roomNum,
      bed: p.bedNum ?? '',
      amount: p.amount,
      mode: p.paidInCash ? 'Cash' : 'Online',
      payee: p.payee,
      notes: p.notes || ''
    }))
    const csv = toCSV(rows, [
      'date',
      'type',
      'title',
      'resident',
      'room',
      'bed',
      'amount',
      'mode',
      'payee',
      'notes'
    ])
    const result = await window.api.exportCSV(csv, `income-report-${fromDate}-to-${toDate}.csv`)
    if (result.ok) showToast(`Saved to ${result.path}`)
  }

  return (
    <>
      <div className="page-header">
        <h1>{reportType === 'expense' ? 'Expense Report' : 'Income Report'}</h1>
        <p>Totals by category from the website's live {reportType} records.</p>
      </div>

      <div className="filter-bar card">
        <button className="btn btn-secondary" onClick={exportExpensesCSV}>
          Export Expenses (CSV)
        </button>
        <button className="btn btn-secondary" onClick={exportIncomeCSV}>
          Export Income (CSV)
        </button>
        <button className="btn btn-primary" onClick={exportXlsx}>
          Export Both (XLSX)
        </button>
      </div>

      <div className="filter-bar card">
        <div className="form-field">
          <label>Report</label>
          <div className="radio-row" style={{ height: 38, alignItems: 'center' }}>
            <label>
              <input
                type="radio"
                checked={reportType === 'expense'}
                onChange={() => setReportType('expense')}
              />
              Expense
            </label>
            <label>
              <input
                type="radio"
                checked={reportType === 'income'}
                onChange={() => setReportType('income')}
              />
              Income
            </label>
          </div>
        </div>

        <div className="form-field">
          <label>View by</label>
          <div className="radio-row" style={{ height: 38, alignItems: 'center' }}>
            <label>
              <input type="radio" checked={mode === 'month'} onChange={() => setMode('month')} />
              Month
            </label>
            <label>
              <input
                type="radio"
                checked={mode === 'custom'}
                onChange={() => setMode('custom')}
              />
              Custom range
            </label>
          </div>
        </div>

        {mode === 'month' ? (
          <div className="form-field">
            <label>Month</label>
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </div>
        ) : (
          <>
            <div className="form-field">
              <label>From</label>
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
            </div>
            <div className="form-field">
              <label>To</label>
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
            </div>
          </>
        )}
      </div>

      <div className="card">
        <div className="form-field full" style={{ marginBottom: 4 }}>
          <label>Type of {reportType}</label>
        </div>
        <div className="radio-row" style={{ flexWrap: 'wrap', gap: '10px 18px' }}>
          {allCategories.map((category) => (
            <label key={category}>
              <input
                type="checkbox"
                checked={!excludedCategories.has(category)}
                onChange={() => toggleCategory(category)}
              />
              {category}
            </label>
          ))}
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div className="empty-state">Loading…</div>
        ) : byType.length === 0 ? (
          <div className="empty-state">No {reportType}s match this filter.</div>
        ) : (
          <>
            {byType.map((row) => (
              <div
                key={row.type}
                style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}
              >
                <div style={{ width: 150, fontSize: 13, fontWeight: 600, flexShrink: 0 }}>
                  {row.type}
                </div>
                <div style={{ flex: 1, background: '#f1f2f4', borderRadius: 4, height: 16 }}>
                  <div
                    style={{
                      width: `${(row.amount / maxAmount) * 100}%`,
                      minWidth: 4,
                      height: 16,
                      background: reportType === 'expense' ? 'var(--primary)' : 'var(--success)',
                      borderRadius: 4
                    }}
                  />
                </div>
                <div style={{ width: 130, fontSize: 13, color: 'var(--text-muted)', flexShrink: 0 }}>
                  ₹{row.amount.toLocaleString()} · {row.count} item{row.count === 1 ? '' : 's'}
                </div>
              </div>
            ))}
            <div
              style={{
                borderTop: '1px solid var(--border)',
                marginTop: 10,
                paddingTop: 10,
                fontWeight: 700
              }}
            >
              Total: ₹{grandTotal.toLocaleString()} across {lineItemCount} item
              {lineItemCount === 1 ? '' : 's'}
            </div>
          </>
        )}
      </div>

      <div className="card table-scroll">
        {reportType === 'expense' ? (
          filteredExpenses.length === 0 ? (
            <div className="empty-state">No line items in range.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Title</th>
                  <th>Recipient</th>
                  <th>Amount</th>
                  <th>Mode</th>
                  <th>Paid by</th>
                </tr>
              </thead>
              <tbody>
                {filteredExpenses
                  .slice()
                  .sort((a, b) => (a.dateOfPayment < b.dateOfPayment ? 1 : -1))
                  .map((e, i) => (
                    <tr key={i}>
                      <td>{e.dateOfPayment}</td>
                      <td>{expenseCategory(e)}</td>
                      <td>{e.title}</td>
                      <td>{e.recipient}</td>
                      <td>₹{e.amount}</td>
                      <td>{e.paidInCash ? 'Cash' : 'Online'}</td>
                      <td>{e.paidBy}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )
        ) : filteredIncome.length === 0 ? (
          <div className="empty-state">No line items in range.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Title</th>
                <th>Resident</th>
                <th>Room/Bed</th>
                <th>Amount</th>
                <th>Mode</th>
                <th>Payee</th>
              </tr>
            </thead>
            <tbody>
              {filteredIncome
                .slice()
                .sort((a, b) => (a.paymentDate < b.paymentDate ? 1 : -1))
                .map((p, i) => (
                  <tr key={i}>
                    <td>{p.paymentDate}</td>
                    <td>{incomeCategory(p)}</td>
                    <td>{p.title}</td>
                    <td>{p.residentName}</td>
                    <td>
                      {p.roomNum || '—'}
                      {p.bedNum ? ` / Bed ${p.bedNum}` : ''}
                    </td>
                    <td>₹{p.amount}</td>
                    <td>{p.paidInCash ? 'Cash' : 'Online'}</td>
                    <td>{p.payee}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}
