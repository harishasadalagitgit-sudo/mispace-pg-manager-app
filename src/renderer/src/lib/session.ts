// Who is currently sitting at the keyboard. No real auth — just a name tag
// so entries record who entered/reviewed them. Persists per machine.

const STORAGE_KEY = 'mispace_pg_current_user_name'

export function getCurrentUserName(): string {
  return localStorage.getItem(STORAGE_KEY) || ''
}

export function setCurrentUserName(name: string): void {
  localStorage.setItem(STORAGE_KEY, name.trim())
}
