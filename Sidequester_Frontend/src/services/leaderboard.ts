import { collection, getDocs } from 'firebase/firestore'
import { db } from '../configs/FirebaseConfig'

export type LeaderboardEntry = {
  userId: string
  username: string
  xp: number
}

export type LeaderboardData = {
  entries: LeaderboardEntry[]
  skippedUsers: number
}

export async function getLeaderboardEntries(): Promise<LeaderboardData> {
  const usersSnapshot = await getDocs(collection(db, 'Users'))
  let skippedUsers = 0

  const entries = usersSnapshot.docs.flatMap((userDocument) => {
    const userData = userDocument.data()
    const username = userData.username
    const xp = userData.xp

    if (
      typeof username !== 'string' ||
      !username.trim() ||
      typeof xp !== 'number' ||
      !Number.isFinite(xp) ||
      xp < 0
    ) {
      skippedUsers += 1
      return []
    }

    return [{ userId: userDocument.id, username: username.trim(), xp }]
  })

  entries.sort(
    (first, second) => second.xp - first.xp || first.username.localeCompare(second.username),
  )

  return { entries, skippedUsers }
}
