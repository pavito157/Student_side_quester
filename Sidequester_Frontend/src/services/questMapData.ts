import type { PublicGlobalQuest } from './globalQuests'
import type { ActiveSidequest } from '../types/sidequest'

export type QuestMapPin = {
  id: string; questId: string; title: string; description: string; locationName: string
  organizationName: string; latitude: number; longitude: number; xpReward: number
  path: string; color: string; label: string
}
export const AVAILABLE_EVENT_COLOR = '#e88932'
const valid = (point: { latitude: number; longitude: number }) =>
  Number.isFinite(point.latitude) && Math.abs(point.latitude) <= 90
  && Number.isFinite(point.longitude) && Math.abs(point.longitude) <= 180

// Personal assignments select the destination page only; they never add map pins.
export function buildQuestMapPins(events: PublicGlobalQuest[], active: ActiveSidequest[]): QuestMapPin[] {
  return events.filter(valid).map(event => {
    const accepted = active.find(quest => quest.sourceGlobalEventId === event.id)
    return {
      id: `global:${event.id}`, questId: event.id, title: event.title,
      description: event.description, organizationName: event.organizationName,
      locationName: event.locationName, latitude: event.latitude, longitude: event.longitude,
      xpReward: 0, color: AVAILABLE_EVENT_COLOR, label: 'Check-in',
      path: accepted ? `/sidequests/${encodeURIComponent(accepted.id)}` : `/global-quests/${encodeURIComponent(event.id)}`,
    }
  })
}
