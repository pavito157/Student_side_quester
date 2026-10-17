import { useEffect, useState } from 'react'
import Header from './componenets/main-ui/Header'
import CinematicHero from './componenets/main-ui/CinematicHero'
import LeaderboardPage from './componenets/main-ui/LeaderboardPage'
import QuestFilterButtons, { type QuestFilters } from './componenets/main-ui/QuestFilterButtons'
import FirebaseTextBox from './componenets/main-ui/FirebaseTextBox'
import GoalsSidebar from './componenets/main-ui/GoalsSidebar'
import UserPreferencesSummary from './componenets/main-ui/UserPreferencesSummary'
import SettingsModal, { type SettingsSection } from './componenets/settings/SettingsModal'
import VibesSidebar from './componenets/sidebar/VibesSidebar'
import type { Vibe } from './types/vibe'
import { colors } from './constants/colors'

function HomePage() {
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
  })

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
        onSettingsClick={() => openSettings()}
        onMenuClick={() => setIsVibesSidebarOpen(true)}
      />
      <CinematicHero />
      <VibesSidebar
        isOpen={isVibesSidebarOpen}
        onClose={() => setIsVibesSidebarOpen(false)}
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
                filters={questFilters}
                setFilters={setQuestFilters}
                activeVibe={vibeToApply}
                onClearActiveVibe={() => setVibeToApply(null)}
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

function App() {
  const [pathname, setPathname] = useState(() =>
    window.location.pathname.replace(/\/+$/, '') || '/',
  )

  useEffect(() => {
    function updatePathname() {
      setPathname(window.location.pathname.replace(/\/+$/, '') || '/')
    }

    window.addEventListener('popstate', updatePathname)
    return () => window.removeEventListener('popstate', updatePathname)
  }, [])

  return (
    <div key={pathname} className="route-transition">
      {pathname === '/leaderboard' ? <LeaderboardPage /> : <HomePage />}
    </div>
  )
}

export default App
