import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
  Timestamp,
} from 'firebase/firestore'
import { db } from '../configs/FirebaseConfig'
import type { Vibe, VibeInput } from '../types/vibe'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readTimestamp(value: unknown, fieldName: string): string | undefined {
  if (value === undefined || value === null) return undefined
  if (!(value instanceof Timestamp)) {
    throw new Error(`Your saved vibe has an invalid ${fieldName} timestamp.`)
  }

  return value.toDate().toISOString()
}

function readVibe(id: string, value: unknown): Vibe {
  if (!isRecord(value)) {
    throw new Error('A saved vibe has an invalid format.')
  }

  const {
    name,
    preferences,
    where,
    time,
    budget,
    distance,
    customTime,
    customBudget,
    customDistance,
  } = value
  if (
    typeof name !== 'string' ||
    typeof preferences !== 'string' ||
    typeof where !== 'string' ||
    typeof time !== 'string' ||
    typeof budget !== 'string' ||
    (distance !== undefined && typeof distance !== 'string') ||
    (customTime !== undefined && typeof customTime !== 'string') ||
    (customBudget !== undefined && typeof customBudget !== 'string') ||
    (customDistance !== undefined && typeof customDistance !== 'string')
  ) {
    throw new Error('A saved vibe contains invalid fields.')
  }

  return {
    id,
    name,
    preferences,
    where,
    time,
    budget,
    distance: typeof distance === 'string' ? distance : 'any',
    customTime: customTime ?? '',
    customBudget: customBudget ?? '',
    customDistance: customDistance ?? '',
    createdAt: readTimestamp(value.createdAt, 'createdAt'),
    updatedAt: readTimestamp(value.updatedAt, 'updatedAt'),
  }
}

function normalizeVibe(vibe: VibeInput): VibeInput {
  const normalized = {
    name: vibe.name.trim(),
    preferences: vibe.preferences.trim(),
    where: vibe.where.trim(),
    time: vibe.time.trim(),
    budget: vibe.budget.trim(),
    distance: vibe.distance.trim(),
    customTime: vibe.customTime?.trim() ?? '',
    customBudget: vibe.customBudget?.trim() ?? '',
    customDistance: vibe.customDistance?.trim() ?? '',
  }

  if (!normalized.name || !normalized.preferences) {
    throw new Error('A vibe needs a name and preferences.')
  }
  if (!['any', '30', '60', '120', 'custom'].includes(normalized.time)) {
    throw new Error('Choose a valid time filter before saving this vibe.')
  }
  if (!['any', '0', '10', '10-25', 'custom'].includes(normalized.budget)) {
    throw new Error('Choose a valid budget filter before saving this vibe.')
  }
  if (!['any', '1', '5', '10', '25', 'custom'].includes(normalized.distance)) {
    throw new Error('Choose a valid distance filter before saving this vibe.')
  }
  if (
    normalized.time === 'custom' &&
    (!/^\d+$/.test(normalized.customTime) || Number(normalized.customTime) <= 0)
  ) {
    throw new Error('Custom time must be a whole number of minutes greater than zero.')
  }
  if (
    normalized.budget === 'custom' &&
    (normalized.customBudget === '' ||
      !Number.isFinite(Number(normalized.customBudget)) ||
      Number(normalized.customBudget) < 0)
  ) {
    throw new Error('Enter a valid non-negative custom budget.')
  }
  if (
    normalized.distance === 'custom' &&
    (normalized.customDistance === '' ||
      !Number.isFinite(Number(normalized.customDistance)) ||
      Number(normalized.customDistance) <= 0)
  ) {
    throw new Error('Enter a valid custom distance greater than zero miles.')
  }

  return normalized
}

function vibesCollection(userId: string) {
  if (!userId.trim()) throw new Error('Sign in to manage your saved vibes.')
  return collection(db, 'Users', userId, 'vibes')
}

export async function getUserVibes(userId: string): Promise<Vibe[]> {
  const snapshot = await getDocs(vibesCollection(userId))
  return snapshot.docs
    .map((vibeDocument) => readVibe(vibeDocument.id, vibeDocument.data()))
    .sort((first, second) =>
      (second.updatedAt ?? second.createdAt ?? '').localeCompare(
        first.updatedAt ?? first.createdAt ?? '',
      ),
    )
}

export async function saveUserVibe(
  userId: string,
  vibe: VibeInput,
  vibeId?: string,
): Promise<Vibe> {
  const normalized = normalizeVibe(vibe)
  const collectionRef = vibesCollection(userId)

  if (vibeId) {
    await setDoc(
      doc(collectionRef, vibeId),
      { ...normalized, updatedAt: serverTimestamp() },
      { merge: true },
    )
    return { ...normalized, id: vibeId }
  }

  const vibeDocument = await addDoc(collectionRef, {
    ...normalized,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return { ...normalized, id: vibeDocument.id }
}

export async function deleteUserVibe(userId: string, vibeId: string): Promise<void> {
  if (!vibeId.trim()) throw new Error('A saved vibe ID is required.')
  await deleteDoc(doc(vibesCollection(userId), vibeId))
}
