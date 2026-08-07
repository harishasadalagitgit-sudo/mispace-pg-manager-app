import { useCallback, useEffect, useState } from 'react'
import { collection, onSnapshot, orderBy, query, Query } from 'firebase/firestore'
import { db } from '../lib/firebase'

export function useCollection<T>(
  collectionName: string,
  orderByField?: string
): {
  data: (T & { id: string })[]
  loading: boolean
  error: string | null
  refetch: () => void
} {
  const [data, setData] = useState<(T & { id: string })[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Bumping this tears down and re-creates the listener below. Needed
  // because once onSnapshot hits an error (e.g. a permission-denied before
  // Firestore rules were deployed), that subscription is dead for good —
  // Firestore does not auto-resume it once rules are fixed.
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    setLoading(true)
    const colRef = collection(db, collectionName)
    const q: Query = orderByField ? query(colRef, orderBy(orderByField, 'desc')) : colRef

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setData(snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as T) })))
        setLoading(false)
        setError(null)
      },
      (err) => {
        console.error(`Collection listener error (${collectionName}):`, err)
        setError(err.message)
        setLoading(false)
      }
    )

    return unsubscribe
  }, [collectionName, orderByField, refreshKey])

  const refetch = useCallback(() => setRefreshKey((k) => k + 1), [])

  return { data, loading, error, refetch }
}
