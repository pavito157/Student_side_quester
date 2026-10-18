export const XP_TIERS = ['Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Ascendant', 'Immortal', 'Radiant'] as const
export type TierName = typeof XP_TIERS[number]

/** Display only: never writes or changes the backend XP balance. */
export function getXpTier(xp: number) {
  if (!Number.isSafeInteger(xp) || xp < 0) throw new RangeError('Expected nonnegative integer XP')
  const index = Math.min(8, Math.floor(xp / 50))
  const isMax = index === 8
  const progress = isMax ? 50 : xp - index * 50
  return { name: XP_TIERS[index], index, xp, progress, percent: progress * 2,
    remaining: isMax ? 0 : 50 - progress, next: XP_TIERS[index + 1] ?? null, isMax }
}
