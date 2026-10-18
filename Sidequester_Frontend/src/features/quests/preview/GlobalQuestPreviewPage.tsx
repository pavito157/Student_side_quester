import { useEffect, useRef, useState } from 'react'
import { SignInButton, useUser } from '@clerk/clerk-react'
import Header from '../../../components/navigation/Header'
import { getPublicGlobalQuest, type PublicGlobalQuest } from '../../../services/globalQuests'
import { navigateTo } from '../../../services/navigation'
import type { ActiveSidequest } from '../../../types/sidequest'
import SidequestMap from '../detail/SidequestMap'

type Props = {
  eventId: string; activeQuests: ActiveSidequest[]; slotsLoading: boolean; slotsError: string
  onAccept: (uid: string, eventId: string) => Promise<void>
}

export default function GlobalQuestPreviewPage({ eventId, activeQuests, slotsLoading, slotsError, onAccept }: Props) {
  const { user } = useUser()
  const [state, setState] = useState<{key:string; event?:PublicGlobalQuest; error?:string}>({key:''})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const lock = useRef(false)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => {
    const controller = new AbortController()
    getPublicGlobalQuest(eventId, controller.signal).then(event => {
      if (!controller.signal.aborted) setState({key:eventId,event})
    }).catch(reason => {
      if (!controller.signal.aborted) setState({key:eventId,error:reason instanceof Error ? reason.message : 'Could not load event.'})
    })
    return () => controller.abort()
  }, [eventId, attempt])
  const event = state.key === eventId ? state.event : undefined
  const existing = activeQuests.find(quest => quest.sourceGlobalEventId === eventId)
  useEffect(() => {
    if (existing) navigateTo(`/sidequests/${encodeURIComponent(existing.id)}`)
  }, [existing])
  const full = activeQuests.length >= 3
  async function accept() {
    if (!user || !event || full || slotsLoading || slotsError || lock.current) return
    lock.current = true; setBusy(true); setError('')
    try { await onAccept(user.id, eventId) }
    catch (reason) { if (mounted.current) setError(reason instanceof Error ? reason.message : 'Could not add this quest.') }
    finally { lock.current = false; if (mounted.current) setBusy(false) }
  }
  return <>
    <Header activeSidequestCount={activeQuests.length} />
    <main className="min-h-[calc(100dvh-4rem)] px-3 py-5 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-5xl space-y-5">
        <button type="button" className="hud-button px-4 py-3" onClick={() => navigateTo('/home')}>← Back to Sidequester</button>
        {event ? <section className="rpg-panel p-5 sm:p-8">
          <p className="text-xs font-bold uppercase tracking-widest text-secondary">Global quest · {event.organizationName}</p>
          <h1 className="mt-2 text-3xl font-black sm:text-4xl">{event.title}</h1>
          <p className="mt-4 whitespace-pre-wrap leading-relaxed">{event.description}</p>
          <dl className="mt-5 space-y-2 text-sm">
            <div><dt className="font-semibold">Venue</dt><dd>{event.locationName}</dd></div>
            <div><dt className="font-semibold">Event time</dt><dd>{new Date(event.startsAt).toLocaleString()} – {new Date(event.endsAt).toLocaleString()}</dd></div>
            <div><dt className="font-semibold">XP</dt><dd>No XP for GPS-based check-ins until attendance can be verified by a trusted signal.</dd></div>
          </dl>
          <h2 className="mt-6 text-lg font-bold">What you’ll do</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5">
            <li>Arrive at the listed venue during the scheduled event.</li>
            <li>Attend the advertised event.</li>
            <li>Check in at the venue during its scheduled time.</li>
          </ol>
          <p className="mt-3 text-xs text-muted">Add this event to save its shared quest instructions in one of your three slots.</p>
          <div className="mt-5"><SidequestMap stops={[{name:event.locationName,latitude:event.latitude,longitude:event.longitude,step:'Event venue',completed:false}]} origin={null} /></div>
          <div className="mt-5 flex flex-col gap-3">
            <a className="hud-button px-4 py-3 text-center" href={`https://www.google.com/maps/dir/?api=1&destination=${event.latitude},${event.longitude}`} target="_blank" rel="noreferrer">Get directions</a>
            {user ? <button type="button" onClick={() => void accept()} disabled={busy || full || slotsLoading || Boolean(slotsError)} style={full ? {filter:'grayscale(1)'} : undefined} className="magic-cta rounded-xl px-4 py-4 font-bold disabled:cursor-not-allowed disabled:opacity-40">
              {busy ? 'Preparing event quest…' : full ? 'Add sidequest · All 3 slots full' : slotsLoading ? 'Loading your quests…' : 'Add sidequest'}
            </button> : <SignInButton mode="modal"><button className="magic-cta rounded-xl px-4 py-4 font-bold">Sign in to add sidequest</button></SignInButton>}
            {full && <p className="text-sm text-muted">Maximum quests reached (3/3). Complete or abandon a quest before adding this global quest.</p>}
            {(error || slotsError) && <p role="alert" className="text-sm" style={{color:'var(--color-error)'}}>{error || slotsError}</p>}
          </div>
        </section> : state.key === eventId && state.error ? <section className="rpg-panel p-5"><p role="alert">{state.error}</p><button className="hud-button mt-3 px-4 py-2" onClick={() => setAttempt(value => value+1)}>Retry</button></section> : <p role="status">Loading global quest…</p>}
      </div>
    </main>
  </>
}
