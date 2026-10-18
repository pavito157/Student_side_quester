export type RankingRow = { id: string; label: string; detail: string; xp: number }

/** Preserve the API's order, including its tie breaker; never sort by tier. */
export function splitRankings<T>(rows: readonly T[]) {
  return { podium: rows.slice(0, 3), remaining: rows.slice(3) }
}

export function placementName(place: number) {
  return place === 1 ? 'Gold' : place === 2 ? 'Silver' : place === 3 ? 'Bronze' : null
}

export function playerStanding(rows: readonly RankingRow[], userId: string) {
  const index = rows.findIndex(row => row.id === userId)
  if (!userId || index < 0) return null
  const above = rows[index - 1]
  const delta = above ? above.xp - rows[index].xp + 1 : null
  return { place: index + 1, overtake: delta !== null && Number.isSafeInteger(delta) && delta > 0 ? delta : null }
}
