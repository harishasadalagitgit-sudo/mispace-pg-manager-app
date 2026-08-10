import { initializeApp } from 'firebase/app'
import { initializeFirestore, persistentLocalCache, persistentSingleTabManager } from 'firebase/firestore'

// Same Firebase project as the MiSpace PG website
// (https://github.com/harishasadalagitgit-sudo/paying-guest-manager-2026)
// so both apps read/write the exact same live database.
const firebaseConfig = {
  projectId: 'mispacepgmanager',
  appId: '1:628733556792:web:ce5078118781de1ed34ecd',
  apiKey: 'AIzaSyAFhxJHKmV1bU9jIXNtrDY-2YvbjjZuBzY',
  authDomain: 'mispacepgmanager.firebaseapp.com',
  storageBucket: 'mispacepgmanager.firebasestorage.app',
  messagingSenderId: '628733556792'
}

const app = initializeApp(firebaseConfig)

// Persist reads/writes to IndexedDB — if the network drops mid-entry, the
// write is queued on disk (survives an app restart, not just an in-memory
// queue) and Firestore automatically retries it once connectivity returns.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentSingleTabManager({}) })
})
