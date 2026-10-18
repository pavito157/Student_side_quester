export type GlobalQuest = {
  id: string; organizationId: string; organizationName: string; title: string; description: string
  locationName: string; latitude: number; longitude: number; startsAt: string; endsAt: string
  xpReward: number; radiusMeters: number; maxAccuracyMeters: number
  verificationMode: 'gps' | 'honor'; graceMinutes: number; completed: boolean
}
export type PublicGlobalQuest = Pick<GlobalQuest,
  'id' | 'organizationName' | 'title' | 'description' | 'locationName'
  | 'latitude' | 'longitude' | 'startsAt' | 'endsAt' | 'xpReward' | 'graceMinutes'
>
export type GlobalQuestFeed = {
  adminRole: 'explicit_admin' | 'regular_admin' | 'member'
  quests: GlobalQuest[]
  organizations: { id: string; name: string }[]
  defaults: { xpReward: number; radiusMeters: number; verificationMode: 'gps' | 'honor'; graceMinutes: number }
}
export type NewGlobalQuest = {
  organizationId: string; title: string; description: string; locationName: string
  latitude: number; longitude: number; startsAt: string; endsAt: string
}
const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')
async function request(token: string | null, path: string, method: string, body?: unknown, signal?: AbortSignal) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method, signal, credentials: 'omit',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(typeof data?.detail === 'string' ? data.detail : 'Global quest request failed. Check the event details and try again.')
  if (!data || typeof data !== 'object') throw new Error('Invalid global quest response.')
  return data
}
export async function getGlobalQuests(token: string, signal?: AbortSignal): Promise<GlobalQuestFeed> {
  const data = await request(token, '/global-quests', 'GET', undefined, signal)
  if (!['explicit_admin','regular_admin','member'].includes(data.adminRole)
    || !Array.isArray(data.quests) || !Array.isArray(data.organizations) || !data.defaults
    || !data.quests.every((quest: GlobalQuest) => typeof quest.id === 'string'
      && typeof quest.title === 'string'
      && typeof quest.locationName === 'string'
      && typeof quest.latitude === 'number' && Number.isFinite(quest.latitude) && Math.abs(quest.latitude) <= 90
      && typeof quest.longitude === 'number' && Number.isFinite(quest.longitude) && Math.abs(quest.longitude) <= 180
      && Number.isInteger(quest.xpReward)
      && Number.isFinite(Date.parse(quest.startsAt)) && Number.isFinite(Date.parse(quest.endsAt)))) {
    throw new Error('Invalid global quest feed.')
  }
  return data
}
export async function getPublicGlobalQuests(signal?: AbortSignal): Promise<PublicGlobalQuest[]> {
  const data = await request(null, '/global-quests/public', 'GET', undefined, signal)
  if (!Array.isArray(data) || !data.every((quest: PublicGlobalQuest) =>
    typeof quest.id === 'string' && typeof quest.organizationName === 'string'
      && typeof quest.title === 'string' && typeof quest.description === 'string'
      && typeof quest.locationName === 'string'
      && typeof quest.latitude === 'number' && Number.isFinite(quest.latitude) && Math.abs(quest.latitude) <= 90
      && typeof quest.longitude === 'number' && Number.isFinite(quest.longitude) && Math.abs(quest.longitude) <= 180
      && Number.isInteger(quest.xpReward)
      && Number.isFinite(Date.parse(quest.startsAt)) && Number.isFinite(Date.parse(quest.endsAt))
      && Number.isInteger(quest.graceMinutes) && quest.graceMinutes >= 0 && quest.graceMinutes <= 60)) {
    throw new Error('Invalid public global quest feed.')
  }
  return data as PublicGlobalQuest[]
}
export async function createGlobalQuest(token: string, payload: NewGlobalQuest) {
  return request(token, '/global-quests', 'POST', payload)
}
export async function checkInGlobalQuest(token: string, event: GlobalQuest): Promise<{ xpAwarded: number }> {
  let position = {}
  if (event.verificationMode === 'gps') {
    if (!navigator.geolocation) throw new Error('This browser does not support GPS check-in.')
    const location = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve,
        () => reject(new Error('Could not get your location. Enable precise location and try again.')),
        { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 })
    })
    position = { latitude: location.coords.latitude, longitude: location.coords.longitude, accuracy: location.coords.accuracy }
  }
  const data = await request(token, `/global-quests/${encodeURIComponent(event.id)}/check-in`, 'POST', position)
  if (data.status !== 'completed' || !Number.isInteger(data.xpAwarded)) throw new Error('Invalid check-in response. Refresh your events before retrying.')
  return data
}

export type ManagedOrganization = { id: string; name: string; adminUserIds: string[] }
export async function getManagedOrganizations(token: string, signal?: AbortSignal): Promise<ManagedOrganization[]> {
  const data = await request(token, '/organization-admin', 'GET', undefined, signal)
  if (!Array.isArray(data.organizations) || !data.organizations.every((org: ManagedOrganization) =>
    typeof org.id === 'string' && typeof org.name === 'string' && Array.isArray(org.adminUserIds)
      && org.adminUserIds.every((uid) => typeof uid === 'string'))) throw new Error('Invalid organization access response.')
  return data.organizations
}
export async function createOrganization(token: string, name: string) {
  return request(token, '/organizations', 'POST', {name})
}
export async function setOrganizationAdmin(token: string, organizationId: string, userId: string, action: 'grant' | 'revoke') {
  return request(token, `/organizations/${encodeURIComponent(organizationId)}/admins`, 'PUT', {userId, action})
}
