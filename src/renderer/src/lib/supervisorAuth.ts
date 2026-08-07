// Shared password for the Supervisor login path — data entry only, no access
// to Approvals/Update Residents/Settings. Set/changed by an Admin in Settings.

const STORAGE_KEY = 'mispace_pg_supervisor_password_hash'

async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export function hasSupervisorPassword(): boolean {
  return Boolean(localStorage.getItem(STORAGE_KEY))
}

export async function setSupervisorPassword(password: string): Promise<void> {
  localStorage.setItem(STORAGE_KEY, await sha256(password))
}

export async function checkSupervisorPassword(password: string): Promise<boolean> {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (!stored) return false
  return (await sha256(password)) === stored
}
