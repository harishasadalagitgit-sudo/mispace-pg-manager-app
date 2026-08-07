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
