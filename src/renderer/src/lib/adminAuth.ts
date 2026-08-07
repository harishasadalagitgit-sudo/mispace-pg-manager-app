// Shared password for the Admin (approver) login path — unlocks Approvals,
// Update Residents, and Settings. Same shape as supervisorAuth.ts; kept as a
// separate store/key so the two passwords are independent.

const STORAGE_KEY = 'mispace_pg_admin_password_hash'

async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export function hasAdminPassword(): boolean {
  return Boolean(localStorage.getItem(STORAGE_KEY))
}

export async function setAdminPassword(password: string): Promise<void> {
  localStorage.setItem(STORAGE_KEY, await sha256(password))
}

export async function checkAdminPassword(password: string): Promise<boolean> {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (!stored) return false
  return (await sha256(password)) === stored
}
