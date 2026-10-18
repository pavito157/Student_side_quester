import type { CSSProperties } from 'react'
import { getDormEmblem } from './dormEmblems'
import styles from './Leaderboard.module.css'

const crystals = [
  'M12 8h8v16h-8z', 'M10 8h12v4h4v12H6V12h4z',
  'M12 4h8v4h4v16h-4v4h-8v-4H8V8h4z',
  'M6 6h4v6h4V4h4v8h4V6h4v18H6z',
  'M12 4h8v4h6v16h-6v4h-8v-4H6V8h6z',
  'M14 2h4v4h6v6h4v8h-4v6h-6v4h-4v-4H8v-6H4v-8h4V6h6z',
  'M14 2h4v8h4V6h6v16h-6v6H10v-6H4V6h6v4h4z',
  'M2 4h6v8h4V4h8v8h4V4h6v18h-4v6H6v-6H2z',
  'M14 0h4v4h4v4h6v6h4v4h-4v6h-6v4h-4v4h-4v-4h-4v-4H4v-6H0v-4h4V8h6V4h4z',
]

export function TierBadge({ index, name }: { index: number; name: string }) {
  return <svg className={styles.tierBadge} data-tier={index} viewBox="0 0 32 32" role="img" aria-label={`${name} XP tier`} shapeRendering="crispEdges">
    <path d={crystals[index]} fill="currentColor" stroke="var(--lb-ink)" strokeWidth="2" />
    <path d="M14 10h4v4h4v4h-4v4h-4v-4h-4v-4h4z" fill="var(--lb-paper)" />
    {index > 2 && <path d="M2 26h6v4H2zM24 26h6v4h-6z" fill="currentColor" />}
    {index > 5 && <path d="M0 0h4v4H0zM28 0h4v4h-4z" fill="currentColor" />}
  </svg>
}

export function PlacementMedal({ place }: { place: number }) {
  return <svg className={styles.medal} viewBox="0 0 32 32" role="img" aria-label={`${place === 1 ? 'Gold' : place === 2 ? 'Silver' : 'Bronze'} placement medal`} shapeRendering="crispEdges">
    <path d="M6 0h8v12H6zM18 0h8v12h-8z" fill="var(--lb-emerald)" />
    <path d="M10 8h12v4h4v14h-4v4H10v-4H6V12h4z" fill="var(--placement)" stroke="var(--lb-ink)" strokeWidth="2" />
    {place === 1 ? <path d="M10 15h3v4h2v-6h3v6h2v-4h3v9H10z" fill="var(--lb-ink)" /> :
      <text x="16" y="23" textAnchor="middle" fontFamily="monospace" fontWeight="bold" fontSize="13" fill="var(--lb-ink)">{place}</text>}
  </svg>
}

const symbols = [
  'M10 8h4v12h-4zM18 8h4v12h-4zM8 20h16v4H8z',
  'M14 6h4v6h6v4h-6v8h-4v-8H8v-4h6z',
  'M12 6h8v4h4v8h-4v6h-8v-6H8v-8h4z',
  'M8 8h16v4H8zM12 12h8v12h-8z',
  'M6 14h4v-4h4V6h4v4h4v4h4v4h-6v6h-8v-6H6z',
]
export function DormEmblem({ id, name }: { id: string; name: string }) {
  const emblem = getDormEmblem(id)
  return <svg className={styles.dormEmblem} style={{ '--crest-base': emblem.colors[0], '--crest-mark': emblem.colors[1] } as CSSProperties}
    viewBox="0 0 32 40" role="img" aria-label={`${name} guild emblem`} shapeRendering="crispEdges">
    <path d="M4 2h24v24h-4v4h-4v4h-8v-4H8v-4H4z" fill="var(--crest-base)" stroke="var(--lb-ink)" strokeWidth="2" />
    <path d={symbols[emblem.motif]} fill="var(--crest-mark)" />
    {Array.from({ length: emblem.variant + 1 }, (_, i) => <rect key={i} x={6 + i * 4} y="27" width="2" height="2" fill="var(--crest-mark)" />)}
  </svg>
}
