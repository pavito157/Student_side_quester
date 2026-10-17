import useFirestoreDocument from '../hooks/useFirestoreDocument'
import TextBox from './TextBox'

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
    <div className="mt-6">
      <TextBox
        id="firebase-connection"
        title="Firebase connection"
        caption={`${collectionName}/${documentId}`}
        content={content}
        tone={state.status === 'error' ? 'error' : 'default'}
      />
    </div>
  )
}

export default FirebaseTextBox
