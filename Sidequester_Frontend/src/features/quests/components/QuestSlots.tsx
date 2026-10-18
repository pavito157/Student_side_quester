import { MAX_ACTIVE_QUESTS } from '../../../services/questAssignment'
import { navigateTo } from '../../../services/navigation'
import type { ActiveSidequest } from '../../../types/sidequest'

export default function QuestSlots({ quests, loading, error }: {
  quests: ActiveSidequest[]; loading: boolean; error: string
}) {
  return <section className="quest-slots rpg-panel cozy-journal" aria-label="Your quest slots">
    <div className="cozy-panel-heading">
      <h2><img src="/art/cozy/satchel.png" alt="" aria-hidden="true" className="cozy-icon size-8" />Your quest journal</h2>
      <p className="text-xs text-muted" role="status">{loading ? 'Loading your quests…' : error
        ? 'Quest slots unavailable. Check the quick menu.'
        : `${quests.length} / ${MAX_ACTIVE_QUESTS} slots used`}</p>
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
          <div className="journal-card-top"><img src={`/art/cozy/${quest ? 'sprout' : 'plus'}.png`} alt="" aria-hidden="true" className="cozy-icon size-8" />
            {quest && <span className="cozy-xp">+{quest.xpValue} XP</span>}</div>
          <strong>{quest ? quest.title : loading ? 'Getting your journal…' : error ? 'Slot unavailable' : 'Room for one more adventure'}</strong>
          {quest && <><p className="journal-card-description">{quest.description}</p><p className="journal-card-place">{quest.locationName}</p></>}
          <span className="journal-card-footer">{quest ? <><img src="/art/cozy/rose.png" alt="" aria-hidden="true" className="cozy-icon size-8" /><span>View quest <img src="/art/cozy/pointer.png" alt="" aria-hidden="true" className="cozy-icon size-4" /></span></> : <img src="/art/cozy/sprout.png" alt="" aria-hidden="true" className="cozy-icon size-10" />}</span>
        </button>
      })}
    </div>
  </section>
}
