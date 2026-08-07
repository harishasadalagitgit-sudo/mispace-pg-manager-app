type ToastKind = 'info' | 'error'
type Listener = (message: string, kind: ToastKind) => void

const listeners = new Set<Listener>()

export function onToast(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function showToast(message: string, kind: ToastKind = 'info'): void {
  listeners.forEach((l) => l(message, kind))
}
