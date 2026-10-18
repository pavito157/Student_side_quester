import { useEffect, useRef, useState } from 'react'
import { colors } from '../../../constants/colors'
import { loadMapsLibrary } from '../../../services/googlePlaces'
import { walkingRouteLocations } from '../../../services/questDirections'

export type SidequestMapStop = {
  name: string
  placeId?: string | null
  latitude: number
  longitude: number
  step: string
  completed: boolean
}

type SidequestMapProps = {
  stops: SidequestMapStop[]
  origin: { latitude: number; longitude: number } | null
}

type MapErrorState = { key: string; message: string }

const activeRouteBlue = '#4285F4'
const mutedRouteBlue = '#8AB4F8'

function SidequestMap({ stops, origin }: SidequestMapProps) {
  const mapElementRef = useRef<HTMLDivElement>(null)
  const [mapErrorState, setMapErrorState] = useState<MapErrorState>({ key: '', message: '' })
  const locationKey = JSON.stringify([origin, stops])
  const mapError = mapErrorState.key === locationKey ? mapErrorState.message : ''

  useEffect(() => {
    let isCurrent = true

    async function mountMap() {
      if (stops.length === 0) {
        setMapErrorState({ key: locationKey, message: 'No verified destinations were saved for this sidequest.' })
        return
      }

      try {
        const [{ Map, InfoWindow }, { AdvancedMarkerElement }, { Route, TravelMode }] =
          await Promise.all([
            loadMapsLibrary(),
            google.maps.importLibrary('marker') as Promise<google.maps.MarkerLibrary>,
            google.maps.importLibrary('routes') as Promise<google.maps.RoutesLibrary>,
          ])
        if (!isCurrent || !mapElementRef.current) return

        const bounds = new google.maps.LatLngBounds()
        for (const stop of stops) bounds.extend({ lat: stop.latitude, lng: stop.longitude })
        if (origin) bounds.extend({ lat: origin.latitude, lng: origin.longitude })

        const map = new Map(mapElementRef.current, {
          center: { lat: stops[0].latitude, lng: stops[0].longitude },
          zoom: 14,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          clickableIcons: false,
          backgroundColor: '#0a2217',
          mapId: 'DEMO_MAP_ID',
        })
        if (origin || stops.length > 1) map.fitBounds(bounds, 56)

        const infoWindow = new InfoWindow()
        const addMarker = (
          position: google.maps.LatLngLiteral,
          label: string,
          detail: string,
          color: string,
          accessibleName: string,
          isEmphasized = true,
        ) => {
          const pin = document.createElement('button')
          pin.type = 'button'
          pin.textContent = label
          pin.setAttribute('aria-label', accessibleName)
          pin.style.cssText = [
            'display:flex', 'align-items:center', 'justify-content:center', 'min-width:32px',
            'height:32px', 'padding:0 8px', 'border:2px solid white', 'border-radius:9999px',
            `background:${color}`, 'color:white', 'font:700 12px sans-serif',
            `opacity:${isEmphasized ? 1 : 0.9}`,
            `box-shadow:${isEmphasized ? '0 0 0 4px #f9731633,0 2px 8px #0008' : '0 2px 8px #0008'}`,
            'cursor:pointer',
          ].join(';')
          const content = document.createElement('div')
          content.className = 'quest-map-popup'
          const title = document.createElement('strong')
          title.textContent = accessibleName
          const description = document.createElement('p')
          description.textContent = detail
          description.className = 'quest-map-popup-description'
          content.append(title, description)

          const marker = new AdvancedMarkerElement({ map, position, title: accessibleName, content: pin })
          const showDetails = () => {
            infoWindow.setContent(content)
            infoWindow.open({ map, anchor: marker, shouldFocus: false })
          }
          const hideDetails = () => infoWindow.close()
          pin.addEventListener('mouseenter', showDetails)
          pin.addEventListener('mouseleave', hideDetails)
          pin.addEventListener('focus', showDetails)
          pin.addEventListener('blur', hideDetails)
          pin.addEventListener('click', showDetails)
          return { marker, pin, showDetails, hideDetails }
        }

        const markerBindings: Array<{
          marker: google.maps.marker.AdvancedMarkerElement
          pin: HTMLButtonElement
          showDetails: () => void
          hideDetails: () => void
        }> = []
        let routePolylines: google.maps.Polyline[] = []
        const nextStopIndex = stops.findIndex((stop) => !stop.completed)
        if (origin) {
          markerBindings.push(addMarker(
            { lat: origin.latitude, lng: origin.longitude },
            'You', 'Starting point for this sidequest.', colors.primary, 'Your starting location',
          ))
        }
        stops.forEach((stop, index) => {
          const isNextStop = index === nextStopIndex
          markerBindings.push(addMarker(
            { lat: stop.latitude, lng: stop.longitude },
            String(index + 1),
            `${stop.completed ? 'Completed stop. ' : isNextStop ? 'Next destination. ' : ''}${stop.step}`,
            colors.secondary,
            `${isNextStop ? 'Next destination' : stop.completed ? 'Completed stop' : 'Upcoming stop'} ${index + 1}: ${stop.name}`,
            isNextStop,
          ))
        })

        const routeLocations = walkingRouteLocations(stops, origin)
        if (routeLocations) {
          void Route.computeRoutes({
            ...routeLocations,
            travelMode: TravelMode.WALKING,
            fields: ['path', 'legs', 'viewport'],
          }).then(({ routes }) => {
            const route = routes?.[0]
            if (!isCurrent) return
            if (route?.legs?.length) {
              if (route.viewport) bounds.union(route.viewport)
              map.fitBounds(bounds, 56)
              routePolylines = route.legs.flatMap((leg, index) => leg.path.length > 0
                ? [new google.maps.Polyline({
                  map,
                  path: leg.path,
                  strokeColor: index === nextStopIndex ? activeRouteBlue : mutedRouteBlue,
                  strokeOpacity: index === nextStopIndex ? 0.95 : 0.5,
                  strokeWeight: index === nextStopIndex ? 6 : 4,
                  clickable: false,
                })]
                : [])
            } else {
              setMapErrorState({
                key: locationKey,
                message: 'Destinations are shown, but walking directions could not be drawn.',
              })
            }
          }).catch((error: unknown) => {
            if (isCurrent) {
              const detail = error instanceof Error ? ` ${error.message}` : ''
              setMapErrorState({
                key: locationKey,
                message: `Destinations are shown, but walking directions could not be drawn.${detail}`,
              })
            }
          })
        }

        return () => {
          routePolylines.forEach((polyline) => polyline.setMap(null))
          for (const { marker, pin, hideDetails } of markerBindings) {
            hideDetails()
            marker.map = null
            pin.remove()
          }
        }
      } catch (error) {
        if (isCurrent) {
          setMapErrorState({
            key: locationKey,
            message: error instanceof Error ? error.message : 'Could not load the map.',
          })
        }
      }
    }

    let cleanupMap: (() => void) | undefined
    void mountMap().then((cleanup) => { cleanupMap = cleanup })
    return () => {
      isCurrent = false
      cleanupMap?.()
    }
  }, [locationKey, origin, stops])

  return (
    <section aria-label="Sidequest route map" className="rpg-panel overflow-hidden">
      <div ref={mapElementRef} className="h-80 w-full sm:h-[26rem]" />
      <div className="flex flex-wrap gap-x-5 gap-y-2 border-t px-4 py-3 text-xs" style={{ borderColor: colors.border }}>
        {origin && (
          <span className="inline-flex items-center gap-2" style={{ color: colors.foreground }}>
            <span className="size-3 rounded-full" style={{ backgroundColor: colors.primary }} />
            Your starting location
          </span>
        )}
        <span className="inline-flex items-center gap-2" style={{ color: colors.foreground }}>
          <span className="size-3 rounded-full" style={{ backgroundColor: colors.secondary }} />
          Next destination
        </span>
        <span className="inline-flex items-center gap-2" style={{ color: colors.muted }}>
          <span className="size-3 rounded-full" style={{ backgroundColor: colors.secondary, opacity: 0.9 }} />
          Other stops
        </span>
        {origin && stops.length > 0 && (
          <>
            <span className="inline-flex items-center gap-2" style={{ color: colors.foreground }}>
              <span className="h-0.5 w-5 rounded" style={{ backgroundColor: activeRouteBlue }} />
              Next leg
            </span>
            <span className="inline-flex items-center gap-2" style={{ color: colors.muted }}>
              <span className="h-0.5 w-5 rounded" style={{ backgroundColor: mutedRouteBlue, opacity: 0.5 }} />
              Later legs
            </span>
          </>
        )}
        <span style={{ color: colors.muted }}>Hover or focus a pin for stop details.</span>
      </div>
      {mapError && (
        <p role="status" className="border-t px-4 py-3 text-sm" style={{
          borderColor: colors.border,
          color: colors.warning,
        }}>
          {mapError}
        </p>
      )}
    </section>
  )
}

export default SidequestMap
