import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'

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
export const db = getFirestore(app)
