import { FormEvent, useEffect, useState } from 'react'
import { onPromptRequest, PromptRequest } from '../lib/promptDialog'

export default function PromptDialogHost(): React.JSX.Element | null {
  const [request, setRequest] = useState<PromptRequest | null>(null)
  const [value, setValue] = useState('')

  useEffect(() => {
    return onPromptRequest((req) => {
      setRequest(req)
      setValue(req.defaultValue)
    })
  }, [])

  if (!request) return null

  function submit(e: FormEvent): void {
    e.preventDefault()
    request!.resolve(value.trim() || null)
    setRequest(null)
  }

  function cancel(): void {
    request!.resolve(null)
    setRequest(null)
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
      }}
    >
      <form
        onSubmit={submit}
        className="card"
        style={{ width: 360, background: '#fff' }}
      >
        <div className="form-field">
          <label>{request.message}</label>
          <input value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
        </div>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary">
            OK
          </button>
          <button type="button" className="btn btn-secondary" onClick={cancel}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
