import type { PublicGlobalQuest } from './globalQuests'
import type { ActiveSidequest } from '../types/sidequest'

export type QuestMapPin = {
  id: string; questId: string; title: string; description: string; locationName: string
  latitude: number; longitude: number; xpReward: number; path: string
  kind: 'accepted' | 'available'; color: string; label: string; group: string
  stopNumber: number; totalStops: number; completed: boolean
}
export const QUEST_MAP_COLORS = ['#087f72', '#7250b5', '#2456ad']
export const AVAILABLE_EVENT_COLOR = '#e88932'
const valid = (point: { latitude: number; longitude: number }) =>
  Number.isFinite(point.latitude) && Math.abs(point.latitude) <= 90
  && Number.isFinite(point.longitude) && Math.abs(point.longitude) <= 180

export function buildQuestMapPins(events: PublicGlobalQuest[], active: ActiveSidequest[]): QuestMapPin[] {
  const pins: QuestMapPin[] = []
  const acceptedEvents = new Set(active.map(quest => quest.sourceGlobalEventId).filter(Boolean))
  const ordered = [...active].sort((a,b) => a.id.localeCompare(b.id))
  ordered.forEach((quest, index) => {
    const group = String.fromCharCode(65 + index)
    const destinations = quest.destinations?.length ? quest.destinations : [{
      latitude: quest.latitude, longitude: quest.longitude, locationName: quest.locationName,
    }]
    destinations.forEach((stop, stopIndex) => {
      if (!valid(stop)) return
      pins.push({id: `${quest.id}:${stopIndex}`, questId: quest.id, title: quest.title,
        description: quest.description, locationName: stop.locationName,
        latitude: stop.latitude, longitude: stop.longitude, xpReward: quest.xpValue,
        path: `/sidequests/${encodeURIComponent(quest.id)}`, kind: 'accepted',
        color: QUEST_MAP_COLORS[index % QUEST_MAP_COLORS.length], group,
        label: destinations.length > 1 ? `${group}${stopIndex + 1}` : group,
        stopNumber: stopIndex + 1, totalStops: destinations.length,
        completed: Boolean(quest.completedStops?.includes(stopIndex))})
    })
  })
  events.forEach(event => {
    if (!valid(event) || acceptedEvents.has(event.id)) return
    pins.push({id: `global:${event.id}`,questId:event.id,title:event.title,
      description:event.description,locationName:event.locationName,
      latitude:event.latitude,longitude:event.longitude,xpReward:event.xpReward,
      path:`/global-quests/${encodeURIComponent(event.id)}`,kind:'available',
      color:AVAILABLE_EVENT_COLOR,label:`+${event.xpReward} XP`,group:'',
      stopNumber:1,totalStops:1,completed:false})
  })
  return pins
}
