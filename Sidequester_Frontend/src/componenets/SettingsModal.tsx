import { useEffect, useRef, useState } from 'react'
import {
  SignInButton,
  SignedIn,
  SignedOut,
  useClerk,
  useUser,
} from '@clerk/clerk-react'
import { colors } from '../constants/colors'
import { BackIcon, CloseIcon } from './icons'
import LocationPrivacySettings from './LocationPrivacySettings'
import PreferencesEditor from './PreferencesEditor'
import SettingsOptionButton from './SettingsOptionButton'

type SettingsSection = 'preferences' | 'location' | 'help'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [section, setSection] = useState<SettingsSection | null>(null)
  const { openUserProfile } = useClerk()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (isOpen && !dialog.open) dialog.showModal()
    if (!isOpen && dialog.open) dialog.close()
  }, [isOpen])

  function closeSettings() {
    setSection(null)
    onClose()
  }

  const title =
    section === 'preferences'
      ? 'Preferences'
      : section === 'location'
        ? 'Location & privacy'
        : section === 'help'
          ? 'Help & about'
          : 'Settings'

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="settings-title"
      onCancel={(event) => {
        event.preventDefault()
        closeSettings()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) closeSettings()
      }}
      className="m-auto max-h-[min(90dvh,48rem)] w-[min(92vw,32rem)] overflow-y-auto rounded-2xl border p-5 shadow-2xl backdrop:bg-black/60 sm:rounded-3xl sm:p-7"
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.border,
        color: colors.foreground,
      }}
    >
      <header className="mb-6 flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          {section && (
            <button
              type="button"
              aria-label="Back to settings"
              onClick={() => setSection(null)}
              className="inline-flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-xl border transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{
                color: colors.foreground,
                backgroundColor: colors.surfaceRaised,
                borderColor: colors.border,
                outlineColor: colors.primary,
              }}
            >
              <BackIcon />
            </button>
          )}
          <div className="min-w-0">
            {!section && (
              <p
                className="mb-1 text-[0.65rem] font-semibold uppercase tracking-[0.18em]"
                style={{ color: colors.primary }}
              >
                Personalize
              </p>
            )}
            <h2 id="settings-title" className="truncate text-xl font-semibold tracking-tight">
              {title}
            </h2>
          </div>
        </div>
        <button
          type="button"
          aria-label="Close settings"
          onClick={closeSettings}
          className="inline-flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-xl transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ color: colors.muted, outlineColor: colors.primary }}
        >
          <CloseIcon />
        </button>
      </header>

      {section === 'preferences' ? (
        <SignedIn>
          <UserPreferences />
        </SignedIn>
      ) : section === 'location' ? (
        <LocationPrivacySettings />
      ) : section === 'help' ? (
        <HelpAndAbout />
      ) : (
        <div className="space-y-3">
          <p className="mb-4 text-sm" style={{ color: colors.muted }}>
            Manage your account and personalize your Sidequester experience.
          </p>
          <SignedIn>
            <SettingsOptionButton
              title="Account & security"
              description="Manage your profile, sign-in methods, and account security."
              onClick={() => {
                closeSettings()
                openUserProfile()
              }}
            />
            <SettingsOptionButton
              title="Preferences"
              description="Save the activities and experiences you enjoy."
              onClick={() => setSection('preferences')}
            />
          </SignedIn>
          <SignedOut>
            <SignInButton mode="modal">
              <SettingsOptionButton
                title="Sign in to your account"
                description="Manage your profile and save your personal preferences."
                onClick={closeSettings}
              />
            </SignInButton>
          </SignedOut>
          <SettingsOptionButton
            title="Location & privacy"
            description="Check location permission and learn how location is used."
            onClick={() => setSection('location')}
          />
          <SettingsOptionButton
            title="Help & about"
            description="Learn how to use Sidequester and find quick answers."
            onClick={() => setSection('help')}
          />
        </div>
      )}
    </dialog>
  )
}

function UserPreferences() {
  const { user } = useUser()
  if (!user) return <p style={{ color: colors.muted }}>Loading account...</p>

  return <PreferencesEditor userId={user.id} />
}

function HelpAndAbout() {
  return (
    <div className="space-y-4 text-sm leading-relaxed">
      <section>
        <h3 className="font-semibold">How it works</h3>
        <p className="mt-1" style={{ color: colors.muted }}>
          Choose a place, how much time you have, and your budget. Sidequester will suggest an
          activity that fits. Custom time and budget options are available in their menus.
        </p>
      </section>
      <section>
        <h3 className="font-semibold">Location</h3>
        <p className="mt-1" style={{ color: colors.muted }}>
          Location is optional. You can choose a place manually or use the location button in
          the Where filter. Automatic location is only used when you’re signed in and have
          already allowed it in your browser.
        </p>
      </section>
      <section
        className="rounded-xl border p-4"
        style={{ backgroundColor: colors.surfaceRaised, borderColor: colors.border }}
      >
        <h3 className="font-semibold">About Sidequester</h3>
        <p className="mt-1" style={{ color: colors.muted }}>
          Sidequester helps you find small, approachable adventures that fit your day.
        </p>
      </section>
    </div>
  )
}

export default SettingsModal
