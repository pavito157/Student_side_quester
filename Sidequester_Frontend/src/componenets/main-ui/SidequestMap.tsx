import { useEffect, useRef, useState } from 'react'
import { colors } from '../../constants/colors'
import { loadMapsLibrary } from '../../services/googlePlaces'

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
        const [{ Map, InfoWindow }, { AdvancedMarkerElement }, { DirectionsService, DirectionsRenderer }] =
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
        ) => {
          const pin = document.createElement('button')
          pin.type = 'button'
          pin.textContent = label
          pin.setAttribute('aria-label', accessibleName)
          pin.style.cssText = [
            'display:flex', 'align-items:center', 'justify-content:center', 'min-width:32px',
            'height:32px', 'padding:0 8px', 'border:2px solid white', 'border-radius:9999px',
            `background:${color}`, 'color:white', 'font:700 12px sans-serif',
            'box-shadow:0 2px 8px #0008', 'cursor:pointer',
          ].join(';')
          const content = document.createElement('div')
          content.style.cssText = 'max-width:260px;padding:3px;color:#17251d'
          const title = document.createElement('strong')
          title.textContent = accessibleName
          const description = document.createElement('p')
          description.textContent = detail
          description.style.cssText = 'margin:5px 0 0;font-size:13px;line-height:1.4'
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
        let directionsRenderer: google.maps.DirectionsRenderer | undefined
        if (origin) {
          markerBindings.push(addMarker(
            { lat: origin.latitude, lng: origin.longitude },
            'You', 'Starting point for this sidequest.', colors.primary, 'Your starting location',
          ))
        }
        stops.forEach((stop, index) => {
          markerBindings.push(addMarker(
            { lat: stop.latitude, lng: stop.longitude },
            String(index + 1),
            `${stop.completed ? 'Completed stop. ' : ''}${stop.step}`,
            stop.completed ? colors.success : colors.secondary,
            `Stop ${index + 1}: ${stop.name}`,
          ))
        })

        if (origin) {
          const renderer = new DirectionsRenderer({
            map,
            suppressMarkers: true,
            preserveViewport: true,
            polylineOptions: { strokeColor: colors.primary, strokeOpacity: 0.85, strokeWeight: 5 },
          })
          directionsRenderer = renderer
          new DirectionsService().route({
            origin: { lat: origin.latitude, lng: origin.longitude },
            destination: { lat: stops[0].latitude, lng: stops[0].longitude },
            travelMode: google.maps.TravelMode.WALKING,
          }, (result, status) => {
            if (!isCurrent) return
            if (status === google.maps.DirectionsStatus.OK && result) {
              renderer.setDirections(result)
            } else {
              setMapErrorState({
                key: locationKey,
                message: 'Destinations are shown, but walking directions could not be drawn.',
              })
            }
          })
        }

        return () => {
          directionsRenderer?.setMap(null)
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
          Destinations
        </span>
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
