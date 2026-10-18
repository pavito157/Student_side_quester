import { useEffect, useRef, useState } from 'react'
import { colors } from '../../constants/colors'
import {
  getOrganizationQuestBoard,
  MAX_ACTIVE_QUESTS,
  type OrganizationQuestBoardItem,
} from '../../services/questAssignment'
import type { ActiveSidequest } from '../../types/sidequest'

type BoardState =
  | { status: 'loading' }
  | { status: 'ready'; quests: OrganizationQuestBoardItem[] }
  | { status: 'error'; message: string }

type OrganizationQuestBoardProps = {
  userId: string | null
  activeQuests: ActiveSidequest[]
  onAccept: (userId: string, organizationId: string, questId: string) => Promise<void>
}

function OrganizationQuestBoard({
  userId,
  activeQuests,
  onAccept,
}: OrganizationQuestBoardProps) {
  const acceptingRef = useRef(false)
  const [boardState, setBoardState] = useState<BoardState>({ status: 'loading' })
  const [acceptingId, setAcceptingId] = useState<string | null>(null)
  const [acceptError, setAcceptError] = useState<{ key: string; message: string } | null>(null)
  const [reloadCount, setReloadCount] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    void getOrganizationQuestBoard({ signal: controller.signal }).then(
      (quests) => setBoardState({ status: 'ready', quests }),
      (error: unknown) => {
        if (!controller.signal.aborted) {
          setBoardState({
            status: 'error',
            message: error instanceof Error ? error.message : 'Could not load organization quests.',
          })
        }
      },
    )
    return () => controller.abort()
  }, [reloadCount])

  async function accept(quest: OrganizationQuestBoardItem) {
    if (!userId || acceptingRef.current) return
    acceptingRef.current = true
    const key = `${quest.organizationId}/${quest.questId}`
    setAcceptingId(key)
    setAcceptError(null)
    try {
      await onAccept(userId, quest.organizationId, quest.questId)
    } catch (error) {
      setAcceptError({
        key,
        message: error instanceof Error ? error.message : 'Could not accept this organization quest.',
      })
    } finally {
      acceptingRef.current = false
      setAcceptingId(null)
    }
  }

  return (
    <section
      id="organization-quest-board"
      aria-labelledby="organization-quest-board-title"
      className="rpg-panel mt-8 p-5 sm:p-7"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em]" style={{ color: colors.secondary }}>
            Community quests
          </p>
          <h2 id="organization-quest-board-title" className="mt-1 text-2xl font-black">
            Organization quest board
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed" style={{ color: colors.muted }}>
            Browse quests shared by local organizations. Accept one to generate your sidequest.
          </p>
        </div>
        <p className="text-xs font-semibold" style={{ color: colors.muted }}>
          {userId
            ? `${activeQuests.length} of ${MAX_ACTIVE_QUESTS} sidequest slots used`
            : 'Browse freely · Sign in to accept'}
        </p>
      </div>

      {boardState.status === 'loading' ? (
        <p role="status" className="mt-5 rounded-xl border p-4 text-sm" style={{ borderColor: colors.border, color: colors.muted }}>
          Loading community quests…
        </p>
      ) : boardState.status === 'error' ? (
        <div className="mt-5 rounded-xl border p-4" role="alert"
          style={{ borderColor: colors.errorBorder, backgroundColor: colors.errorBackground }}>
          <p className="text-sm" style={{ color: colors.error }}>{boardState.message}</p>
          <button
            type="button"
            className="mt-3 rounded-lg border px-3 py-2 text-sm font-semibold"
            style={{ borderColor: colors.border, color: colors.foreground }}
            onClick={() => {
              setBoardState({ status: 'loading' })
              setReloadCount((count) => count + 1)
            }}
          >
            Retry
          </button>
        </div>
      ) : boardState.quests.length === 0 ? (
        <p role="status" className="mt-5 rounded-xl border p-4 text-sm" style={{ borderColor: colors.border, color: colors.muted }}>
          No organization quests are posted right now. Check back later.
        </p>
      ) : (
        <ul className="mt-5 grid gap-4 lg:grid-cols-2">
          {boardState.quests.map((quest) => {
            const key = `${quest.organizationId}/${quest.questId}`
            const alreadyActive = activeQuests.some((active) =>
              active.sourceOrganizationId === quest.organizationId
              && active.sourceOrganizationQuestId === quest.questId)
            const full = activeQuests.length >= MAX_ACTIVE_QUESTS
            const accepting = acceptingId === key
            return (
              <li key={key} className="flex min-w-0 flex-col rounded-xl border p-4 sm:p-5"
                style={{ borderColor: colors.border, backgroundColor: colors.surfaceRaised }}>
                <p className="text-xs font-bold uppercase tracking-wide" style={{ color: colors.secondary }}>
                  {quest.organizationName}
                </p>
                <h3 className="mt-2 break-words text-lg font-black">{quest.title}</h3>
                <p className="mt-2 text-sm leading-relaxed" style={{ color: colors.muted }}>
                  {quest.summary}
                </p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full border px-3 py-1.5" style={{ borderColor: colors.border }}>
                    {quest.timeLabel}
                  </span>
                  <span className="rounded-full border px-3 py-1.5" style={{ borderColor: colors.border }}>
                    Gemini-generated · saved to your quests
                  </span>
                </div>
                <details className="mt-4">
                  <summary className="cursor-pointer text-sm font-semibold" style={{ color: colors.foreground }}>
                    Quest details
                  </summary>
                  <p className="mt-2 text-sm leading-relaxed" style={{ color: colors.muted }}>
                    {quest.details}
                  </p>
                </details>
                {alreadyActive ? (
                  <p role="status" className="mt-4 rounded-lg border px-3 py-2 text-sm font-semibold"
                    style={{ color: colors.success, borderColor: colors.successBorder, backgroundColor: colors.successBackground }}>
                    Already in your active sidequests
                  </p>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={!userId || full || accepting || acceptingId !== null}
                      onClick={() => void accept(quest)}
                      className="mt-4 min-h-11 cursor-pointer rounded-xl px-4 py-2 text-sm font-black transition hover:-translate-y-0.5 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-55"
                      style={{ backgroundColor: colors.primary, color: colors.primaryForeground }}
                    >
                      {accepting
                        ? 'Generating your sidequest…'
                        : !userId
                          ? 'Sign in to accept'
                          : full
                            ? 'Sidequest slots full'
                            : 'Accept quest'}
                    </button>
                    {!userId && (
                      <p className="mt-2 text-xs" style={{ color: colors.muted }}>
                        You can browse without signing in. Sign in to save and track this quest.
                      </p>
                    )}
                    {full && userId && (
                      <p className="mt-2 text-xs" style={{ color: colors.muted }}>
                        Complete or abandon a sidequest to free a slot.
                      </p>
                    )}
                  </>
                )}
                {acceptError?.key === key && (
                  <p role="alert" className="mt-3 text-sm" style={{ color: colors.error }}>
                    {acceptError.message}
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

export default OrganizationQuestBoard
