import { QuestConfetti } from './components/decor/AdventureDecor'
import { useEffect, useRef, useState } from 'react'
import { useUser } from '@clerk/clerk-react'
import Header from './components/navigation/Header'
import CinematicHero from './features/home/CinematicHero'
import DormSelectionGate from './features/residence/DormSelectionGate'
import LeaderboardPage from './features/leaderboard/LeaderboardPage'
import SidequestDetailPage from './features/quests/detail/SidequestDetailPage'
import GlobalQuestPreviewPage from './features/quests/preview/GlobalQuestPreviewPage'
import GuestQuestPreviewPage from './features/quests/preview/GuestQuestPreviewPage'
import HomePage from './features/home/HomePage'
import { subscribeToActiveSidequests } from './services/sidequests'
import type { ActiveSidequestsState } from './app/types'
import { getActiveQuests, requestAssignedQuest, requestAdditionalQuest, requestGeneratedQuest, requestOrganizationQuest, requestGlobalEventQuest, type SavedQuestResponse, type GeneratedQuestResponse, type GenerateQuestPayload } from './services/questAssignment'
import { navigateTo } from './services/navigation'
import { getUserGoals, getUserPreferences } from './services/userPreferences'

type QuestGenerationState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'guest-preview'; result: GeneratedQuestResponse; payload: GenerateQuestPayload }

function AccountRoutes() {
  const { isLoaded, isSignedIn, user } = useUser()
  const userId = user?.id
  const [activeSidequestsState, setActiveSidequestsState] = useState<ActiveSidequestsState>({
    userId: null, sidequests: [], isLoading: true, error: '',
  })
  useEffect(() => {
    if (!isLoaded || !isSignedIn || !userId) return

    return subscribeToActiveSidequests(
      userId,
      (sidequests) => setActiveSidequestsState({
        userId,
        sidequests,
        isLoading: false,
        error: '',
      }),
      (error) => setActiveSidequestsState({
        userId,
        sidequests: [],
        isLoading: false,
        error,
      }),
    )
  }, [isLoaded, isSignedIn, userId])

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !userId) return
    const controller = new AbortController()
    // Reconcile legacy replacements once. The live Firestore list then keeps
    // every route, quest count and quick menu in sync.
    void getActiveQuests(userId, { signal: controller.signal }).catch((error) => {
      if (!controller.signal.aborted) setActiveSidequestsState((previous) => ({
        ...previous, userId, isLoading: false,
        error: error instanceof Error ? error.message : 'Could not load active quests.',
      }))
    })
    return () => controller.abort()
  }, [isLoaded, isSignedIn, userId])
  const activeQuestCount = activeSidequestsState.userId === userId
    ? activeSidequestsState.sidequests.length : 0
  const [pathname, setPathname] = useState(() =>
    window.location.pathname.replace(/\/+$/, '') || '/',
  )
  const [generationState, setGenerationState] = useState<QuestGenerationState>({ status: 'idle' })
  const [celebration, setCelebration] = useState<{ id: number; path: string } | null>(null)
  const generationControllerRef = useRef<AbortController | null>(null)
  const generationIdRef = useRef(0)
  const activeRef = useRef(true)
  const lastRequestRef = useRef<{ userId: string; questId: string; payload: GenerateQuestPayload } | null>(null)

  useEffect(() => {
    activeRef.current = true
    return () => {
      activeRef.current = false
      generationControllerRef.current?.abort()
      generationIdRef.current += 1
    }
  }, [])

  useEffect(() => {
    function updatePathname() {
      const nextPath = window.location.pathname.replace(/\/+$/, '') || '/'
      setPathname(nextPath)
      setCelebration((current) => current?.path === nextPath ? current : null)
    }

    window.addEventListener('popstate', updatePathname)
    return () => window.removeEventListener('popstate', updatePathname)
  }, [])

  async function startQuestGeneration(userId: string | null, payload: GenerateQuestPayload, sourceQuestId?: string) {
    if (!activeRef.current) return
    generationControllerRef.current?.abort()
    const controller = new AbortController()
    const generationId = generationIdRef.current + 1
    generationIdRef.current = generationId
    generationControllerRef.current = controller
    setCelebration(null)
    setGenerationState({ status: 'loading' })
    navigateTo('/sidequests/generating')

    try {
      if (userId) {
        const saved = sourceQuestId
          ? await requestAdditionalQuest(userId, sourceQuestId, payload, { signal: controller.signal })
          : await requestAssignedQuest(userId, payload, { signal: controller.signal })
        if (controller.signal.aborted || generationIdRef.current !== generationId) return
        lastRequestRef.current = { userId, questId: saved.quest.id, payload }
        setGenerationState({ status: 'idle' })
        if (!saved.reusedExisting) setCelebration({ id: generationId, path: `/sidequests/${encodeURIComponent(saved.quest.id)}` })
        navigateTo(`/sidequests/${encodeURIComponent(saved.quest.id)}`)
      } else {
        const result = await requestGeneratedQuest(null, payload, { signal: controller.signal })
        if (controller.signal.aborted || generationIdRef.current !== generationId) return
        setGenerationState({ status: 'guest-preview', result, payload })
        setCelebration({ id: generationId, path: '/sidequests/guest-preview' })
        navigateTo('/sidequests/guest-preview')
      }
    } catch (error) {
      if (controller.signal.aborted || generationIdRef.current !== generationId) return
      setGenerationState({
        status: 'error',
        message: error instanceof Error ? error.message : 'Could not create your sidequest.',
      })
    } finally {
      if (generationControllerRef.current === controller) generationControllerRef.current = null
    }
  }

  async function generateAnother(userId: string, questId: string, savedRequest: Record<string, unknown> | null) {
    const latest = lastRequestRef.current
    let payload: GenerateQuestPayload
    if (latest?.userId === userId && latest.questId === questId) {
      payload = latest.payload
    } else if (savedRequest) {
      // This snapshot was validated as GenerateQuestRequest by FastAPI when
      // persisted. FastAPI validates it again; client input cannot set XP/UID.
      payload = savedRequest as GenerateQuestPayload
    } else {
      const [preferences, goals] = await Promise.all([getUserPreferences(userId), getUserGoals(userId)])
      payload = { location: 'Anywhere', time: { selection: 'any' }, budget: { selection: 'any' }, preferences, goals }
    }
    return startQuestGeneration(userId, payload, questId)
  }

  async function acceptCampusQuest(userId: string, request: (signal: AbortSignal) => Promise<SavedQuestResponse>) {
    if (!activeRef.current || userId !== user?.id) throw new Error('Your account changed. Reload the quest board and try again.')
    generationControllerRef.current?.abort()
    const controller = new AbortController()
    const generationId = generationIdRef.current + 1
    generationIdRef.current = generationId
    generationControllerRef.current = controller
    try {
      const saved = await request(controller.signal)
      if (!activeRef.current || controller.signal.aborted || generationIdRef.current !== generationId) return
      const path = `/sidequests/${encodeURIComponent(saved.quest.id)}`
      setCelebration({ id: generationId, path })
      navigateTo(path)
    } catch (error) {
      if (!controller.signal.aborted && activeRef.current) throw error
    } finally {
      if (generationControllerRef.current === controller) generationControllerRef.current = null
    }
  }

  return (
    <DormSelectionGate>
      <div key={pathname} className="route-transition">
        {celebration?.path === pathname && <QuestConfetti key={celebration.id} />}
        {pathname === '/welcome' ? (
          <>
            <Header activeSidequestCount={activeQuestCount} />
            <main><CinematicHero /></main>
          </>
        ) : pathname === '/leaderboard' ? (
          <LeaderboardPage />
        ) : pathname === '/sidequests/generating' ? (
          <SidequestDetailPage
            sidequestId="generating"
            generationState={generationState.status === 'guest-preview'
              ? { status: 'idle' }
              : generationState}
          />
        ) : pathname === '/sidequests/guest-preview' ? (
          <GuestQuestPreviewPage
            result={generationState.status === 'guest-preview' ? generationState.result : null}
            payload={generationState.status === 'guest-preview' ? generationState.payload : null}
          />

        ) : pathname.startsWith('/global-quests/') ? (
          <GlobalQuestPreviewPage
            eventId={decodeURIComponent(pathname.slice('/global-quests/'.length))}
            activeQuests={activeSidequestsState.userId === userId ? activeSidequestsState.sidequests : []}
            slotsLoading={Boolean(userId) && (activeSidequestsState.userId !== userId || activeSidequestsState.isLoading)}
            slotsError={activeSidequestsState.userId === userId ? activeSidequestsState.error : ''}
            onAccept={(uid, eventId) => acceptCampusQuest(uid,
              (signal) => requestGlobalEventQuest(uid, eventId, { signal }))}
          />
        ) : pathname.startsWith('/sidequests/') ? (
          <SidequestDetailPage
            activeQuestCount={activeQuestCount}
            sidequestId={decodeURIComponent(pathname.slice('/sidequests/'.length))}
            onGenerateAnother={generateAnother}
          />
        ) : (
          <HomePage
            activeSidequestsState={activeSidequestsState}
            onStartQuestGeneration={startQuestGeneration}
            onAcceptOrganizationQuest={(uid, orgId, questId) => acceptCampusQuest(uid,
              (signal) => requestOrganizationQuest(uid, orgId, questId, { signal }))}
            onAcceptGlobalEvent={(uid, eventId) => acceptCampusQuest(uid,
              (signal) => requestGlobalEventQuest(uid, eventId, { signal }))}
          />
        )}
      </div>
    </DormSelectionGate>
  )
}

function App() {
  const { user } = useUser()
  return <AccountRoutes key={user?.id ?? 'guest'} />
}

export default App
