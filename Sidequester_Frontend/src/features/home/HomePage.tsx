import { defaultMultiQuest } from '../quest-generation/questFilterDefaults'
import { useState } from 'react'
import { useUser } from '@clerk/clerk-react'
import { colors } from '../../constants/colors'
import Header from '../../components/navigation/Header'
import { AccentStrokes } from '../../components/decor/AdventureDecor'
import QuestSlots from '../quests/components/QuestSlots'
import GlobalQuests from '../quests/detail/GlobalQuests'
import QuestFilterButtons, { type QuestFilters } from '../quest-generation/QuestFilterButtons'
import GoalsSidebar from '../preferences/GoalsSidebar'
import UserPreferencesSummary from '../preferences/UserPreferencesSummary'
import SettingsModal, { type SettingsSection } from '../settings/SettingsModal'
import VibesSidebar from '../vibes/sidebar/VibesSidebar'
import type { Vibe } from '../../types/vibe'
import type { ActiveSidequestsState } from '../../app/types'
import type { GenerateQuestPayload } from '../../services/questAssignment'

type HomePageProps = {
  activeSidequestsState: ActiveSidequestsState
  onStartQuestGeneration: (userId: string | null, payload: GenerateQuestPayload) => Promise<void>
  onAcceptGlobalEvent: (userId: string, eventId: string) => Promise<void>
  onAcceptOrganizationQuest: (userId: string, organizationId: string, questId: string) => Promise<void>
}

function HomePage({
  onStartQuestGeneration,
  onAcceptOrganizationQuest,
  onAcceptGlobalEvent,
  activeSidequestsState,
}: HomePageProps) {
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
    multiQuestManual: false,
    proofOptions: ['location', 'photo'],
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
            multiQuest: defaultMultiQuest(vibe.time || 'any', vibe.customTime ?? ''),
            multiQuestManual: false,
            proofOptions: ['location', 'photo'],
          })
        }}
      />
      <main className="quest-board relative px-4 pb-16 pt-12 sm:px-6 sm:pb-24 sm:pt-16">
        <div className="content-shell relative mx-auto">
          <section id="quest-terminal" className="quest-terminal w-full scroll-mt-24">
            <div className="terminal-heading mb-7 text-center">
              <div>
                <p
                  className="text-[0.65rem] font-bold uppercase tracking-[0.18em]"
                  style={{ color: colors.secondary }}
                >
                  Adventurer’s notice board
                </p>
                <h2 className="board-title mt-2">Pin down your quest<AccentStrokes /></h2>
                <p className="mt-3 text-sm sm:text-base" style={{ color: colors.muted }}>
                  Pick a place, set your limits, find a small adventure.
                </p>
              </div>
            </div>
            <div className="rpg-panel terminal-panel p-4 sm:p-6 lg:p-7">
              <QuestFilterButtons
                activeQuestCount={currentActiveSidequests.sidequests.length}
                filters={questFilters}
                setFilters={setQuestFilters}
                activeVibe={vibeToApply}
                onClearActiveVibe={() => setVibeToApply(null)}
                onStartQuestGeneration={onStartQuestGeneration}
              />
            </div>
            {userId && <QuestSlots quests={currentActiveSidequests.sidequests}
              loading={currentActiveSidequests.isLoading} error={currentActiveSidequests.error} />}
          </section>

          <details open
            className="cozy-personalization mt-6 rounded-xl border"
            style={{ borderColor: colors.border, backgroundColor: colors.surface }}
          >
            <summary className="cursor-pointer px-4 py-3 text-sm font-semibold sm:px-5">
              <span><img src="/art/cozy/sprout.png" alt="" aria-hidden="true" className="cozy-icon mr-2 inline-block size-6" />Make it yours</span>
              <span className="ml-2 text-xs font-normal" style={{ color: colors.muted }}>
                Goals and preferences
              </span>
            </summary>
            <div className="border-t px-4 py-4 sm:px-5" style={{ borderColor: colors.border }}>
              <p className="mb-4 text-xs" style={{ color: colors.muted }}>
                Your adventures come first. Add these details only if you want them to shape suggestions.
              </p>
              <div className="personalization-grid grid w-full grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <div className="min-w-0">
                  <GoalsSidebar />
                </div>
                <section className="flex min-w-0 flex-col gap-5">
                  <UserPreferencesSummary onEdit={() => openSettings('preferences')} />
                </section>
              </div>
            </div>
          </details>
          <GlobalQuests
            key={userId ?? 'guest'}
            activeQuests={currentActiveSidequests.sidequests}
            onAcceptOrganizationQuest={onAcceptOrganizationQuest}
            onAcceptGlobalEvent={onAcceptGlobalEvent}
          />
          <footer className="cozy-credits mt-7 text-center text-xs">A little adventure, close to home. <span aria-hidden="true">·</span> UI sprites by <a href="https://cupnooble.itch.io/sprout-lands-ui-pack" target="_blank" rel="noreferrer" className="underline">Cup Nooble</a></footer>
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

export default HomePage
