import { useEffect, useState, type FormEvent } from 'react'
import { colors } from '../constants/colors'
import { getUserGoals, saveUserGoals } from '../services/userPreferences'

interface GoalsEditorProps {
  userId: string
  idPrefix: string
  compact?: boolean
}

function GoalsEditor({ userId, idPrefix, compact = false }: GoalsEditorProps) {
  const [goals, setGoals] = useState<string[]>([])
  const [newGoal, setNewGoal] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [statusMessage, setStatusMessage] = useState('')

  useEffect(() => {
    let isCurrent = true

    async function loadGoals() {
      try {
        const savedGoals = await getUserGoals(userId)
        if (isCurrent) setGoals(savedGoals)
      } catch (error) {
        if (isCurrent) {
          setErrorMessage(error instanceof Error ? error.message : 'Could not load your goals.')
        }
      } finally {
        if (isCurrent) setIsLoading(false)
      }
    }

    void loadGoals()
    return () => {
      isCurrent = false
    }
  }, [userId])

  function addGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const goal = newGoal.trim()
    if (!goal) return

    setGoals((currentGoals) => [...currentGoals, goal])
    setNewGoal('')
    setErrorMessage('')
    setStatusMessage('')
  }

  function removeGoal(indexToRemove: number) {
    setGoals((currentGoals) => currentGoals.filter((_, index) => index !== indexToRemove))
    setErrorMessage('')
    setStatusMessage('')
  }

  async function handleSave() {
    setIsSaving(true)
    setErrorMessage('')
    setStatusMessage('')

    try {
      await saveUserGoals(userId, goals)
      setStatusMessage('Goals saved.')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Could not save your goals.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className={compact ? 'space-y-3' : 'space-y-4'}>
      {!compact && (
        <div>
        <p className="text-sm leading-relaxed" style={{ color: colors.muted }}>
          Add specific outcomes you want your sidequests to help you work toward. These are
          saved with your account and kept separate from your general preferences.
        </p>
        </div>
      )}

      <form onSubmit={addGoal} className="space-y-2">
        <label
          htmlFor={`${idPrefix}-new-user-goal`}
          className="block text-xs font-semibold uppercase tracking-wide"
          style={{ color: colors.secondary }}
        >
          Add a goal
        </label>
        <div className="flex gap-2">
          <input
            id={`${idPrefix}-new-user-goal`}
            type="text"
            value={newGoal}
            onChange={(event) => setNewGoal(event.target.value)}
            disabled={isLoading || isSaving}
            maxLength={240}
            placeholder={compact ? 'Add a goal to work toward…' : 'e.g. Meet someone with a different major'}
            className="min-h-11 min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm placeholder:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60"
            style={{
              backgroundColor: colors.background,
              borderColor: colors.border,
              color: colors.foreground,
              outlineColor: colors.primary,
            }}
          />
          <button
            type="submit"
            disabled={isLoading || isSaving || !newGoal.trim()}
            className="min-h-11 shrink-0 cursor-pointer rounded-lg px-4 text-sm font-semibold transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              backgroundColor: colors.primary,
              color: colors.primaryForeground,
              outlineColor: colors.primary,
            }}
          >
            Add
          </button>
        </div>
      </form>

      <section aria-label="Your goals">
        <h3
          className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide"
          style={{ color: colors.secondary }}
        >
          <span>Your goal list</span>
          {!isLoading && (
            <span className="rounded-full px-2 py-0.5" style={{ backgroundColor: colors.warningBackground }}>
              {goals.length}
            </span>
          )}
        </h3>
        {isLoading ? (
          <p className="rounded-lg border p-3 text-sm" style={{ color: colors.muted, borderColor: colors.border }}>
            Loading your goals…
          </p>
        ) : goals.length ? (
          <ul className={compact ? 'space-y-2' : 'max-h-64 space-y-2 overflow-y-auto pr-1'}>
            {goals.map((goal, index) => (
              <li
                key={`${goal}-${index}`}
                className="flex items-start justify-between gap-3 rounded-lg border border-l-2 p-3"
                style={{
                  backgroundColor: colors.surfaceRaised,
                  borderColor: colors.border,
                  borderLeftColor: colors.secondary,
                }}
              >
                <span className="min-w-0 break-words text-sm leading-relaxed">
                  <span
                    aria-hidden="true"
                    className="mr-2 inline-block size-1.5 -translate-y-0.5 rounded-full"
                    style={{ backgroundColor: colors.secondary }}
                  />
                  {goal}
                </span>
                <button
                  type="button"
                  aria-label={`Remove goal: ${goal}`}
                  onClick={() => removeGoal(index)}
                  disabled={isSaving}
                  className="shrink-0 cursor-pointer rounded-md px-2 py-1 text-xs font-medium transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"
                  style={{ color: colors.secondary, outlineColor: colors.secondary }}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-lg border p-3 text-sm leading-relaxed" style={{ color: colors.muted, borderColor: colors.border }}>
            No goals yet. Add one above to help shape the sidequests you choose.
          </p>
        )}
      </section>

      <div
        className={`flex flex-wrap items-center justify-between gap-3 border-t ${
          compact ? 'pt-3' : 'pt-4'
        }`}
        style={{ borderColor: colors.border }}
      >
        <div aria-live="polite" className="min-w-0 flex-1">
          {(errorMessage || statusMessage) && (
            <p
              role={errorMessage ? 'alert' : 'status'}
              className="text-sm"
              style={{ color: errorMessage ? colors.error : colors.success }}
            >
              {errorMessage || statusMessage}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={isLoading || isSaving}
          className="cursor-pointer rounded-lg px-4 py-2.5 text-sm font-semibold transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            backgroundColor: colors.primary,
            color: colors.primaryForeground,
            outlineColor: colors.primary,
          }}
        >
          {isSaving ? 'Saving…' : 'Save goals'}
        </button>
      </div>
    </div>
  )
}

export default GoalsEditor
