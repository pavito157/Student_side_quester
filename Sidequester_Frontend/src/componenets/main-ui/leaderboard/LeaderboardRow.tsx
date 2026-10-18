import type { CSSProperties } from 'react'
import { getXpTier } from './leaderboardTiers'
import { placementName, type RankingRow } from './leaderboardPresentation'
import { DormEmblem, PlacementMedal, TierBadge } from './LeaderboardArtwork'
import styles from './Leaderboard.module.css'

export default function LeaderboardRow({ row, place, isYou, dorm, overtake }: {
  row: RankingRow; place: number; isYou: boolean; dorm: boolean; overtake?: number | null
}) {
  const tier = getXpTier(row.xp)
  const placement = placementName(place)
  const progressText = tier.isMax ? 'Max tier reached.' : `${tier.remaining} XP to ${tier.next}`
  return <li value={place} className={`${styles.row} ${place <= 3 ? styles.champion : ''} ${isYou ? styles.you : ''}`}
    data-placement={placement?.toLowerCase()} aria-current={isYou ? 'true' : undefined}>
    <div className={styles.rank}>
      {placement && <PlacementMedal place={place} />}
      <span>#{place}</span>
    </div>
    <div className={styles.identity}>
      {dorm && <DormEmblem id={row.id} name={row.label} />}
      <div className={styles.nameBlock}>
        <div className={styles.name}>{row.label} {isYou && <span className={styles.youLabel}>◀ YOU</span>}</div>
        <p className={styles.detail}>{row.detail}{placement ? ` · ${placement} placement` : ''}</p>
        {isYou && <p className={styles.overtake}>{place === 1 ? 'You lead the adventure. Hold your ground!' :
          overtake != null ? `${overtake.toLocaleString()} XP to overtake Rank #${place - 1}.` : 'Your place in the adventure.'}</p>}
      </div>
    </div>
    <div className={styles.progressArea} data-tier={tier.index}>
      <div className={styles.xpLine}><span className={styles.tierName}><TierBadge index={tier.index} name={tier.name} />{tier.name}</span>
        <strong>{row.xp.toLocaleString()} <small>XP</small></strong></div>
      <div className={styles.progress} role="progressbar" aria-label={`${row.label}: ${tier.name} tier progress`}
        aria-valuemin={0} aria-valuemax={50} aria-valuenow={tier.progress}
        aria-valuetext={`${row.xp} total XP. ${progressText}`}>
        <span className={styles.fill} style={{ '--progress': `${tier.percent}%` } as CSSProperties} />
      </div>
      <div className={styles.progressCaption}><span>{progressText}</span><span>{tier.isMax ? 'MAX' : `${tier.progress}/50`}</span></div>
    </div>
  </li>
}
