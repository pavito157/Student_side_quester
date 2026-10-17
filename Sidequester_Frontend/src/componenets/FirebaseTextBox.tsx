import useFirestoreDocument from '../hooks/useFirestoreDocument'
import { colors } from '../constants/colors'

interface FirebaseTextBoxProps {
  collectionName?: string
  documentId?: string
}

function FirebaseTextBox({
  collectionName = 'connection_tests',
  documentId = 'fastapi_test',
}: FirebaseTextBoxProps) {
  const state = useFirestoreDocument(collectionName, documentId)
  const content =
    state.status === 'ready'
      ? JSON.stringify(state.data, null, 2)
      : state.status === 'loading'
        ? 'Loading latest document data...'
        : state.status === 'not-found'
          ? 'This Firestore document does not exist.'
          : `Could not load document: ${state.message}`

  return (
    <section
      aria-labelledby="firebase-text-box-title"
      className="mt-6 rounded-2xl border p-4 sm:p-5"
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
      }}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="firebase-text-box-title" className="text-sm font-semibold">
          Firebase connection
        </h2>
        <span className="text-xs" style={{ color: colors.muted }}>
          {collectionName}/{documentId}
        </span>
      </div>
      <pre
        aria-live="polite"
        className="max-h-48 min-h-14 overflow-auto rounded-lg border p-3 text-xs leading-relaxed whitespace-pre-wrap break-words"
        style={{
          backgroundColor: colors.background,
          borderColor: colors.border,
          color: state.status === 'error' ? colors.error : colors.foreground,
        }}
      >
        {content}
      </pre>
    </section>
  )
}

export default FirebaseTextBox
