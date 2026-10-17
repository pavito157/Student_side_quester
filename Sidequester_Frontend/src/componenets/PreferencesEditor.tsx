import { useEffect, useState } from 'react'
import { colors } from '../constants/colors'
import { getUserPreferences, saveUserPreferences } from '../services/userPreferences'

interface PreferencesEditorProps {
  userId: string
}

function PreferencesEditor({ userId }: PreferencesEditorProps) {
  const [preferences, setPreferences] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [savedMessage, setSavedMessage] = useState('')

  useEffect(() => {
    let isCurrent = true

    async function loadPreferences() {
      try {
        const savedPreferences = await getUserPreferences(userId)
        if (isCurrent) setPreferences(savedPreferences)
      } catch (error) {
        if (isCurrent) {
          setErrorMessage(
            error instanceof Error ? error.message : 'Could not load preferences.',
          )
        }
      } finally {
        if (isCurrent) setIsLoading(false)
      }
    }

    void loadPreferences()
    return () => {
      isCurrent = false
    }
  }, [userId])

  async function handleSave() {
    setIsSaving(true)
    setErrorMessage('')
    setSavedMessage('')

    try {
      await saveUserPreferences(userId, preferences)
      setSavedMessage('Preferences saved.')
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Could not save preferences.',
      )
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div>
      <label
        htmlFor="user-preferences"
        className="mb-2 block text-sm font-semibold"
        style={{ color: colors.secondary }}
      >
        Your general preferences
      </label>
      <p className="mb-3 text-sm leading-relaxed" style={{ color: colors.muted }}>
        These are general preferences that stay consistent across your sidequesting and can
        guide suggestions. For example: “I like going out and learning new things.” Add
        specific things you want to accomplish in Goals.
      </p>
      <textarea
        id="user-preferences"
        value={preferences}
        onChange={(event) => {
          setPreferences(event.target.value)
          setSavedMessage('')
        }}
        disabled={isLoading || isSaving}
        maxLength={5000}
        rows={6}
        placeholder="For example: I like free outdoor activities and small group events."
        className="w-full resize-y rounded-xl border px-4 py-3 text-sm leading-relaxed outline-none transition focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60"
        style={{
          backgroundColor: colors.background,
          borderColor: colors.border,
          color: colors.foreground,
          outlineColor: colors.primary,
        }}
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="text-xs" style={{ color: colors.muted }}>
          {preferences.length}/5000 characters
        </p>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={isLoading || isSaving}
          className="cursor-pointer rounded-lg px-4 py-2.5 text-sm font-semibold transition-all hover:-translate-y-0.5 hover:brightness-110 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50"
          style={{ backgroundColor: colors.primary, color: colors.primaryForeground }}
        >
          {isLoading ? 'Loading...' : isSaving ? 'Saving...' : 'Save preferences'}
        </button>
      </div>
      {(errorMessage || savedMessage) && (
        <p
          role={errorMessage ? 'alert' : 'status'}
          className="mt-3 text-sm"
          style={{ color: errorMessage ? colors.error : colors.success }}
        >
          {errorMessage || savedMessage}
        </p>
      )}
    </div>
  )
}

export default PreferencesEditor
