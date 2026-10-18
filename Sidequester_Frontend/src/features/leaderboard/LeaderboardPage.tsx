import { useEffect, useState } from 'react'
import { SignInButton, SignedOut, useUser } from '@clerk/clerk-react'
import Header from '../../components/navigation/Header'
import { colors } from '../../constants/colors'
import {
  getDormLeaderboardEntries,
  getLeaderboardEntries,
  type DormLeaderboardData,
  type LeaderboardData,
} from '../../services/leaderboard'
import { getFirebaseIdToken } from '../../services/firebaseSession'

type Board = 'individual' | 'dorms'
type BoardData = LeaderboardData | DormLeaderboardData

type LoadedBoard = {
  key: string
  data: BoardData
  error: boolean
}

type RankedRowProps = {
  place: number
  label: string
  detail: string
  xp: number
  highestXp: number
}

function RankedRow({ place, label, detail, xp, highestXp }: RankedRowProps) {
  return (
    <li
      className="grid grid-cols-[2.5rem_minmax(0,1fr)_7rem] items-center gap-3 border-b px-4 py-4 last:border-b-0 sm:grid-cols-[4rem_minmax(0,1fr)_10rem] sm:px-6"
      style={{ borderColor: colors.border }}
    >
      <span
        className="inline-flex size-9 items-center justify-center rounded-full border text-sm font-black shadow-[0_0_18px_rgb(250_70_22_/_20%)]"
        style={{
          backgroundColor: place <= 3 ? colors.secondary : colors.surfaceRaised,
          color: place <= 3 ? colors.secondaryForeground : colors.foreground,
          borderColor: place <= 3 ? 'rgb(255 154 74 / 45%)' : colors.border,
        }}
      >
        {place}
      </span>
      <span className="min-w-0">
        <span className="block truncate font-medium" title={label}>{label}</span>
        <span className="block truncate text-xs" style={{ color: colors.muted }}>{detail}</span>
      </span>
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium" style={{ color: colors.muted }}>XP</span>
          <span
            className="rounded-full border px-2 py-0.5 text-sm font-black tabular-nums"
            style={{
              color: colors.secondary,
              borderColor: 'rgb(250 70 22 / 35%)',
              backgroundColor: 'rgb(250 70 22 / 8%)',
            }}
          >
            {xp.toLocaleString()} XP
          </span>
        </div>
        <div
          role="progressbar"
          aria-label={`${label}: ${xp} XP`}
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
  )
}

function LeaderboardPage() {
  const { isLoaded, isSignedIn, user } = useUser()
  const [board, setBoard] = useState<Board>('individual')
  const [loadedBoard, setLoadedBoard] = useState<LoadedBoard | null>(null)
  const userId = user?.id ?? ''
  const requestKey = `${userId}:${board}`

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !userId) return

    let isCurrent = true
    async function loadBoard() {
      try {
        const token = await getFirebaseIdToken(userId)
        const data: BoardData = board === 'individual'
          ? await getLeaderboardEntries(token)
          : await getDormLeaderboardEntries(token)
        if (isCurrent) setLoadedBoard({ key: requestKey, data, error: false })
      } catch {
        if (isCurrent) {
          const emptyData: BoardData = { entries: [] }
          setLoadedBoard({
            key: requestKey,
            data: emptyData,
            error: true,
          })
        }
      }
    }
    void loadBoard()

    return () => {
      isCurrent = false
    }
  }, [board, isLoaded, isSignedIn, userId, requestKey])

  const hasLoadedBoard = loadedBoard?.key === requestKey
  const isLoading = isLoaded && isSignedIn && !hasLoadedBoard
  const error = hasLoadedBoard && loadedBoard.error
  const data = hasLoadedBoard ? loadedBoard.data : null
  const rows = data?.entries.map((entry) => 'userId' in entry
    ? {
      id: entry.userId,
      label: entry.username,
      detail: 'Student',
      xp: entry.xp,
    }
    : {
      id: entry.dormId,
      label: entry.dormName,
      detail: `${entry.memberCount.toLocaleString()} ${entry.memberCount === 1 ? 'member' : 'members'}`,
      xp: entry.xp,
    }) ?? []
  const highestXp = Math.max(1, ...rows.map(({ xp }) => xp))

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
              See how students and UF residence halls rank by XP.
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
                    Sign in with your UF account to see the community rankings.
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
                <div className="flex gap-2 border-b p-3 sm:px-6" style={{ borderColor: colors.border }}>
                  {([
                    ['individual', 'Students'],
                    ['dorms', 'UF Dorms'],
                  ] as const).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={board === value}
                      onClick={() => setBoard(value)}
                      className="min-h-10 cursor-pointer rounded-lg border px-4 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
                      style={{
                        backgroundColor: board === value ? colors.primary : colors.surfaceRaised,
                        borderColor: board === value ? colors.primary : colors.border,
                        color: board === value ? colors.primaryForeground : colors.foreground,
                        outlineColor: colors.primary,
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div
                  className="grid grid-cols-[2.5rem_minmax(0,1fr)_7rem] gap-3 border-b px-4 py-3 text-xs font-semibold uppercase tracking-wide sm:grid-cols-[4rem_minmax(0,1fr)_10rem] sm:px-6"
                  style={{ borderColor: colors.border, color: colors.muted }}
                >
                  <span>Rank</span>
                  <span>{board === 'individual' ? 'Student' : 'Residence hall'}</span>
                  <span>XP</span>
                </div>
                {isLoading ? (
                  <p role="status" className="p-6 text-center" style={{ color: colors.muted }}>
                    Loading {board === 'individual' ? 'students' : 'UF dorms'}…
                  </p>
                ) : error ? (
                  <p role="alert" className="p-6 text-center" style={{ color: colors.error }}>
                    Could not load the leaderboard right now. Please try again later.
                  </p>
                ) : rows.length === 0 ? (
                  <p className="p-6 text-center" style={{ color: colors.muted }}>
                    {board === 'individual'
                      ? 'No student rankings are available yet.'
                      : 'No residence hall rankings are available yet.'}
                  </p>
                ) : (
                  <ol>
                    {rows.map(({ id, label, detail, xp }, index) => (
                      <RankedRow
                        key={id}
                        place={index + 1}
                        label={label}
                        detail={detail}
                        xp={xp}
                        highestXp={highestXp}
                      />
                    ))}
                  </ol>
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
