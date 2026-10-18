import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useUser, SignInButton } from '@clerk/clerk-react'
import { getFirebaseIdToken } from '../../../services/firebaseSession'
import { createGlobalQuest, getGlobalQuests, getPublicGlobalQuests,
  type GlobalQuestFeed, type GlobalQuest, type PublicGlobalQuest } from '../../../services/globalQuests'
import { navigateTo } from '../../../services/navigation'
import WhereButton from '../../quest-generation/inputs/buttons/WhereButton'
import OrganizationQuestBoard from '../../organization-quests/OrganizationQuestBoard'
import GlobalQuestMap from './GlobalQuestMap'
import OrganizationAdmin from './OrganizationAdmin'
import type { ActiveSidequest } from '../../../types/sidequest'

type Coordinates = { latitude: number; longitude: number }
const eventDate = (value: string) => new Date(value).toLocaleString(undefined, {
  month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
})

export default function GlobalQuests({ activeQuests = [], onAcceptOrganizationQuest, onAcceptGlobalEvent }: {
  activeQuests?: ActiveSidequest[]
  onAcceptOrganizationQuest: (userId: string, organizationId: string, questId: string) => Promise<void>
  onAcceptGlobalEvent: (userId: string, eventId: string) => Promise<void>
}) {
  const { user } = useUser()
  const uid = user?.id
  const [feed, setFeed] = useState<GlobalQuestFeed | null>(null)
  const [feedUid, setFeedUid] = useState<string>()
  const [mapQuests, setMapQuests] = useState<PublicGlobalQuest[] | null>(null)
  const [mapError, setMapError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState('')
  const lock = useRef(false)
  const mounted = useRef(true)
  const [clock, setClock] = useState(() => Date.now())
  const [location, setLocation] = useState('')
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null)
  useEffect(() => {
    mounted.current = true
    const timer = window.setInterval(() => setClock(Date.now()), 15000)
    return () => { mounted.current = false; window.clearInterval(timer) }
  }, [])
  useEffect(() => {
    if (!uid) return
    const controller = new AbortController()
    getFirebaseIdToken(uid).then((token) => getGlobalQuests(token, controller.signal))
      .then((result) => { if (!controller.signal.aborted) { setFeed(result); setFeedUid(uid); setError('') } })
      .catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Could not load campus events.') })
    return () => controller.abort()
  }, [uid, attempt])
  useEffect(() => {
    const controller = new AbortController()
    getPublicGlobalQuests(controller.signal)
      .then((quests) => {
        if (!controller.signal.aborted) {
          setMapQuests(quests)
          setMapError('')
        }
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setMapError(reason instanceof Error ? reason.message : 'Could not load event locations.')
        }
      })
    return () => controller.abort()
  }, [attempt])
  const currentFeed = feedUid === uid ? feed : null
  async function accept(event: GlobalQuest) {
    if (!uid || lock.current) return
    lock.current = true; setBusy(event.id); setNotice(''); setError('')
    try {
      await onAcceptGlobalEvent(uid, event.id)
    } catch (reason) { if (mounted.current) setError(reason instanceof Error ? reason.message : 'Could not add event quest.') }
    finally { lock.current = false; if (mounted.current) setBusy('') }
  }
  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!uid || !coordinates || lock.current) return
    const form = event.currentTarget
    const values = new FormData(form)
    const startsAt = new Date(String(values.get('startsAt')))
    const endsAt = new Date(String(values.get('endsAt')))
    if (!Number.isFinite(+startsAt) || !Number.isFinite(+endsAt) || endsAt <= startsAt) {
      setError('Choose an end time after the start time.'); return
    }
    lock.current = true; setBusy('publishing'); setError(''); setNotice('')
    try {
      const token = await getFirebaseIdToken(uid)
      await createGlobalQuest(token, {
        organizationId: String(values.get('organizationId')), title: String(values.get('title')),
        description: String(values.get('description')), locationName: location, ...coordinates,
        startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(),
      })
      if (mounted.current) {
        form.reset(); setLocation(''); setCoordinates(null)
        setNotice('Event quest published! It is now on the campus quest board.')
        setAttempt((value) => value + 1)
      }
    } catch (reason) { if (mounted.current) setError(reason instanceof Error ? reason.message : 'Could not publish the event.') }
    finally { lock.current = false; if (mounted.current) setBusy('') }
  }
  return <section className="rpg-panel mt-8 p-4 sm:p-6" aria-labelledby="global-quests-title">
    <p className="text-xs font-bold uppercase tracking-widest text-secondary">Adventure, together</p>
    <h2 id="global-quests-title" className="mt-1 text-xl font-bold">Campus quest board</h2>
    <p className="mt-2 text-sm text-muted">Events and activities from campus organizations and sponsors. Find something worth showing up for.</p>
    <button type="button" className="hud-button mt-4 px-3 py-2 text-sm" disabled={Boolean(busy)} onClick={() => setAttempt((value) => value + 1)}>Refresh board</button>
    {!uid ? <div className="mt-4"><SignInButton mode="modal"><button className="hud-button px-4 py-2 font-semibold">Sign in to add event quests</button></SignInButton></div> : <>
      {!currentFeed && !error && <p role="status" className="mt-4 text-sm text-muted">Loading campus events…</p>}
      {currentFeed?.quests.length === 0 && <p className="mt-4 text-sm text-muted">No upcoming events yet. Check back soon for your next campus adventure.</p>}
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {currentFeed?.quests.map((quest) => {
          const existing = activeQuests.find((active) => active.sourceGlobalEventId === quest.id)
          const ended = clock > Date.parse(quest.endsAt) + quest.graceMinutes * 60000
          return <article key={quest.id} className="quest-subpanel p-4">
            <p className="text-xs font-semibold text-secondary">{quest.organizationName} · Event · +{quest.xpReward} XP</p>
            <h3 className="mt-1 font-bold text-lg">{quest.title}</h3>
            <p className="mt-2 text-sm whitespace-pre-wrap break-words">{quest.description}</p>
            <p className="mt-3 text-sm font-semibold">{quest.locationName}</p>
            {quest.source === 'uf-calendar' && quest.sourceUrl?.startsWith('https://calendar.ufl.edu/') &&
              <a className="text-sm underline" href={quest.sourceUrl} target="_blank" rel="noreferrer">From UF Calendar ↗</a>}
            <p className="mt-1 text-xs text-muted">{eventDate(quest.startsAt)} – {eventDate(quest.endsAt)}</p>
            <p className="mt-2 text-xs text-muted">{quest.verificationMode === 'gps' ? `GPS check-in within ${quest.radiusMeters}m during the event.` : 'Confirm attendance during the event.'} One reward per person.</p>
            <div className="mt-4 flex flex-wrap gap-3 items-center">
              <button type="button" className="magic-cta rounded-lg px-4 py-2 text-sm font-semibold" disabled={Boolean(busy) || quest.completed || ended || (!existing && activeQuests.length >= 3)} onClick={() => existing ? navigateTo(`/sidequests/${encodeURIComponent(existing.id)}`) : void accept(quest)}>
                {quest.completed ? 'Completed ✓' : existing ? 'View quest' : busy === quest.id ? 'Preparing event quest…' : ended ? 'Event ended' : activeQuests.length >= 3 ? 'All 3 slots full' : 'Add to my quests'}
              </button>
              <a className="text-sm underline" href={`https://www.google.com/maps/search/?api=1&query=${quest.latitude},${quest.longitude}`} target="_blank" rel="noreferrer">View venue ↗</a>
            </div>
          </article>
        })}
      </div>
      <p className="mt-3 text-xs text-muted">Event quests use one of your three slots. Everyone receives the same event tasks; check in at the venue during its scheduled time.</p>
    </>}
    <div className="mt-5">
      <h3 className="text-sm font-bold">Explore your quest map</h3>
      <p className="mt-1 text-xs text-muted">Select a marker to open a quest. Your accepted quests and available global events share this map.</p>
      {mapQuests === null && !mapError && <p role="status" className="mt-3 text-sm text-muted">Loading event locations…</p>}
      {mapError && <p role="alert" className="mt-3 text-sm" style={{ color: 'var(--color-error)' }}>Event locations could not load: {mapError}</p>}
      <GlobalQuestMap quests={mapQuests ?? []} activeQuests={activeQuests} />
    </div>
    <OrganizationQuestBoard userId={uid ?? null} activeQuests={activeQuests}
      onAccept={onAcceptOrganizationQuest} refreshKey={attempt} />
    {uid && <>
      {currentFeed?.adminRole === 'explicit_admin' && <OrganizationAdmin userId={uid} refreshKey={attempt} onChanged={() => setAttempt(value=>value+1)} />}
      {Boolean(currentFeed?.organizations.length) && <details className="mt-6 border-t pt-5 border-border">
        <summary className="cursor-pointer list-none"><span className="block text-sm text-muted">Hosting or know of an event around campus?</span><span className="hud-button mt-2 inline-block px-4 py-2 font-semibold">Create event quest +</span></summary>
        <form onSubmit={(event) => void publish(event)} className="mt-5 space-y-4">
          <p className="text-xs text-muted">{currentFeed?.adminRole === 'explicit_admin' ? 'Explicit admin · publish under any active organization.' : 'Organization admin · you can publish only for your assigned organizations.'}</p>
          <label className="block text-sm font-semibold">Organization<select name="organizationId" required className="global-event-input">{currentFeed?.organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}</select></label>
          <label className="block text-sm font-semibold">Event title<input name="title" required minLength={3} maxLength={160} className="global-event-input" placeholder="First GBM of the semester" /></label>
          <label className="block text-sm font-semibold">What’s happening?<textarea name="description" required minLength={10} maxLength={3000} className="global-event-input" rows={3} placeholder="Tell students what to expect and where to meet." /></label>
          <div className="text-sm"><p className="font-semibold mb-2">Event venue</p><WhereButton autoLocate={false} value={location} onChange={(value, point) => { setLocation(value); setCoordinates(point) }} /><p className="mt-1 text-xs text-muted">Choose a place from search so GPS check-in has an exact destination.</p></div>
          <p className="text-xs text-muted">Enter times in your local timezone ({Intl.DateTimeFormat().resolvedOptions().timeZone}). Times are saved in UTC.</p>
          <p className="text-sm text-secondary font-semibold">Attendance reward: {currentFeed?.defaults.xpReward} XP · awarded once per attendee.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-semibold">Starts<input name="startsAt" type="datetime-local" required className="global-event-input" /></label>
            <label className="text-sm font-semibold">Ends<input name="endsAt" type="datetime-local" required className="global-event-input" /></label>
          </div>
          <button type="submit" disabled={Boolean(busy) || !coordinates} className="magic-cta rounded-lg px-5 py-3 font-semibold">{busy === 'publishing' ? 'Publishing…' : 'Publish event quest'}</button>
        </form>
      </details>}
      {notice && <p role="status" className="mt-4 text-sm text-secondary">{notice}</p>}
      {error && <p role="alert" className="mt-4 text-sm" style={{color:'var(--color-error)'}}>{error}</p>}
    </>}
  </section>
}
