import { SignInButton, SignedIn, SignedOut } from '@clerk/clerk-react'
import { colors } from '../../constants/colors'
import UserGoals from '../UserGoals'

function GoalsSidebar() {
  return (
    <aside
      aria-labelledby="goals-sidebar-title"
      className="rpg-panel min-h-72 max-h-[min(60dvh,38rem)] overflow-y-auto overscroll-contain p-5 sm:min-h-80 sm:p-6"
      style={{ backgroundColor: colors.surface, borderColor: colors.border }}
    >
      <header className="mb-5">
        <p
          className="mb-1 text-[0.65rem] font-semibold uppercase tracking-[0.18em]"
          style={{ color: colors.secondary }}
        >
          Make it meaningful
        </p>
        <h2 id="goals-sidebar-title" className="text-lg font-semibold">
          Goals
        </h2>
        <p className="mt-1 text-xs leading-relaxed" style={{ color: colors.muted }}>
          Keep what you want to work toward in view as you choose a sidequest.
        </p>
      </header>
      <SignedIn>
        <UserGoals compact idPrefix="sidebar" />
      </SignedIn>
      <SignedOut>
        <div
          className="rounded-xl border p-4"
          style={{ backgroundColor: colors.surfaceRaised, borderColor: colors.border }}
        >
          <p className="text-sm leading-relaxed" style={{ color: colors.muted }}>
            Sign in to save goals and keep them with your account.
          </p>
          <SignInButton mode="modal">
            <button
              type="button"
              className="mt-3 cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{
                backgroundColor: colors.primary,
                color: colors.primaryForeground,
                outlineColor: colors.primary,
              }}
            >
              Sign in
            </button>
          </SignInButton>
        </div>
      </SignedOut>
    </aside>
  )
}

export default GoalsSidebar
