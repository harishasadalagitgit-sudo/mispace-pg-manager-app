import { collection, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore'
import { db } from './firebase'

// Mirrors the website's occupancy rebuilder, scoped to one room — keeps
// rooms.occupiedCount/status correct after a desktop-side resident change,
// without needing the website's AdminPortal open to recalculate it.
export async function recalculateRoomOccupancy(roomNum: string): Promise<void> {
  if (!roomNum) return
  const roomRef = doc(db, 'rooms', roomNum)
  const roomSnap = await getDoc(roomRef)
  if (!roomSnap.exists()) return
  const capacity = (roomSnap.data().capacity as number) || 6

  const residentsSnap = await getDocs(
    query(collection(db, 'residents'), where('roomNum', '==', roomNum))
  )
  const count = residentsSnap.size
  const status = count >= capacity ? 'fully-occupied' : count > 0 ? 'partially-occupied' : 'vacant'
  await setDoc(roomRef, { occupiedCount: count, status }, { merge: true })
}
