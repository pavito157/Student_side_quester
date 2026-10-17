import Header from './componenets/Header'
import QuestFilterButtons from './componenets/Buttons/QuestFilterButtons'
import { colors } from './constants/colors'

function App() {
  return (
    <>
      <Header />
      <main className="min-h-[calc(100vh-4rem)] bg-gradient-glow px-4 py-12 sm:px-6 sm:py-20">
        <section className="mx-auto max-w-3xl">
          <div className="mb-9 text-center sm:mb-12">
            <p
              className="mb-3 text-xs font-semibold uppercase tracking-[0.22em]"
              style={{ color: colors.muted }}
            >
              A little adventure, close to home
            </p>
            <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">
              What sounds good today?
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed sm:text-lg" style={{ color: colors.muted }}>
              Pick a place, the time you have, and what you’d like to spend. We’ll find you a side quest.
            </p>
          </div>

          <div
            className="rounded-2xl border p-5 shadow-xl sm:rounded-3xl sm:p-8"
            style={{
              backgroundColor: colors.surface,
              borderColor: colors.border,
            }}
          >
            <div className="mb-6">
              <h2 className="text-lg font-semibold sm:text-xl">Make it yours</h2>
              <p className="mt-1 text-sm" style={{ color: colors.muted }}>
                Choose what works for you. You can change these anytime.
              </p>
            </div>
            <QuestFilterButtons />
          </div>
        </section>
      </main>
    </>
  )
}

export default App
