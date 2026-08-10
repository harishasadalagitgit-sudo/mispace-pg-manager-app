import { useEffect, useState } from 'react'

// Tracks browser-reported connectivity. Chromium's navigator.onLine is
// pessimistic (false only when the OS reports no network interface at all,
// true even on a flaky/captive-portal connection) but it's a reasonable
// signal for showing the user an "offline" indicator.
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(navigator.onLine)

  useEffect(() => {
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  return online
}

// Firestore's write promises only resolve once the server acknowledges the
// write — offline, they just hang forever. Since db writes are backed by
// persistentLocalCache (see firebase.ts), the write is already safely
// queued on disk the moment this function is called, and Firestore will
// retry it automatically once connectivity returns — so we don't need to
// keep the UI blocked waiting for that server round-trip. This races the
// real write against a short timeout: if the server acks in time, the
// caller gets a normal "synced" result; otherwise we tell the caller the
// write is queued so it can show that in the UI, while the write keeps
// running in the background and will complete on its own.
export async function writeWithOfflineFallback(
  write: Promise<unknown>,
  timeoutMs = 4000
): Promise<'synced' | 'queued'> {
  let timedOut = false
  const result = await Promise.race([
    write.then((): 'synced' => 'synced'),
    new Promise<'queued'>((resolve) =>
      setTimeout(() => {
        timedOut = true
        resolve('queued')
      }, timeoutMs)
    )
  ])
  // Surface a write that fails only after we've already told the user
  // it's "queued" — a real error (not just slow/offline) still needs to
  // reach them, just asynchronously since the timeout already won the race.
  if (timedOut) {
    write.catch((err) => {
      console.error('Background write failed after being reported as queued:', err)
    })
  }
  return result
}
