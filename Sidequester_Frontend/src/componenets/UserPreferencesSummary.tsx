import { SignInButton, SignedIn, SignedOut, useUser } from '@clerk/clerk-react'
import useFirestoreDocument from '../hooks/useFirestoreDocument'
import { colors } from '../constants/colors'
import TextBox from './TextBox'

interface UserPreferencesSummaryProps {
  onEdit: () => void
}

function UserPreferencesSummary({ onEdit }: UserPreferencesSummaryProps) {
  return (
    <div className="mt-6">
      <SignedIn>
        <SignedInPreferences onEdit={onEdit} />
      </SignedIn>
      <SignedOut>
        <TextBox
          id="user-preferences"
          title="Your preferences"
          content="Sign in to save preferences that guide your sidequest suggestions."
          action={
            <SignInButton mode="modal">
              <button
                type="button"
                className="cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2"
                style={{
                  backgroundColor: colors.primary,
                  color: colors.primaryForeground,
                  outlineColor: colors.primary,
                }}
              >
                Sign in
              </button>
            </SignInButton>
          }
        />
      </SignedOut>
    </div>
  )
}

function SignedInPreferences({ onEdit }: UserPreferencesSummaryProps) {
  const { user } = useUser()

  if (!user) {
    return (
      <TextBox
        id="user-preferences"
        title="Your preferences"
        content="Loading your saved preferences…"
      />
    )
  }

  return <PreferencesTextBox userId={user.id} onEdit={onEdit} />
}

function PreferencesTextBox({
  userId,
  onEdit,
}: UserPreferencesSummaryProps & { userId: string }) {
  const state = useFirestoreDocument('Users', userId)
  const savedValue =
    state.status === 'ready' ? state.data.preferences : undefined
  const hasInvalidValue = savedValue !== undefined && typeof savedValue !== 'string'
  const content =
    state.status === 'loading'
      ? 'Loading your saved preferences…'
      : state.status === 'error'
        ? `Could not load preferences: ${state.message}`
        : hasInvalidValue
          ? 'Your saved preferences are not plain text.'
          : typeof savedValue === 'string' && savedValue.trim()
            ? savedValue
            : 'No preferences saved yet. Add preferences to guide your sidequest suggestions.'

  return (
    <TextBox
      id="user-preferences"
      title="Your preferences/goals"
      caption="Used to personalize sidequests/have goals for AI. Not shared with other users."
      content={content}
      tone={state.status === 'error' || hasInvalidValue ? 'error' : 'default'}
      action={
        <button
          type="button"
          onClick={onEdit}
          className="cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{
            backgroundColor: colors.primary,
            color: colors.primaryForeground,
            outlineColor: colors.primary,
          }}
        >
          Edit preferences
        </button>
      }
    />
  )
}

export default UserPreferencesSummary
