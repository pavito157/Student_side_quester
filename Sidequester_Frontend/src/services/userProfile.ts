import type {
  DocumentData,
  DocumentReference,
  Transaction,
} from 'firebase/firestore'

export type UserRequestMetadata = {
  email: string | null
  requestCount: number
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

export function stageUserRequestMetadata(
  transaction: Transaction,
  userRef: DocumentReference,
  metadata: UserRequestMetadata,
): void {
  transaction.set(userRef, metadata, { merge: true })
}
