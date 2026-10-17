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

export async function getUserGoals(userId: string): Promise<string[]> {
  const snapshot = await getDoc(doc(db, 'Users', userId))
  if (!snapshot.exists()) return []

  const goals: unknown = snapshot.data().goals
  if (goals === undefined) return []
  if (!Array.isArray(goals) || !goals.every((goal) => typeof goal === 'string')) {
    throw new Error('Your saved goals are not a list of plain text items.')
  }

  return goals
}

export async function saveUserGoals(userId: string, goals: string[]): Promise<void> {
  const normalizedGoals = goals.map((goal) => goal.trim())
  if (normalizedGoals.some((goal) => !goal)) {
    throw new Error('Goals cannot be empty.')
  }

  await setDoc(doc(db, 'Users', userId), { goals: normalizedGoals }, { merge: true })
}
