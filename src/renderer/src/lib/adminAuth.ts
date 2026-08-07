// Admin password — shared with the website's admin login, not just this
// machine. Stored as a SHA-256 hash in Firestore (appSettings/sharedAdmin)
// so changing it in either place (desktop Settings or the website) keeps
// both in sync.

import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from './firebase'

const DOC_REF = () => doc(db, 'appSettings', 'sharedAdmin')

async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function setAdminPassword(password: string): Promise<void> {
  await setDoc(DOC_REF(), { adminPasswordHash: await sha256(password) }, { merge: true })
}

export async function checkAdminPassword(password: string): Promise<boolean> {
  const snap = await getDoc(DOC_REF())
  const stored = snap.exists() ? (snap.data().adminPasswordHash as string | undefined) : undefined
  if (!stored) return false
  return (await sha256(password)) === stored
}
