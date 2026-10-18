import { useEffect, useRef, useState, type FormEvent } from 'react'
import { getFirebaseIdToken } from '../../../services/firebaseSession'
import { createOrganization, getManagedOrganizations, setOrganizationAdmin, type ManagedOrganization } from '../../../services/globalQuests'

export default function OrganizationAdmin({userId, refreshKey, onChanged}: {
  userId: string; refreshKey: number; onChanged: () => void
}) {
  const [open, setOpen] = useState(false)
  const [organizations, setOrganizations] = useState<ManagedOrganization[] | null>(null)
  const [revision, setRevision] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const lock = useRef(false)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    getFirebaseIdToken(userId).then(token => getManagedOrganizations(token, controller.signal))
      .then(data => { if (!controller.signal.aborted) {setOrganizations(data); setError('')} })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Could not load organizations.') })
    return () => controller.abort()
  }, [open, userId, refreshKey, revision])

  async function run(action: (token: string) => Promise<unknown>, success: string, form?: HTMLFormElement) {
    if (lock.current) return
    lock.current = true; setBusy(true); setError(''); setNotice('')
    try {
      await action(await getFirebaseIdToken(userId))
      if (mounted.current) {
        form?.reset(); setNotice(success); setRevision(value=>value+1); onChanged()
      }
    } catch (reason) { if (mounted.current) setError(reason instanceof Error ? reason.message : 'Organization update failed.') }
    finally {lock.current = false; if (mounted.current) setBusy(false)}
  }
  function newOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const name = String(new FormData(form).get('organizationName')).trim()
    void run(token=>createOrganization(token,name), `Created ${name}. You can now publish events under it.`,form)
  }
  function assign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    void run(token=>setOrganizationAdmin(token,String(data.get('organizationId')),String(data.get('userId')).trim(),'grant'), 'Organization admin access granted.',form)
  }
  return <details className="mt-6 border-t border-border pt-5" onToggle={event=>setOpen(event.currentTarget.open)}>
    <summary className="cursor-pointer font-semibold">Manage organizations <span className="ml-1 text-xs text-secondary">Explicit admin</span></summary>
    {open && <div className="mt-4 space-y-5">
      <p className="text-sm text-muted">Create organizations and manage their regular admins. Regular admins can publish events only for their assigned organizations.</p>
      <form onSubmit={newOrganization} className="quest-subpanel p-4 space-y-3">
        <label className="block text-sm font-semibold">New organization name<input name="organizationName" required minLength={2} maxLength={120} className="global-event-input" placeholder="National Society of Black Engineers" /></label>
        <button type="submit" disabled={busy} className="hud-button px-4 py-2 text-sm font-semibold">Create organization</button>
      </form>
      {organizations === null && !error && <p role="status" className="text-sm text-muted">Loading organizations…</p>}
      {Boolean(organizations?.length) && <form onSubmit={assign} className="quest-subpanel p-4 space-y-3">
        <label className="block text-sm font-semibold">Organization<select name="organizationId" required className="global-event-input">{organizations?.map(org=><option key={org.id} value={org.id}>{org.name}</option>)}</select></label>
        <label className="block text-sm font-semibold">User ID<input name="userId" required maxLength={128} pattern="[A-Za-z0-9_-]+" className="global-event-input" placeholder="user_…" /></label>
        <p className="text-xs text-muted">The user must have signed in before. This grants regular admin access for the selected organization only.</p>
        <button type="submit" disabled={busy} className="hud-button px-4 py-2 text-sm font-semibold">Assign organization admin</button>
      </form>}
      {organizations?.map(org=><section key={org.id} className="quest-subpanel p-4">
        <h4 className="font-semibold">{org.name}</h4>
        {org.adminUserIds.length === 0 ? <p className="mt-2 text-xs text-muted">No organization-specific admins assigned. Explicit admins can still publish here.</p> : <ul className="mt-3 space-y-2">
          {org.adminUserIds.map(uid=><li key={uid} className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="break-all">{uid}</span>
            <button type="button" disabled={busy} aria-label={`Remove ${uid} from ${org.name}`} className="hud-button px-3 py-2 text-xs"
              onClick={()=>void run(token=>setOrganizationAdmin(token,org.id,uid,'revoke'),'Organization-specific access removed.')}>Remove access</button>
          </li>)}
        </ul>}
      </section>)}
      <p className="text-xs text-muted">These controls manage organization-specific memberships. Explicit admin roles are managed by the app team.</p>
      {error && <p role="alert" className="text-sm" style={{color:'var(--color-error)'}}>{error}</p>}
      {notice && <p role="status" className="text-sm text-secondary">{notice}</p>}
    </div>}
  </details>
}
