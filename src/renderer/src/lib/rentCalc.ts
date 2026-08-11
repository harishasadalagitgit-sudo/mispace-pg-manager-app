// Billing cycle = the resident's join-day anniversary each month (e.g. joined
// on the 12th -> a new month is billed on the 12th of every month, and the
// very first month is owed immediately on joining). Security deposit is a
// one-time joining payment and is never part of this calculation.
export function monthsElapsedSince(joiningDate: string, today: Date = new Date()): number {
  const join = new Date(joiningDate)
  if (isNaN(join.getTime())) return 0
  let months = (today.getFullYear() - join.getFullYear()) * 12 + (today.getMonth() - join.getMonth())
  if (today.getDate() >= join.getDate()) months += 1
  return Math.max(1, months)
}

export function calculateResidentBalance(
  rentAmount: number,
  joiningDate: string,
  totalPaid: number,
  today: Date = new Date()
): number {
  if (!joiningDate) return 0
  const months = monthsElapsedSince(joiningDate, today)
  const totalDue = months * (rentAmount || 0)
  return Math.max(0, totalDue - totalPaid)
}

function clampToMonth(year: number, month: number, day: number): Date {
  const lastDayOfMonth = new Date(year, month + 1, 0).getDate()
  return new Date(year, month, Math.min(day, lastDayOfMonth))
}

function formatISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate()
  ).padStart(2, '0')}`
}

// The most recent occurrence of the resident's joining-day-of-month, on or
// before today — the billing anniversary they were last expected to pay by.
// Unlike nextDueDate (always today or later), this is always today or
// earlier, so it's the right anchor for "how many days overdue are they".
export function lastDueDate(joiningDate: string, today: Date = new Date()): string {
  const join = new Date(joiningDate)
  if (isNaN(join.getTime())) return ''
  const day = join.getDate()

  let candidate = clampToMonth(today.getFullYear(), today.getMonth(), day)
  if (candidate > today) {
    candidate = clampToMonth(today.getFullYear(), today.getMonth() - 1, day)
  }
  return formatISODate(candidate)
}

// Whole days between the resident's last due date and today — 0 if they're
// not actually behind (their balance is at most one month's rent, i.e. what
// they'd normally owe between now and their next due date).
export function daysOverdue(rentAmount: number, balanceAmount: number, joiningDate: string, today: Date = new Date()): number {
  if (!(balanceAmount > (rentAmount || 0))) return 0
  const last = lastDueDate(joiningDate, today)
  if (!last) return 0
  const diffMs = today.getTime() - new Date(last).getTime()
  return Math.max(0, Math.round(diffMs / 86400000))
}

// The next occurrence of the resident's joining-day-of-month, on or after
// today — same billing anniversary the balance calculation uses. Returns
// "YYYY-MM-DD", or "" if there's no valid joining date.
export function nextDueDate(joiningDate: string, today: Date = new Date()): string {
  const join = new Date(joiningDate)
  if (isNaN(join.getTime())) return ''
  const day = join.getDate()

  let candidate = clampToMonth(today.getFullYear(), today.getMonth(), day)
  if (candidate < today) {
    candidate = clampToMonth(today.getFullYear(), today.getMonth() + 1, day)
  }
  return `${candidate.getFullYear()}-${String(candidate.getMonth() + 1).padStart(2, '0')}-${String(
    candidate.getDate()
  ).padStart(2, '0')}`
}
