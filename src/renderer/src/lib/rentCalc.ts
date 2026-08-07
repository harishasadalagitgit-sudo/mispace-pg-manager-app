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
