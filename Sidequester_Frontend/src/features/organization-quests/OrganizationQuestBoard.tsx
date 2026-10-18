import { SignInButton } from '@clerk/clerk-react'
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

const EMPTY_QUESTS: OrganizationQuestBoardItem[] = []

type OrganizationQuestBoardProps = {
  userId: string | null
  activeQuests: ActiveSidequest[]
  refreshKey?: number
  onAccept: (userId: string, organizationId: string, questId: string) => Promise<void>
}

function OrganizationQuestBoard({
  userId,
  activeQuests,
  onAccept,
  refreshKey = 0,
}: OrganizationQuestBoardProps) {
  const acceptingRef = useRef(false)
  const [boardState, setBoardState] = useState<BoardState>({ status: 'loading' })
  const [acceptingId, setAcceptingId] = useState<string | null>(null)
  const [acceptError, setAcceptError] = useState<{ key: string; message: string } | null>(null)
  const [selectedQuest, setSelectedQuest] = useState<OrganizationQuestBoardItem | null>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (selectedQuest && !dialog.open) dialog.showModal()
    else if (!selectedQuest && dialog.open) dialog.close()
  }, [selectedQuest])

  useEffect(() => {
    const controller = new AbortController()
    void getOrganizationQuestBoard({ signal: controller.signal }).then(
      (quests) => { if (!controller.signal.aborted) setBoardState({ status: 'ready', quests }) },
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
  }, [refreshKey])

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

  function isAlreadyActive(quest: OrganizationQuestBoardItem) {
    return activeQuests.some((active) =>
      active.sourceOrganizationId === quest.organizationId
      && active.sourceOrganizationQuestId === quest.questId)
  }

  function renderAcceptAction(quest: OrganizationQuestBoardItem) {
    const key = `${quest.organizationId}/${quest.questId}`
    const alreadyActive = isAlreadyActive(quest)
    const full = activeQuests.length >= MAX_ACTIVE_QUESTS
    const accepting = acceptingId === key

    if (alreadyActive) {
      return (
        <p role="status" className="mt-4 rounded-lg border px-3 py-2 text-sm font-semibold"
          style={{ color: colors.success, borderColor: colors.successBorder, backgroundColor: colors.successBackground }}>
          Already in your active sidequests
        </p>
      )
    }

    const actionButton = userId ? (
      <button
        type="button"
        disabled={full || accepting || acceptingId !== null}
        onClick={() => void accept(quest)}
        className="mt-4 min-h-11 cursor-pointer rounded-xl px-4 py-2 text-sm font-black transition hover:-translate-y-0.5 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-55"
        style={{ backgroundColor: colors.primary, color: colors.primaryForeground }}
      >
        {accepting
          ? 'Generating your sidequest…'
          : full
            ? 'Sidequest slots full'
            : 'Add to my quests'}
      </button>
    ) : (
      <SignInButton mode="modal">
        <button
          type="button"
          className="mt-4 min-h-11 cursor-pointer rounded-xl px-4 py-2 text-sm font-black transition hover:brightness-110"
          style={{ backgroundColor: colors.primary, color: colors.primaryForeground }}
        >
          Sign in to accept
        </button>
      </SignInButton>
    )

    return (
      <>
        {actionButton}
        {!userId && (
          <p className="mt-2 text-xs" style={{ color: colors.muted }}>
            Browse freely; sign in to save and track this quest.
          </p>
        )}
        {full && userId && (
          <p className="mt-2 text-xs" style={{ color: colors.muted }}>
            Complete or abandon a sidequest to free a slot.
          </p>
        )}
        {acceptError?.key === key && (
          <p role="alert" className="mt-3 text-sm" style={{ color: colors.error }}>
            {acceptError.message}
          </p>
        )}
      </>
    )
  }

  const quests = boardState.status === 'ready' ? boardState.quests : EMPTY_QUESTS

  return (
    <section aria-labelledby="organization-activities-title" className="mt-6">
      <h3 id="organization-activities-title" className="font-semibold">Organization activities</h3>
      <p className="mt-1 text-xs" style={{ color: colors.muted }}>
        Add an activity to your personal sidequests. Each uses one of your three slots.
      </p>
      {boardState.status === 'loading' && (
        <p role="status" className="mt-4 text-sm" style={{ color: colors.muted }}>
          Loading organization activities…
        </p>
      )}
      {boardState.status === 'error' && (
        <div role="alert" className="mt-4 rounded-lg border p-3 text-sm"
          style={{ color: colors.error, borderColor: colors.errorBorder, backgroundColor: colors.errorBackground }}>
          Organization activities could not load: {boardState.message}. Use Refresh board to try again.
        </div>
      )}
      {boardState.status === 'ready' && quests.length === 0 && (
        <p className="mt-4 text-sm" style={{ color: colors.muted }}>
          No organization activities are published yet.
        </p>
      )}
      {quests.length > 0 && (
        <ul className="mt-5 grid gap-4 lg:grid-cols-2">
        {quests.map((quest) => {
          const key = `${quest.organizationId}/${quest.questId}`
          return (
            <li key={key} className="flex min-w-0 flex-col rounded-xl border p-4 sm:p-5"
              style={{ borderColor: colors.border, backgroundColor: colors.surfaceRaised }}>
              <p className="text-xs font-bold uppercase tracking-wide" style={{ color: colors.secondary }}>
                {quest.organizationName}
              </p>
              <h4 className="mt-2 break-words text-lg font-black">{quest.title}</h4>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: colors.muted }}>
                {quest.summary}
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full border px-3 py-1.5 font-bold" style={{ borderColor: colors.secondary, color: colors.secondary }}>
                  Up to +{quest.xpPotential} XP
                </span>
                <span className="rounded-full border px-3 py-1.5" style={{ borderColor: colors.border }}>
                  {quest.timeLabel}
                </span>
                {quest.mapLocation ? (
                  <span className="rounded-full border px-3 py-1.5" style={{ borderColor: colors.border }}>
                    {quest.mapLocation.name}
                  </span>
                ) : (
                  <span className="rounded-full border px-3 py-1.5" style={{ borderColor: colors.warningBorder, color: colors.warning }}>
                    {quest.mapLocationStatus === 'invalid'
                      ? 'Venue coordinates need correction'
                      : 'Venue location not added'}
                  </span>
                )}
                <span className="rounded-full border px-3 py-1.5" style={{ borderColor: colors.border }}>
                  Personal sidequest · uses 1 slot
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
              {renderAcceptAction(quest)}
            </li>
          )
        })}
        </ul>
      )}
      <dialog
        ref={dialogRef}
        aria-labelledby="organization-quest-popup-title"
        onCancel={(event) => {
          event.preventDefault()
          setSelectedQuest(null)
        }}
        onClose={() => setSelectedQuest(null)}
        className="w-[min(92vw,36rem)] rounded-2xl border p-0 shadow-2xl backdrop:bg-black/65"
        style={{ borderColor: colors.border, color: colors.foreground, backgroundColor: colors.surface }}
      >
        {selectedQuest && (
          <div className="p-5 sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-wide" style={{ color: colors.secondary }}>
                  {selectedQuest.organizationName}
                </p>
                <h4 id="organization-quest-popup-title" className="mt-2 break-words text-xl font-black">
                  {selectedQuest.title}
                </h4>
              </div>
              <button
                type="button"
                aria-label="Close quest details"
                onClick={() => setSelectedQuest(null)}
                className="min-h-10 min-w-10 rounded-full border text-lg"
                style={{ borderColor: colors.border, color: colors.muted }}
              >
                ×
              </button>
            </div>
            <p className="mt-4 text-sm leading-relaxed" style={{ color: colors.muted }}>
              {selectedQuest.summary}
            </p>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">
              {selectedQuest.details}
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full border px-3 py-1.5 font-bold" style={{ borderColor: colors.secondary, color: colors.secondary }}>
                Up to +{selectedQuest.xpPotential} XP
              </span>
              <span className="rounded-full border px-3 py-1.5" style={{ borderColor: colors.border }}>
                {selectedQuest.timeLabel}
              </span>
              {selectedQuest.mapLocation && (
                <span className="rounded-full border px-3 py-1.5" style={{ borderColor: colors.border }}>
                  {selectedQuest.mapLocation.name}
                </span>
              )}
            </div>
            {renderAcceptAction(selectedQuest)}
          </div>
        )}
      </dialog>
    </section>
  )
}

export default OrganizationQuestBoard
