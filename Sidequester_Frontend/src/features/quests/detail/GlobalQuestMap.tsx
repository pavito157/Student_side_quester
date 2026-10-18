import { useEffect, useMemo, useRef, useState } from 'react'
import { colors } from '../../../constants/colors'
import { loadMapsLibrary } from '../../../services/googlePlaces'
import { buildQuestMapPins } from '../../../services/questMapData'
import { navigateTo } from '../../../services/navigation'
import type { ActiveSidequest } from '../../../types/sidequest'
import type { PublicGlobalQuest } from '../../../services/globalQuests'

type GlobalQuestMapProps = {
  quests: PublicGlobalQuest[]
  activeQuests?: ActiveSidequest[]
}

type MapStatus = {
  key: string
  location: string
  error: string
}

const DEFAULT_MAP_CENTER = { lat: 29.6516, lng: -82.3248 }

const EMPTY_ACTIVE: ActiveSidequest[] = []

function GlobalQuestMap({ quests, activeQuests = EMPTY_ACTIVE }: GlobalQuestMapProps) {
  const mapElementRef = useRef<HTMLDivElement>(null)
  const [mapStatus, setMapStatus] = useState<MapStatus>({ key: '', location: '', error: '' })
  const mappableQuests = useMemo(() => buildQuestMapPins(quests, activeQuests), [quests, activeQuests])
  const mapKey = JSON.stringify(mappableQuests)
  const currentStatus = mapStatus.key === mapKey
    ? mapStatus
    : { key: mapKey, location: '', error: '' }

  useEffect(() => {
    let isCurrent = true
    let infoWindow: google.maps.InfoWindow | undefined
    const markers: google.maps.marker.AdvancedMarkerElement[] = []

    async function mountMap() {
      if (!mapElementRef.current) return

      try {
        const [{ Map, InfoWindow }, { AdvancedMarkerElement }] = await Promise.all([
          loadMapsLibrary(),
          google.maps.importLibrary('marker') as Promise<google.maps.MarkerLibrary>,
        ])
        if (!isCurrent || !mapElementRef.current) return

        const bounds = new google.maps.LatLngBounds()
        for (const quest of mappableQuests) {
          bounds.extend({ lat: quest.latitude, lng: quest.longitude })
        }

        const mapInstance = new Map(mapElementRef.current, {
          center: mappableQuests.length ? bounds.getCenter() : DEFAULT_MAP_CENTER,
          zoom: mappableQuests.length ? 14 : 13,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          clickableIcons: false,
          backgroundColor: '#0a2217',
          mapId: 'DEMO_MAP_ID',
        })
        if (mappableQuests.length > 1) mapInstance.fitBounds(bounds, 48)

        const questInfoWindow = new InfoWindow()
        infoWindow = questInfoWindow

        const overlaps = new globalThis.Map<string, number>()
        for (const quest of mappableQuests) {
          const pointKey = `${quest.latitude},${quest.longitude}`
          const samePlace = mappableQuests.filter(pin => pin.latitude === quest.latitude && pin.longitude === quest.longitude).length
          const ordinal = overlaps.get(pointKey) ?? 0
          overlaps.set(pointKey, ordinal + 1)
          const markerContent = document.createElement('div')
          markerContent.style.cssText = 'display:flex;flex-direction:column;align-items:center'
          if (samePlace > 1) markerContent.style.transform = `translateX(${(ordinal - (samePlace - 1) / 2) * 72}px)`
          const pin = document.createElement('button')
          pin.type = 'button'
          pin.textContent = 'Check-in'
          pin.setAttribute(
            'aria-label',
            `${quest.title} at ${quest.locationName}. Attendance check-in, no XP. Open global quest.`,
          )
          pin.className = 'cozy-map-pin'
          markerContent.style.paddingBottom = '12px'
          markerContent.append(pin)

          const preview = document.createElement('div')
          preview.style.cssText = 'max-width:280px;padding:4px;color:#17251d'
          const title = document.createElement('strong')
          title.textContent = quest.title
          const organization = document.createElement('p')
          organization.textContent = quest.organizationName
          organization.style.cssText = 'margin:4px 0 0;font-size:12px'
          const location = document.createElement('p')
          location.textContent = `${quest.locationName} · attendance check-in only; no XP`
          location.style.cssText = 'margin:4px 0 0;font-size:13px;line-height:1.4'
          const description = document.createElement('p')
          description.textContent = quest.description.length > 220 ? `${quest.description.slice(0,220)}…` : quest.description
          description.style.cssText = 'margin:6px 0 0;font-size:13px;line-height:1.4'
          const directions = document.createElement('a')
          directions.href = `https://www.google.com/maps/dir/?api=1&destination=${quest.latitude},${quest.longitude}`
          directions.target = '_blank'
          directions.rel = 'noreferrer'
          directions.textContent = 'Get directions'
          directions.style.cssText = 'display:inline-block;margin-top:8px;color:#0861e8;font-weight:700'
          const openQuest = document.createElement('a')
          openQuest.href = quest.path
          openQuest.textContent = 'Open quest →'
          openQuest.style.cssText = 'display:block;margin-top:8px;color:#0861e8;font-weight:700'
          openQuest.addEventListener('click', event => { if (!event.metaKey && !event.ctrlKey) { event.preventDefault(); navigateTo(quest.path) } })
          preview.append(title, organization, location, description, openQuest, directions)

          const marker = new AdvancedMarkerElement({
            map: mapInstance,
            position: { lat: quest.latitude, lng: quest.longitude },
            title: `${quest.title} · attendance check-in`,
            content: markerContent,
          })
          const showPreview = () => {
            questInfoWindow.setContent(preview)
            questInfoWindow.open({ map: mapInstance, anchor: marker, shouldFocus: false })
          }
          pin.addEventListener('mouseenter', showPreview)
          pin.addEventListener('focus', showPreview)
          pin.addEventListener('click', () => navigateTo(quest.path))
          markers.push(marker)
        }

        function frameEventLocations() {
          if (mappableQuests.length > 1) {
            mapInstance.fitBounds(bounds, 48)
          } else if (mappableQuests.length === 1) {
            mapInstance.setCenter(bounds.getCenter())
            mapInstance.setZoom(14)
          } else {
            mapInstance.setCenter(DEFAULT_MAP_CENTER)
            mapInstance.setZoom(13)
          }
        }

        if (!navigator.geolocation) {
          frameEventLocations()
          setMapStatus({
            key: mapKey,
            location: 'Current location is unavailable; global quest venues are shown.',
            error: '',
          })
          return
        }

        setMapStatus({ key: mapKey, location: 'Finding your location…', error: '' })
        navigator.geolocation.getCurrentPosition(
          (position) => {
            if (!isCurrent) return
            const userLocation = {
              lat: position.coords.latitude,
              lng: position.coords.longitude,
            }
            const userMarker = document.createElement('div')
            userMarker.style.cssText = 'display:flex;align-items:center;gap:6px;padding:5px 9px;border:2px solid white;border-radius:9999px;background:#0861e8;color:white;font:700 12px system-ui,sans-serif;box-shadow:0 2px 8px #0008;white-space:nowrap'
            const userDot = document.createElement('span')
            userDot.setAttribute('aria-hidden', 'true')
            userDot.style.cssText = 'width:10px;height:10px;border:2px solid white;border-radius:50%;background:#39c5ff'
            const userLabel = document.createElement('span')
            userLabel.textContent = 'You'
            userMarker.append(userDot, userLabel)
            markers.push(new AdvancedMarkerElement({
              map: mapInstance,
              position: userLocation,
              title: 'Your current location',
              content: userMarker,
            }))

            const visibleBounds = new google.maps.LatLngBounds()
            for (const quest of mappableQuests) {
              visibleBounds.extend({ lat: quest.latitude, lng: quest.longitude })
            }
            visibleBounds.extend(userLocation)
            if (mappableQuests.length) mapInstance.fitBounds(visibleBounds, 48)
            else {
              mapInstance.setCenter(userLocation)
              mapInstance.setZoom(15)
            }
            setMapStatus({
              key: mapKey,
              location: 'Your location and global quest venues are shown.',
              error: '',
            })
          },
          () => {
            if (!isCurrent) return
            frameEventLocations()
            setMapStatus({
              key: mapKey,
              location: 'Current location is unavailable; global quest venues are shown.',
              error: '',
            })
          },
          { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 },
        )
      } catch (error) {
        if (isCurrent) {
          setMapStatus({
            key: mapKey,
            location: '',
            error: error instanceof Error ? error.message : 'Could not load the campus quest map.',
          })
        }
      }
    }

    void mountMap()
    return () => {
      isCurrent = false
      infoWindow?.close()
      for (const marker of markers) marker.map = null
    }
  }, [mapKey, mappableQuests])

  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-border">
      <div aria-label="Map key" className="flex flex-wrap gap-3 border-b border-border px-3 py-3 text-xs">
        <span><span aria-hidden="true" style={{color:'#e88932'}}>●</span> Orange pins: event check-ins · no XP</span>
        <span><span aria-hidden="true" style={{color:'#0861e8'}}>●</span> You: current location</span>
      </div>
      <div
        ref={mapElementRef}
        role="region"
        aria-label="Global quest map: campus and organization event check-ins; no XP."
        className="h-[min(62vh,34rem)] min-h-72 w-full"
      />
      {mappableQuests.length === 0 && (
        <p className="border-t border-border px-3 py-2 text-xs text-muted">
          {quests.length
            ? 'No valid venue coordinates are available for these events.'
            : 'No upcoming global quests are available to pin yet.'}
        </p>
      )}
      {currentStatus.location && (
        <p className="border-t border-border px-3 py-2 text-xs text-muted">
          {currentStatus.location}
        </p>
      )}
      {currentStatus.error && (
        <p role="alert" className="border-t border-border px-3 py-2 text-xs" style={{ color: colors.error }}>
          Quest cards remain available. {currentStatus.error}
        </p>
      )}
    </div>
  )
}

export default GlobalQuestMap
