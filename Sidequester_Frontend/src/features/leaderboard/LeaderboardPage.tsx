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
import { getXpTier } from './leaderboardTiers'
import { placementName, playerStanding, splitRankings } from './leaderboardPresentation'

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
  isYou: boolean
  champion?: boolean
  overtake?: number | null
}

function RankedRow({ place, label, detail, xp, isYou, overtake, champion = false }: RankedRowProps) {
  const tier = getXpTier(xp)
  const placement = placementName(place)
  const progressText = tier.isMax ? 'Max tier reached.' : `${tier.remaining} XP to ${tier.next}`
  return (
    <li
      value={place}
      aria-current={isYou ? 'true' : undefined}
      data-placement={placement?.toLowerCase()}
      data-tier={tier.name}
      className={`leaderboard-row ${champion ? 'leaderboard-champion' : ''} grid grid-cols-[2.5rem_minmax(0,1fr)_7rem] items-center gap-3 border-b px-4 py-4 last:border-b-0 sm:grid-cols-[4rem_minmax(0,1fr)_10rem] sm:px-6`}
      style={{ borderColor: colors.border, backgroundColor: isYou ? colors.successBackground : undefined }}
    >
      <span
        className="leaderboard-place inline-flex size-9 items-center justify-center rounded-full border text-sm font-black shadow-[0_0_18px_rgb(250_70_22_/_20%)]"
        style={{
          backgroundColor: place <= 3 ? colors.secondary : colors.surfaceRaised,
          color: place <= 3 ? colors.secondaryForeground : colors.foreground,
          borderColor: place <= 3 ? 'rgb(255 154 74 / 45%)' : colors.border,
        }}
      >
        {champion && <img src={`/art/cozy/${place === 1 ? 'crown' : 'trophy'}.png`} alt="" aria-hidden="true" className="cozy-icon size-8" />}
        <span>{champion ? '#' : ''}{place}</span>
      </span>
      <span className="leaderboard-identity min-w-0">
        <span className="flex min-w-0 items-center gap-2"><span className="block truncate font-medium" title={label}>{label}</span>{isYou && <span className="shrink-0 text-xs font-bold" style={{ color: colors.success }}>YOU</span>}</span>
        <span className="block truncate text-xs" style={{ color: colors.muted }}>{detail}{placement ? ` · ${placement} placement` : ''}</span>
        {isYou && <span className="mt-1 block text-xs" style={{ color: colors.secondary }}>{place === 1
          ? 'You lead the adventure. Hold your ground!'
          : overtake != null ? `${overtake.toLocaleString()} XP to overtake Rank #${place - 1}.` : 'Your place in the adventure.'}</span>}
      </span>
      <div className="leaderboard-progress space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <span className="text-xs font-medium" style={{ color: colors.muted }}>{tier.name}</span>
          <span
            className="shrink-0 whitespace-nowrap rounded-full border px-2 py-0.5 text-sm font-black tabular-nums"
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
          aria-label={`${label}: ${tier.name} tier progress`}
          aria-valuemin={0}
          aria-valuemax={50}
          aria-valuenow={tier.progress}
          aria-valuetext={`${xp} total XP. ${progressText}`}
          className="h-2 overflow-hidden rounded-full"
          style={{ backgroundColor: colors.surfaceRaised }}
        >
          <div
            className="h-full rounded-full transition-[width] duration-500"
            style={{
              width: `${tier.percent}%`,
              background: 'repeating-linear-gradient(90deg, #9db860 0 7px, #b7ce79 7px 9px)',
            }}
          />
        </div>
        <p className="text-xs" style={{ color: colors.muted }}>{progressText}</p>
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
  const standing = board === 'individual' ? playerStanding(rows, userId) : null
  const { podium, remaining } = splitRankings(rows)
  const renderRow = (row: typeof rows[number], index: number, champion = false) => (
    <RankedRow key={row.id} place={index + 1} label={row.label} detail={row.detail} xp={row.xp}
      champion={champion} isYou={board === 'individual' && row.id === userId} overtake={standing?.overtake} />
  )

  return (
    <>
      <Header title="Leaderboard" />
      <main className="min-h-[calc(100dvh-4rem)] w-full min-w-0 bg-gradient-glow px-3 py-7 sm:px-6 sm:py-16">
        <section className="mx-auto w-full min-w-0 max-w-5xl">
          <div className="mb-8 text-center">
            <p
              className="text-xs font-semibold uppercase tracking-[0.2em]"
              style={{ color: colors.secondary }}
            >
              Sidequester community
            </p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-5xl">
              <img src="/art/cozy/trophy.png" alt="" aria-hidden="true" className="cozy-icon mr-3 inline-block size-10" />Leaderboard
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
                  <div className="leaderboard-body">
                    <div className="leaderboard-section-heading">
                      <h2><img src="/art/cozy/star.png" alt="" aria-hidden="true" className="cozy-icon mr-2 size-5" />{board === 'individual' ? 'Top achievers' : 'Top residence halls'}</h2>
                      <p>Ranked by total XP</p>
                    </div>
                    <ol className="leaderboard-podium" aria-label="Top-ranked competitors">
                      {podium.map((row, index) => renderRow(row, index, true))}
                    </ol>
                    {remaining.length > 0 && <>
                      <div className="leaderboard-section-heading">
                        <h2>{board === 'individual' ? 'The adventurer roster' : 'The guild roster'}</h2>
                        <p>{rows.length} {board === 'individual' ? 'students' : 'halls'}</p>
                      </div>
                      <div
                        className="grid grid-cols-[2.5rem_minmax(0,1fr)_7rem] gap-3 border-b px-4 py-3 text-xs font-semibold uppercase tracking-wide sm:grid-cols-[4rem_minmax(0,1fr)_10rem] sm:px-6"
                        style={{ borderColor: colors.border, color: colors.muted }}
                      >
                        <span>Rank</span>
                        <span>{board === 'individual' ? 'Student' : 'Residence hall'}</span>
                        <span>XP</span>
                      </div>
                      <ol start={4} aria-label="Remaining rankings">
                        {remaining.map((row, index) => renderRow(row, index + 3))}
                      </ol>
                    </>}
                  </div>
                )}
              </>
            )}
          </div>
          <p className="mt-4 rounded border px-3 py-2 text-center text-xs" style={{ color: colors.muted, backgroundColor: colors.surface, borderColor: colors.border }}>
            Iron → Radiant · A new tier every 50 XP · Radiant at 400 XP. Placement and XP tier are separate.
          </p>
        </section>
      </main>
    </>
  )
}

export default LeaderboardPage
