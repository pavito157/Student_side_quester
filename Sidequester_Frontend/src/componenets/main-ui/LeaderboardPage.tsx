import { useEffect, useState } from 'react'
import { SignInButton, SignedOut, useUser } from '@clerk/clerk-react'
import Header from './Header'
import { getDormLeaderboardEntries, getLeaderboardEntries, type DormLeaderboardData, type LeaderboardData } from '../../services/leaderboard'
import { getFirebaseIdToken } from '../../services/firebaseSession'
import LeaderboardRow from './leaderboard/LeaderboardRow'
import { splitRankings, playerStanding } from './leaderboard/leaderboardPresentation'
import styles from './leaderboard/Leaderboard.module.css'
import LeaderboardForest from './leaderboard/LeaderboardForest'
type Board = 'individual' | 'dorms'
type BoardData = LeaderboardData | DormLeaderboardData

type LoadedBoard = {
  key: string
  data: BoardData
  error: string
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
        if (isCurrent) setLoadedBoard({ key: requestKey, data, error: '' })
      } catch (loadError: unknown) {
        if (isCurrent) {
          const emptyData: BoardData = board === 'individual'
            ? { entries: [], skippedUsers: 0 }
            : { entries: [], unassignedUsers: 0 }
          setLoadedBoard({
            key: requestKey,
            data: emptyData,
            error: loadError instanceof Error
              ? loadError.message
              : 'Could not load the leaderboard.',
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
  const error = hasLoadedBoard ? loadedBoard.error : ''
  const data = hasLoadedBoard ? loadedBoard.data : null
  const individualData = board === 'individual' && data && 'skippedUsers' in data ? data : null
  const dormData = board === 'dorms' && data && 'unassignedUsers' in data ? data : null
  const rows = individualData?.entries.map((entry) => ({
    id: entry.userId,
    label: entry.username,
    detail: 'Student',
    xp: entry.xp,
  })) ?? dormData?.entries.map((entry) => ({
    id: entry.dormId,
    label: entry.dormName,
    detail: `${entry.memberCount.toLocaleString()} ${entry.memberCount === 1 ? 'member' : 'members'}`,
    xp: entry.xp,
  })) ?? []
  const { podium, remaining } = splitRankings(rows)
  const standing = board === 'individual' ? playerStanding(rows, userId) : null
  const renderRow = (row: typeof rows[number], index: number) => (
    <LeaderboardRow key={row.id} row={row} place={index + 1} dorm={board === 'dorms'}
      isYou={board === 'individual' && row.id === userId} overtake={standing?.overtake} />
  )

  return <>
    <Header title="Leaderboard" />
    <main className={styles.page}>
      <LeaderboardForest />
      <section className={styles.shell} aria-labelledby="leaderboard-title">
        <div className={styles.heading}>
          <div><p className={styles.eyebrow}>Sidequester / Hall of fame</p>
            <h1 id="leaderboard-title">The adventure<br />ranks here.</h1>
            <p className={styles.subtitle}>Every quest leaves a mark. Climb the ranks, champion your hall, and make your next adventure count.</p>
          </div>
          <div className={styles.headingArt} aria-hidden="true"><svg viewBox="0 0 32 32" shapeRendering="crispEdges">
            <path d="M8 3h16v15h-4v5h-8v-5H8zM3 6h5v4H6v5h5v4H5v-4H3zM24 6h5v9h-2v4h-6v-4h5v-5h-2zM14 23h4v4h6v4H8v-4h6z" fill="currentColor" />
            <path d="M12 6h3v8h-3z" fill="var(--lb-paper)" />
          </svg></div>
        </div>
        <div className={styles.panel}>
          {!isLoaded ? <p role="status" className={styles.state}>Checking sign-in status…</p> :
            <SignedOut><div className={styles.state}>
              <h2>Join the hall of fame</h2><p>Sign in with your UF account to view the community rankings.</p>
              <SignInButton mode="modal"><button type="button" className={styles.signIn}>Sign in</button></SignInButton>
            </div></SignedOut>}
          {isLoaded && isSignedIn && <>
            <div className={styles.toolbar}>
              <div className={styles.tabs} role="group" aria-label="Leaderboard category">
                {([['individual', 'Students'], ['dorms', 'UF Dorms']] as const).map(([value, label]) =>
                  <button key={value} type="button" aria-pressed={board === value} onClick={() => setBoard(value)} className={styles.tab}>{label}</button>)}
              </div><span className={styles.liveLabel}>Ranked by total XP</span>
            </div>
            {isLoading ? <p role="status" className={styles.state}>Loading {board === 'individual' ? 'students' : 'UF dorms'}…</p> :
              error ? <p role="alert" className={`${styles.state} ${styles.error}`}>Could not load the leaderboard.<span>{error}</span></p> :
              rows.length === 0 ? <p className={styles.state}>{board === 'individual' ? 'No student profiles were returned by the leaderboard service.' : 'No UF dorms are configured in the backend dorm catalog yet.'}</p> :
              <div className={styles.boardBody}>
                {individualData && individualData.skippedUsers > 0 && <p role="status" className={styles.notice}>{individualData.skippedUsers} profile{individualData.skippedUsers === 1 ? ' was' : 's were'} omitted because no username is set.</p>}
                {dormData && dormData.unassignedUsers > 0 && <p role="status" className={styles.notice}>{dormData.unassignedUsers} student{dormData.unassignedUsers === 1 ? ' has' : 's have'} no valid dorm assignment and {dormData.unassignedUsers === 1 ? 'was' : 'were'} not counted.</p>}
                <div className={styles.sectionHeading}><h2 className={styles.sectionTitle}>★ Leading {board === 'individual' ? 'adventurers' : 'guilds'}</h2><p>Placement ≠ XP tier</p></div>
                <ol className={styles.podium} aria-label="Top-ranked competitors">{podium.map(renderRow)}</ol>
                {remaining.length > 0 && <>
                  <div className={styles.sectionHeading}><h2 className={styles.sectionTitle}>{board === 'individual' ? 'The adventurer roster' : 'The guild roster'}</h2><p>{rows.length} {board === 'individual' ? 'students' : 'halls'}</p></div>
                  <ol start={4} className={styles.rankings} aria-label="Remaining rankings">{remaining.map((row, index) => renderRow(row, index + 3))}</ol>
                </>}
              </div>}
          </>}
        </div>
        <div className={styles.footer}><span>Iron → Radiant · A new tier every 50 XP · Radiant at 400 XP</span><span>Adventure together. Rise together.</span></div>
      </section>
    </main>
  </>
}

export default LeaderboardPage
