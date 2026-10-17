import Button from './componenets/Button'
import { colors, gradients } from './constants/colors'

function App() {
  return (
    <main className="min-h-screen px-6 py-16 sm:py-24">
      <section className="mx-auto max-w-3xl">
        <p
          className="mb-4 text-sm font-semibold uppercase tracking-[0.2em]"
          style={{ color: colors.secondary }}
        >
          Find your next adventure
        </p>
        <h1
          className="text-5xl font-bold tracking-tight sm:text-7xl"
          style={{
            backgroundImage: gradients.brand,
            backgroundClip: 'text',
            color: 'transparent',
          }}
        >
          Sidequester
        </h1>
        <p className="mt-6 max-w-xl text-lg" style={{ color: colors.muted }}>
          Discover experiences, meet your people, and make the most of campus life.
        </p>

        <div
          className="mt-10 rounded-2xl border p-6 sm:p-8"
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.border,
          }}
        >
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold" style={{ color: colors.foreground }}>
                Your next side quest starts here.
              </h2>
              <p className="mt-2" style={{ color: colors.muted }}>
                Take a break from the usual and try something new.
              </p>
            </div>
            <Button onClick={() => console.log('Button clicked!')}>
              Get started
            </Button>
          </div>
        </div>
      </section>
    </main>
  )
}

export default App
