import type {
  DocumentData,
  DocumentReference,
  Transaction,
} from 'firebase/firestore'

export type UserRequestMetadata = {
  email: string | null
  username: string
  requestCount: number
  xp: number
}

export function getNextRequestCount(userData: DocumentData | undefined): number {
  const currentCount: unknown = userData?.requestCount
  if (currentCount === undefined) return 1
  if (
    typeof currentCount !== 'number' ||
    !Number.isSafeInteger(currentCount) ||
    currentCount < 0
  ) {
    throw new Error('Your saved request count is invalid.')
  }

  return currentCount + 1
}

export function getUserXp(userData: DocumentData | undefined): number {
  const xp: unknown = userData?.xp
  if (xp === undefined) return 0
  if (typeof xp !== 'number' || !Number.isSafeInteger(xp) || xp < 0) {
    throw new Error('Your saved XP value is invalid.')
  }

  return xp
}

export function stageUserRequestMetadata(
  transaction: Transaction,
  userRef: DocumentReference,
  metadata: UserRequestMetadata,
): void {
  transaction.set(userRef, metadata, { merge: true })
}
