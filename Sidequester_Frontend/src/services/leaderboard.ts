export type LeaderboardEntry = {
  userId: string
  username: string
  xp: number
}

export type LeaderboardData = {
  entries: LeaderboardEntry[]
}

export type DormLeaderboardEntry = {
  dormId: string
  dormName: string
  xp: number
  memberCount: number
}

export type DormLeaderboardData = {
  entries: DormLeaderboardEntry[]
}

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function isStudentEntry(value: unknown): value is LeaderboardEntry {
  return (
    isRecord(value) &&
    typeof value.userId === 'string' &&
    typeof value.username === 'string' &&
    isNonNegativeInteger(value.xp)
  )
}

function isDormEntry(value: unknown): value is DormLeaderboardEntry {
  return (
    isRecord(value) &&
    typeof value.dormId === 'string' &&
    typeof value.dormName === 'string' &&
    isNonNegativeInteger(value.xp) &&
    isNonNegativeInteger(value.memberCount)
  )
}

async function fetchLeaderboard(path: string, token: string): Promise<Record<string, unknown>> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    credentials: 'omit',
  })
  const result: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const detail = isRecord(result) ? result.detail : null
    throw new Error(typeof detail === 'string' ? detail : 'Could not load the leaderboard.')
  }
  if (!isRecord(result)) {
    throw new Error('The leaderboard service returned an invalid response.')
  }
  return result
}

export async function getLeaderboardEntries(token: string): Promise<LeaderboardData> {
  const result = await fetchLeaderboard('/leaderboard', token)
  if (
    !Array.isArray(result.leaderboard) ||
    !result.leaderboard.every(isStudentEntry)
  ) {
    throw new Error('The leaderboard service returned invalid student data.')
  }
  return { entries: result.leaderboard }
}

export async function getDormLeaderboardEntries(token: string): Promise<DormLeaderboardData> {
  const result = await fetchLeaderboard('/leaderboard/dorms', token)
  if (
    !Array.isArray(result.leaderboard) ||
    !result.leaderboard.every(isDormEntry)
  ) {
    throw new Error('The leaderboard service returned invalid dorm data.')
  }
  return { entries: result.leaderboard }
}
