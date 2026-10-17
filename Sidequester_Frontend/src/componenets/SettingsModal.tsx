import { useEffect, useRef, useState } from 'react'
import {
  SignInButton,
  SignedIn,
  SignedOut,
  useUser,
} from '@clerk/clerk-react'
import { colors } from '../constants/colors'
import PreferencesEditor from './PreferencesEditor'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [showPreferences, setShowPreferences] = useState(false)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (isOpen && !dialog.open) dialog.showModal()
    if (!isOpen && dialog.open) dialog.close()
  }, [isOpen])

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="settings-title"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
      className="m-auto w-[min(92vw,32rem)] rounded-2xl border p-5 shadow-2xl backdrop:bg-black/60 sm:p-7"
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        color: colors.foreground,
      }}
    >
      <header className="mb-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {showPreferences && (
            <button
              type="button"
              aria-label="Back to settings"
              onClick={() => setShowPreferences(false)}
              className="rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-white/10"
              style={{ color: colors.muted }}
            >
              Back
            </button>
          )}
          <h2 id="settings-title" className="text-xl font-semibold">
            {showPreferences ? 'Preferences' : 'Settings'}
          </h2>
        </div>
        <button
          type="button"
          aria-label="Close settings"
          onClick={onClose}
          className="rounded-lg px-3 py-2 text-sm transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ color: colors.muted, outlineColor: colors.primary }}
        >
          Close
        </button>
      </header>

      {showPreferences ? (
        <SignedIn>
          <UserPreferences />
        </SignedIn>
      ) : (
        <SignedIn>
          <div>
            <p className="mb-4 text-sm" style={{ color: colors.muted }}>
              Personalize your Sidequester experience.
            </p>
            <button
              type="button"
              onClick={() => setShowPreferences(true)}
              className="w-full rounded-xl border p-4 text-left transition-colors hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{
                backgroundColor: colors.surfaceRaised,
                borderColor: colors.border,
                color: colors.foreground,
                outlineColor: colors.primary,
              }}
            >
              <span className="block font-medium">Preferences</span>
              <span className="mt-1 block text-sm" style={{ color: colors.muted }}>
                Save the activities and experiences you enjoy.
              </span>
            </button>
          </div>
        </SignedIn>
      )}

      <SignedOut>
        <div>
          <p className="mb-4 text-sm" style={{ color: colors.muted }}>
            Sign in to manage your personal preferences.
          </p>
          <SignInButton mode="modal">
            <button
              type="button"
              className="rounded-lg px-4 py-2.5 text-sm font-semibold"
              style={{ backgroundColor: colors.primary, color: colors.primaryForeground }}
            >
              Sign in
            </button>
          </SignInButton>
        </div>
      </SignedOut>
    </dialog>
  )
}

function UserPreferences() {
  const { user } = useUser()
  if (!user) return <p style={{ color: colors.muted }}>Loading account...</p>

  return <PreferencesEditor userId={user.id} />
}

export default SettingsModal
