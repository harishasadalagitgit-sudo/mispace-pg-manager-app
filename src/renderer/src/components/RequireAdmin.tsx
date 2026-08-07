import { ReactNode } from 'react'
import { useAuth } from '../lib/auth'

export default function RequireAdmin({ children }: { children: ReactNode }): React.JSX.Element {
  const { role } = useAuth()
  if (role !== 'admin') {
    return (
      <div className="card empty-state">This screen is only available to Admin logins.</div>
    )
  }
  return <>{children}</>
}
