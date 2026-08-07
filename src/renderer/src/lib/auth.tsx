import { createContext, useContext, useState, ReactNode } from 'react'
import { checkSupervisorPassword } from './supervisorAuth'
import { checkAdminPassword } from './adminAuth'

export type Role = 'admin' | 'supervisor' | null

interface AuthValue {
  role: Role
  loginSupervisor: (password: string) => Promise<boolean>
  loginAdmin: (password: string) => Promise<boolean>
  logout: () => void
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [role, setRole] = useState<Role>(null)

  async function loginSupervisor(password: string): Promise<boolean> {
    const ok = await checkSupervisorPassword(password)
    if (ok) setRole('supervisor')
    return ok
  }

  async function loginAdmin(password: string): Promise<boolean> {
    const ok = await checkAdminPassword(password)
    if (ok) setRole('admin')
    return ok
  }

  function logout(): void {
    setRole(null)
  }

  return (
    <AuthContext.Provider value={{ role, loginSupervisor, loginAdmin, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
