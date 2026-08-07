// Electron never implements window.prompt() (it throws "not supported" and
// crashes the renderer). This is a drop-in async replacement backed by a
// real React modal — mount <PromptDialogHost /> once near the app root.

export interface PromptRequest {
  message: string
  defaultValue: string
  resolve: (value: string | null) => void
}

type Listener = (request: PromptRequest) => void

const listeners = new Set<Listener>()

export function onPromptRequest(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function promptText(message: string, defaultValue = ''): Promise<string | null> {
  return new Promise((resolve) => {
    if (listeners.size === 0) {
      console.error('PromptDialogHost is not mounted; cannot show prompt:', message)
      resolve(null)
      return
    }
    listeners.forEach((l) => l({ message, defaultValue, resolve }))
  })
}
