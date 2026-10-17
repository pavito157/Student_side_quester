import { useEffect, useRef, useState } from 'react'
import { colors } from '../../constants/colors'
import { loadGeocodingLibrary, loadMapsLibrary } from '../../services/googlePlaces'

type SidequestMapProps = {
  location: string
  latitude: number | null
  longitude: number | null
}

type MapErrorState = {
  key: string
  message: string
}

function SidequestMap({ location, latitude, longitude }: SidequestMapProps) {
  const mapElementRef = useRef<HTMLDivElement>(null)
  const [mapErrorState, setMapErrorState] = useState<MapErrorState>({ key: '', message: '' })
  const hasCoordinates = latitude !== null && longitude !== null
  const hasSearchableAddress = location !== 'Anywhere' && location !== 'Not selected'
  const locationKey = JSON.stringify([location, latitude, longitude])
  const mapError = mapErrorState.key === locationKey ? mapErrorState.message : ''

  useEffect(() => {
    let isCurrent = true

    async function mountMap() {
      if (!hasCoordinates && !hasSearchableAddress) {
        setMapErrorState({
          key: locationKey,
          message: 'No specific location was saved for this sidequest.',
        })
        return
      }

      try {
        const [{ Map }, { AdvancedMarkerElement }, position] = await Promise.all([
          loadMapsLibrary(),
          google.maps.importLibrary('marker') as Promise<google.maps.MarkerLibrary>,
          hasCoordinates
            ? Promise.resolve({ lat: latitude, lng: longitude })
            : loadGeocodingLibrary().then(async ({ Geocoder }) => {
                const { results } = await new Geocoder().geocode({ address: location })
                const point = results[0]?.geometry.location
                if (!point) throw new Error('Google Maps could not find this address.')
                return { lat: point.lat(), lng: point.lng() }
              }),
        ])
        if (!isCurrent || !mapElementRef.current) return

        const map = new Map(mapElementRef.current, {
          center: position,
          zoom: 15,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          clickableIcons: false,
          backgroundColor: '#0a2217',
          mapId: 'DEMO_MAP_ID',
        })
        new AdvancedMarkerElement({ map, position, title: location })
      } catch (error) {
        if (isCurrent) {
          setMapErrorState({
            key: locationKey,
            message: error instanceof Error ? error.message : 'Could not load the map.',
          })
        }
      }
    }

    void mountMap()
    return () => {
      isCurrent = false
    }
  }, [hasCoordinates, hasSearchableAddress, latitude, longitude, location, locationKey])

  return (
    <section aria-label="Sidequest location map" className="rpg-panel overflow-hidden">
      {hasCoordinates || hasSearchableAddress ? (
        <div ref={mapElementRef} className="h-80 w-full sm:h-[26rem]" />
      ) : (
        <div className="flex h-80 items-center justify-center px-6 text-center sm:h-[26rem]">
          <p className="max-w-sm text-sm leading-relaxed" style={{ color: colors.muted }}>
            {mapError || 'No specific location was saved for this sidequest.'}
          </p>
        </div>
      )}
      {mapError && (hasCoordinates || hasSearchableAddress) && (
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
