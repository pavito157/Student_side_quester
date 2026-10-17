import { useEffect, useState } from 'react'
import { SignInButton, SignedOut, useUser } from '@clerk/clerk-react'
import Header from './Header'
import { colors } from '../../constants/colors'
import { getLeaderboardEntries, type LeaderboardData } from '../../services/leaderboard'

function LeaderboardPage() {
  const { isLoaded, isSignedIn } = useUser()
  const [loadedData, setLoadedData] = useState<{
    userId: string
    data: LeaderboardData
    error: string
  } | null>(null)

  useEffect(() => {
    let isCurrent = true

    if (!isLoaded || !isSignedIn) {
      return () => {
        isCurrent = false
      }
    }

    void getLeaderboardEntries()
      .then((data) => {
        if (isCurrent) {
          setLoadedData({ userId: 'signed-in', data, error: '' })
        }
      })
      .catch((loadError: unknown) => {
        if (isCurrent) {
          setLoadedData({
            userId: 'signed-in',
            data: { entries: [], skippedUsers: 0 },
            error: loadError instanceof Error
              ? loadError.message
              : 'Could not load the leaderboard.',
          })
        }
      })

    return () => {
      isCurrent = false
    }
  }, [isLoaded, isSignedIn])

  const hasLoadedEntries = loadedData?.userId === 'signed-in'
  const isLoading = isLoaded && isSignedIn && !hasLoadedEntries
  const entries = hasLoadedEntries ? loadedData.data.entries : []
  const skippedUsers = hasLoadedEntries ? loadedData.data.skippedUsers : 0
  const error = hasLoadedEntries ? loadedData.error : ''
  const highestXp = Math.max(1, ...entries.map(({ xp }) => xp))

  return (
    <>
      <Header title="Leaderboard" />
      <main className="min-h-[calc(100vh-4rem)] w-full min-w-0 bg-gradient-glow px-4 py-10 sm:px-6 sm:py-16">
        <section className="mx-auto w-full min-w-0 max-w-3xl">
          <div className="mb-8 text-center">
            <p
              className="text-xs font-semibold uppercase tracking-[0.2em]"
              style={{ color: colors.secondary }}
            >
              Sidequester community
            </p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-5xl">
              Leaderboard
            </h1>
            <p className="mt-3 text-sm sm:text-base" style={{ color: colors.muted }}>
              Rankings use usernames and XP from user profiles.
            </p>
          </div>

          <div
            className="rpg-panel w-full min-w-0 overflow-hidden"
            style={{ backgroundColor: colors.surface, borderColor: colors.border }}
          >
            {!isLoaded ? (
              <p role="status" className="p-6 text-center" style={{ color: colors.muted }}>
                Checking sign-in status…
              </p>
            ) : (
              <SignedOut>
                <div className="p-6 text-center sm:p-10">
                  <h2 className="text-lg font-semibold">Sign in to view the leaderboard</h2>
                  <p className="mt-2 text-sm" style={{ color: colors.muted }}>
                    User IDs are only loaded for signed-in visitors.
                  </p>
                  <SignInButton mode="modal">
                    <button
                      type="button"
                      className="mt-5 min-h-12 cursor-pointer rounded-xl px-5 py-3 font-semibold transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2"
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
            )}

            {isLoaded && isSignedIn && (
              <>
                <div
                  className="grid grid-cols-[2.5rem_minmax(0,1fr)_7rem] gap-3 border-b px-4 py-3 text-xs font-semibold uppercase tracking-wide sm:grid-cols-[4rem_minmax(0,1fr)_10rem] sm:px-6"
                  style={{ borderColor: colors.border, color: colors.muted }}
                >
                  <span>Rank</span>
                  <span>Player</span>
                  <span>XP</span>
                </div>
                {isLoading ? (
                  <p role="status" className="p-6 text-center" style={{ color: colors.muted }}>
                    Loading users…
                  </p>
                ) : error ? (
                  <p role="alert" className="p-6 text-center" style={{ color: colors.error }}>
                    Could not load users. Check the Firestore read rules for the `Users` collection.
                    <span className="mt-2 block text-sm">{error}</span>
                  </p>
                ) : entries.length === 0 ? (
                  <p className="p-6 text-center" style={{ color: colors.muted }}>
                    No user profiles with valid usernames and XP were found.
                  </p>
                ) : (
                  <>
                    {skippedUsers > 0 && (
                      <p
                        role="status"
                        className="border-b px-4 py-3 text-sm sm:px-6"
                        style={{ borderColor: colors.border, color: colors.warning }}
                      >
                        {skippedUsers} user profile{skippedUsers === 1 ? ' was' : 's were'} left out
                        because its username or XP is missing or invalid.
                      </p>
                    )}
                    <ol>
                    {entries.map(({ userId, username, xp }, index) => (
                      <li
                        key={userId}
                        className="grid grid-cols-[2.5rem_minmax(0,1fr)_7rem] items-center gap-3 border-b px-4 py-4 last:border-b-0 sm:grid-cols-[4rem_minmax(0,1fr)_10rem] sm:px-6"
                        style={{ borderColor: colors.border }}
                      >
                        <span
                          className="inline-flex size-9 items-center justify-center rounded-full border text-sm font-black shadow-[0_0_18px_rgb(250_70_22_/_20%)]"
                          style={{
                            backgroundColor: index < 3 ? colors.secondary : colors.surfaceRaised,
                            color: index < 3 ? colors.secondaryForeground : colors.foreground,
                            borderColor: index < 3 ? 'rgb(255 154 74 / 45%)' : colors.border,
                          }}
                        >
                          {index + 1}
                        </span>
                        <span className="min-w-0 truncate font-medium" title={username}>
                          {username}
                        </span>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-medium" style={{ color: colors.muted }}>
                              XP
                            </span>
                            <span className="rounded-full border px-2 py-0.5 text-sm font-black tabular-nums" style={{ color: colors.secondary, borderColor: 'rgb(250 70 22 / 35%)', backgroundColor: 'rgb(250 70 22 / 8%)' }}>
                              {xp.toLocaleString()} XP
                            </span>
                          </div>
                          <div
                            role="progressbar"
                            aria-label={`${username}: ${xp} XP`}
                            aria-valuemin={0}
                            aria-valuemax={highestXp / 0.7}
                            aria-valuenow={xp}
                            className="h-2 overflow-hidden rounded-full"
                            style={{ backgroundColor: colors.surfaceRaised }}
                          >
                            <div
                              className="h-full rounded-full transition-[width] duration-500"
                              style={{
                                width: `${Math.max(0, Math.min(70, (xp / highestXp) * 70))}%`,
                                background: 'linear-gradient(90deg, #fa4616, #ff9a4a)',
                              }}
                            />
                          </div>
                        </div>
                      </li>
                    ))}
                    </ol>
                  </>
                )}
              </>
            )}
          </div>
        </section>
      </main>
    </>
  )
}

export default LeaderboardPage
