function escapeCsvField(value: unknown): string {
  const str = String(value ?? '')
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export function toCSV(rows: Record<string, unknown>[], columns: string[]): string {
  const header = columns.join(',')
  const body = rows
    .map((row) => columns.map((col) => escapeCsvField(row[col])).join(','))
    .join('\n')
  return `${header}\n${body}`
}
