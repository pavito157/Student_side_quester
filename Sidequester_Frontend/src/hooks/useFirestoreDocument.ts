import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../configs/FirebaseConfig'

export type FirestoreDocumentState =
  | { status: 'loading' }
  | { status: 'not-found' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: Record<string, unknown> }

interface KeyedDocumentState {
  key: string
  state: FirestoreDocumentState
}

function useFirestoreDocument(collectionName: string, documentId: string) {
  const requestKey = JSON.stringify([collectionName, documentId])
  const [storedState, setStoredState] = useState<KeyedDocumentState>({
    key: requestKey,
    state: { status: 'loading' },
  })

  useEffect(() => {
    const key = JSON.stringify([collectionName, documentId])
    const documentReference = doc(db, collectionName, documentId)
    const unsubscribe = onSnapshot(
      documentReference,
      (snapshot) => {
        if (!snapshot.exists()) {
          setStoredState({ key, state: { status: 'not-found' } })
          return
        }

        setStoredState({
          key,
          state: {
            status: 'ready',
            data: snapshot.data(),
          },
        })
      },
      (error: Error) => {
        setStoredState({
          key,
          state: { status: 'error', message: error.message },
        })
      },
    )

    return unsubscribe
  }, [collectionName, documentId])

  return storedState.key === requestKey
    ? storedState.state
    : { status: 'loading' as const }
}

export default useFirestoreDocument
