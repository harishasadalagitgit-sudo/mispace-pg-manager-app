import { useEffect, useState } from 'react'
import { onToast } from '../lib/toast'

export default function Toast(): React.JSX.Element | null {
  const [msg, setMsg] = useState<{ text: string; kind: 'info' | 'error' } | null>(null)

  useEffect(() => {
    const unsubscribe = onToast((text, kind) => {
      setMsg({ text, kind })
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(null), 3200)
    return () => clearTimeout(t)
  }, [msg])

  if (!msg) return null
  return <div className={`toast ${msg.kind === 'error' ? 'error' : ''}`}>{msg.text}</div>
}
