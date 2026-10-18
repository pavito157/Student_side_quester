import { useEffect, useRef, useState } from 'react'
import { useUser } from '@clerk/clerk-react'
import Header from './componenets/main-ui/Header'
import CinematicHero from './componenets/main-ui/CinematicHero'
import DormSelectionGate from './componenets/main-ui/DormSelectionGate'
import LeaderboardPage from './componenets/main-ui/LeaderboardPage'
import SidequestDetailPage from './componenets/main-ui/SidequestDetailPage'
import GuestQuestPreviewPage from './componenets/main-ui/GuestQuestPreviewPage'
import QuestFilterButtons, { type QuestFilters } from './componenets/main-ui/QuestFilterButtons'
import FirebaseTextBox from './componenets/main-ui/FirebaseTextBox'
import GoalsSidebar from './componenets/main-ui/GoalsSidebar'
import UserPreferencesSummary from './componenets/main-ui/UserPreferencesSummary'
import SettingsModal, { type SettingsSection } from './componenets/settings/SettingsModal'
import VibesSidebar from './componenets/sidebar/VibesSidebar'
import type { Vibe } from './types/vibe'
import { subscribeToActiveSidequests } from './services/sidequests'
import type { ActiveSidequest } from './types/sidequest'
import { colors } from './constants/colors'
import { getActiveQuests, requestAssignedQuest, requestAdditionalQuest, requestGeneratedQuest, type GeneratedQuestResponse, type GenerateQuestPayload } from './services/questAssignment'
import { navigateTo } from './services/navigation'
import { getUserGoals, getUserPreferences } from './services/userPreferences'

type ActiveSidequestsState = {
  userId: string | null
  sidequests: ActiveSidequest[]
  isLoading: boolean
  error: string
}

type QuestGenerationState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'guest-preview'; result: GeneratedQuestResponse; payload: GenerateQuestPayload }

type HomePageProps = {
  activeSidequestsState: ActiveSidequestsState
  onStartQuestGeneration: (userId: string | null, payload: GenerateQuestPayload) => Promise<void>
}

function HomePage({ onStartQuestGeneration, activeSidequestsState }: HomePageProps) {
  const { user } = useUser()
  const userId = user?.id
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isVibesSidebarOpen, setIsVibesSidebarOpen] = useState(false)
  const [settingsSection, setSettingsSection] = useState<SettingsSection | null>(null)
  const [vibeToApply, setVibeToApply] = useState<Vibe | null>(null)
  const [questFilters, setQuestFilters] = useState<QuestFilters>({
    where: '',
    latitude: null,
    longitude: null,
    time: '',
    budget: '',
    customTime: '',
    customBudget: '',
    distance: 'any',
    customDistance: '',
    multiQuest: false,
    proofOptions: ['location'],
  })

  const currentActiveSidequests = activeSidequestsState.userId === userId
    ? activeSidequestsState
    : { userId, sidequests: [], isLoading: Boolean(userId), error: '' }

  function openSettings(section: SettingsSection | null = null) {
    setSettingsSection(section)
    setIsSettingsOpen(true)
  }

  function closeSettings() {
    setIsSettingsOpen(false)
    setSettingsSection(null)
  }

  return (
    <>
      <Header
        activeSidequestCount={currentActiveSidequests.sidequests.length}
        onSettingsClick={() => openSettings()}
        onMenuClick={() => setIsVibesSidebarOpen(true)}
      />
      <CinematicHero />
      <VibesSidebar
        isOpen={isVibesSidebarOpen}
        onClose={() => setIsVibesSidebarOpen(false)}
        activeSidequests={currentActiveSidequests.sidequests}
        isLoadingActiveSidequests={currentActiveSidequests.isLoading}
        activeSidequestsError={currentActiveSidequests.error}
        onApplyVibe={(vibe) => {
          setVibeToApply({ ...vibe })
          setQuestFilters({
            where: vibe.where || 'any',
            latitude: null,
            longitude: null,
            time: vibe.time || 'any',
            budget: vibe.budget || 'any',
            customTime: vibe.customTime ?? '',
            customBudget: vibe.customBudget ?? '',
            distance: vibe.distance || 'any',
            customDistance: vibe.customDistance ?? '',
            multiQuest: false,
            proofOptions: ['location'],
          })
        }}
      />
      <main className="relative bg-gradient-glow px-4 py-12 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-6xl">
          <section id="quest-terminal" className="quest-terminal mx-auto w-full max-w-5xl scroll-mt-24">
            <div className="terminal-heading mb-7 flex items-end justify-between gap-4">
              <div>
                <p
                  className="text-[0.65rem] font-bold uppercase tracking-[0.18em]"
                  style={{ color: colors.secondary }}
                >
                  Adventurer’s notice board
                </p>
                <h2 className="mt-1 text-2xl font-black sm:text-3xl">Pin down your quest</h2>
                <p className="mt-2 max-w-xl text-sm" style={{ color: colors.muted }}>
                  Set your destination and provisions. The map will chart a path from there.
                </p>
              </div>
              <span className="terminal-seal hidden -rotate-6 sm:inline-flex">Quest log</span>
            </div>
            <div className="rpg-panel terminal-panel overflow-hidden p-4 sm:p-8">
              <QuestFilterButtons
                activeQuestCount={currentActiveSidequests.sidequests.length}
                filters={questFilters}
                setFilters={setQuestFilters}
                activeVibe={vibeToApply}
                onClearActiveVibe={() => setVibeToApply(null)}
                onStartQuestGeneration={onStartQuestGeneration}
              />
            </div>
          </section>

          <div className="mx-auto mt-8 grid w-full max-w-5xl grid-cols-1 items-start gap-5 sm:mt-12 lg:grid-cols-[minmax(15rem,0.8fr)_minmax(0,1.6fr)] lg:gap-7">
            <div className="min-w-0">
              <GoalsSidebar />
            </div>
            <section className="flex min-w-0 flex-col gap-5">
              <UserPreferencesSummary onEdit={() => openSettings('preferences')} />
              <FirebaseTextBox />
            </section>
          </div>
        </div>
      </main>
      <SettingsModal
        isOpen={isSettingsOpen}
        section={settingsSection}
        onSectionChange={setSettingsSection}
        onClose={closeSettings}
      />
    </>
  )
}

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
      setPathname(window.location.pathname.replace(/\/+$/, '') || '/')
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
        navigateTo(`/sidequests/${encodeURIComponent(saved.quest.id)}`)
      } else {
        const result = await requestGeneratedQuest(null, payload, { signal: controller.signal })
        if (controller.signal.aborted || generationIdRef.current !== generationId) return
        setGenerationState({ status: 'guest-preview', result, payload })
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

  return (
    <DormSelectionGate>
      <div key={pathname} className="route-transition">
        {pathname === '/leaderboard' ? (
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
