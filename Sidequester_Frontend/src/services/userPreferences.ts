import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../configs/FirebaseConfig'

export async function getUserPreferences(userId: string): Promise<string> {
  const snapshot = await getDoc(doc(db, 'Users', userId))
  if (!snapshot.exists()) return ''

  const preferences: unknown = snapshot.data().preferences
  if (preferences === undefined) return ''
  if (typeof preferences !== 'string') {
    throw new Error('Your saved preferences are not plain text.')
  }

  return preferences
}

export async function saveUserPreferences(
  userId: string,
  preferences: string,
): Promise<void> {
  await setDoc(
    doc(db, 'Users', userId),
    { preferences },
    { merge: true },
  )
}
