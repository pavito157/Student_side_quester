import { useEffect, useRef } from 'react'
import {
  SignInButton,
  SignedIn,
  SignedOut,
  useClerk,
  useUser,
} from '@clerk/clerk-react'
import { colors } from '../../constants/colors'
import { BackIcon, CloseIcon } from '../icons'
import LocationPrivacySettings from './LocationPrivacySettings'
import PreferencesEditor from './PreferencesEditor'
import DormSettings from './DormSettings'
import UserGoals from '../UserGoals'
import SettingsOptionButton from './SettingsOptionButton'

export type SettingsSection = 'preferences' | 'goals' | 'location' | 'help' | 'dorm'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
  section: SettingsSection | null
  onSectionChange: (section: SettingsSection | null) => void
}

function SettingsModal({
  isOpen,
  onClose,
  section,
  onSectionChange,
}: SettingsModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const { openUserProfile } = useClerk()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (isOpen && !dialog.open) dialog.showModal()
    if (!isOpen && dialog.open) dialog.close()
  }, [isOpen])

  const title =
    section === 'preferences'
      ? 'Preferences'
      : section === 'goals'
        ? 'Goals'
        : section === 'location'
          ? 'Location & privacy'
          : section === 'help'
            ? 'Help & about'
            : section === 'dorm'
              ? 'Residence'
              : 'Settings'

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
      className="rpg-dialog m-auto max-h-[min(90dvh,48rem)] w-[min(92vw,32rem)] overflow-y-auto rounded-2xl border p-5 shadow-2xl backdrop:bg-black/60 sm:rounded-3xl sm:p-7"
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
              onClick={() => onSectionChange(null)}
              className="hud-button inline-flex size-10 shrink-0 cursor-pointer items-center justify-center transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{
                color: colors.foreground,
                backgroundColor: colors.surfaceRaised,
                borderColor: colors.border,
                outlineColor: colors.secondary,
              }}
            >
              <BackIcon />
            </button>
          )}
          <div className="min-w-0">
            {!section && (
              <p
                className="mb-1 text-[0.65rem] font-semibold uppercase tracking-[0.18em]"
                style={{ color: colors.secondary }}
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
          onClick={onClose}
          className="hud-button inline-flex size-10 shrink-0 cursor-pointer items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ color: colors.muted, outlineColor: colors.secondary }}
        >
          <CloseIcon />
        </button>
      </header>

      {section === 'preferences' ? (
        <SignedIn>
          <UserPreferences />
        </SignedIn>
      ) : section === 'goals' ? (
        <SignedIn>
          <UserGoals idPrefix="settings" />
        </SignedIn>
      ) : section === 'dorm' ? (
        <SignedIn>
          <UserDormSettings />
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
                onClose()
                openUserProfile()
              }}
            />
            <SettingsOptionButton
              title="Preferences"
              description="Set general preferences that guide your sidequest suggestions."
              onClick={() => onSectionChange('preferences')}
            />
            <SettingsOptionButton
              title="Goals"
              description="Add specific outcomes you want to work toward with sidequests."
              onClick={() => onSectionChange('goals')}
            />
            <SettingsOptionButton
              title="Residence"
              description="Choose or update your UF residence for dorm XP rankings."
              onClick={() => onSectionChange('dorm')}
            />
          </SignedIn>
          <SignedOut>
            <SignInButton mode="modal">
              <SettingsOptionButton
                title="Sign in to your account"
                description="Manage your profile and save your personal preferences."
                onClick={onClose}
              />
            </SignInButton>
          </SignedOut>
          <SettingsOptionButton
            title="Location & privacy"
            description="Check location permission and learn how location is used."
            onClick={() => onSectionChange('location')}
          />
          <SettingsOptionButton
            title="Help & about"
            description="Learn how to use Sidequester and find quick answers."
            onClick={() => onSectionChange('help')}
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

function UserDormSettings() {
  const { user } = useUser()
  if (!user) return <p style={{ color: colors.muted }}>Loading account…</p>

  return <DormSettings userId={user.id} />
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
        className="quest-tag rounded-xl p-4"
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
