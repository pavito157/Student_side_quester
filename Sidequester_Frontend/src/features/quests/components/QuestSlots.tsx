import { MAX_ACTIVE_QUESTS } from '../../../services/questAssignment'
import { navigateTo } from '../../../services/navigation'
import type { ActiveSidequest } from '../../../types/sidequest'

export default function QuestSlots({ quests, loading, error }: {
  quests: ActiveSidequest[]; loading: boolean; error: string
}) {
  return <section className="quest-slots" aria-label="Your quest slots">
    <div>
      <p className="font-semibold text-sm">Your adventures</p>
      <p className="text-xs text-muted" role="status">{loading ? 'Loading your quests…' : error
        ? 'Quest slots unavailable. Check the quick menu.'
        : `${quests.length} of ${MAX_ACTIVE_QUESTS} slots filled · Pick a flag to open a quest.`}</p>
    </div>
    <div className="quest-slot-flags">
      {Array.from({ length: MAX_ACTIVE_QUESTS }, (_, index) => {
        const quest = quests[index]
        return <button key={quest?.id ?? `empty-${index}`} type="button"
          className={`quest-slot ${quest ? 'quest-slot-filled' : ''}`}
          disabled={loading || Boolean(error) || !quest}
          aria-label={loading ? `Loading quest slot ${index + 1}` : error ? `Quest slot ${index + 1} unavailable`
            : quest ? `Open quest ${index + 1}: ${quest.title}` : `Quest slot ${index + 1} empty`}
          title={quest?.title ?? 'Room for another adventure'}
          onClick={() => { if (quest) navigateTo(`/sidequests/${encodeURIComponent(quest.id)}`) }}>
          <svg viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
            <path d="M7 28V4m0 1c6-5 12 5 19 0v14c-7 5-13-5-19 0" fill={quest ? 'currentColor' : 'none'} />
            {quest && <path d="m12 11 3 3 6-5" stroke="white" />}
          </svg>
          <span>{index + 1}</span>
        </button>
      })}
    </div>
  </section>
}
