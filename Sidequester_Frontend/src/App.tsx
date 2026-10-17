import { useState } from 'react'
import Header from './componenets/Header'
import QuestFilterButtons from './componenets/Buttons/QuestFilterButtons'
import FirebaseTextBox from './componenets/FirebaseTextBox'
import GoalsSidebar from './componenets/GoalsSidebar'
import SettingsModal, { type SettingsSection } from './componenets/SettingsModal'
import UserPreferencesSummary from './componenets/UserPreferencesSummary'
import { colors } from './constants/colors'

function App() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [settingsSection, setSettingsSection] = useState<SettingsSection | null>(null)

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
      <Header onSettingsClick={() => openSettings()} />
      <main className="min-h-[calc(100vh-4rem)] bg-gradient-glow px-4 py-8 sm:px-6 sm:py-12">
        <div className="mx-auto max-w-6xl">
          <div className="mb-8 text-center sm:mb-10">
            <p
              className="mb-3 text-xs font-semibold uppercase tracking-[0.22em]"
              style={{ color: colors.secondary }}
            >
              A little adventure, close to home
            </p>
            <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">
              What sounds good today?
            </h1>
            <p
              className="mx-auto mt-4 max-w-xl text-base leading-relaxed sm:text-lg"
              style={{ color: colors.muted }}
            >
              Pick a place, the time you have, and what you’d like to spend. We’ll find you a
              side quest.
            </p>
          </div>

          <section className="mx-auto w-full max-w-5xl">
            <div
              className="rounded-2xl border p-5 shadow-xl sm:rounded-3xl sm:p-8"
              style={{
                backgroundColor: colors.surface,
                borderColor: colors.border,
              }}
            >
              <div className="mb-6">
                <div className="mb-2 flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="size-1.5 rounded-full"
                    style={{ backgroundColor: colors.secondary }}
                  />
                  <p
                    className="text-[0.65rem] font-semibold uppercase tracking-[0.16em]"
                    style={{ color: colors.secondary }}
                  >
                    Your next move
                  </p>
                </div>
                <h2 className="text-lg font-semibold sm:text-xl">Make it yours</h2>
                <p className="mt-1 text-sm" style={{ color: colors.muted }}>
                  Choose what works for you. You can change these anytime.
                </p>
              </div>
              <QuestFilterButtons />
            </div>
          </section>

          <div className="mx-auto mt-6 grid w-full max-w-5xl grid-cols-1 items-start gap-4 sm:mt-8 lg:grid-cols-[minmax(15rem,0.8fr)_minmax(0,1.6fr)] lg:gap-6">
            <div className="min-w-0">
              <GoalsSidebar />
            </div>
            <section className="flex min-w-0 flex-col gap-4">
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

export default App
