import { useEffect, useRef, useState } from 'react'
import { colors } from '../../../../constants/colors'
import CurrentLocationButton from './CurrentLocationButton'
import { loadPlacesLibrary } from '../../../../services/googlePlaces'
import type { CurrentLocation } from '../../../../services/currentLocation'

type WhereButtonProps = {
  autoLocate: boolean
  value: string
  onChange: (
    value: string,
    coordinates: Pick<CurrentLocation, 'latitude' | 'longitude'> | null,
  ) => void
}

function WhereButton({ autoLocate, value, onChange }: WhereButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const autocompleteRef = useRef<google.maps.places.PlaceAutocompleteElement | null>(null)
  const onChangeRef = useRef(onChange)
  const [loadError, setLoadError] = useState('')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    let isCurrent = true
    let autocomplete: google.maps.places.PlaceAutocompleteElement | undefined

    async function mountAutocomplete() {
      try {
        const places = await loadPlacesLibrary()
        if (!isCurrent || !containerRef.current) return

        autocomplete = new places.PlaceAutocompleteElement({
          placeholder: 'Search places',
          includedRegionCodes: ['us'],
          locationBias: {
            center: { lat: 29.6516, lng: -82.3248 },
            radius: 20000,
          },
        })
        autocomplete.className = 'google-place-autocomplete'
        autocomplete.setAttribute('aria-label', 'Where')
        autocomplete.addEventListener('input', handlePlaceInput)
        autocomplete.addEventListener('gmp-select', handlePlaceSelect)
        containerRef.current.replaceChildren(autocomplete)
        autocompleteRef.current = autocomplete
        setIsLoading(false)
      } catch (error) {
        if (isCurrent) {
          setLoadError(
            error instanceof Error ? error.message : 'Could not load Google Places.',
          )
          setIsLoading(false)
        }
      }
    }

    function handlePlaceInput() {
      if (!isCurrent || !autocomplete) return
      onChangeRef.current(autocomplete.value, null)
    }

    async function handlePlaceSelect(event: google.maps.places.PlacePredictionSelectEvent) {
      try {
        const place = event.placePrediction.toPlace()
        await place.fetchFields({ fields: ['displayName', 'formattedAddress', 'location'] })

        const placeName =
          place.displayName ??
          place.formattedAddress ??
          event.placePrediction.text.toString()

        const location = place.location
        if (isCurrent && placeName) {
          onChangeRef.current(
            placeName,
            location ? { latitude: location.lat(), longitude: location.lng() } : null,
          )
        }
      } catch (error) {
        if (isCurrent) {
          setLoadError(
            error instanceof Error ? error.message : 'Could not load the selected place.',
          )
        }
      }
    }

    void mountAutocomplete()
    return () => {
      isCurrent = false
      autocomplete?.removeEventListener('input', handlePlaceInput)
      autocomplete?.removeEventListener('gmp-select', handlePlaceSelect)
      autocomplete?.remove()
      autocompleteRef.current = null
    }
  }, [])

  useEffect(() => {
    const autocomplete = autocompleteRef.current
    if (autocomplete) autocomplete.value = value === 'any' ? '' : value
  }, [value])

  return (
    <div className="location-controls flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start">
      <div
        ref={containerRef}
        className="google-place-autocomplete-shell min-h-12 w-full min-w-0 flex-1 rounded-lg"
        aria-busy={isLoading}
      />
      <div className="location-actions flex flex-wrap items-center gap-3">
        <CurrentLocationButton
          autoLocate={autoLocate}
          onLocationFound={({ label, latitude, longitude }) =>
            onChange(label, { latitude, longitude })
          }
        />
        <button
          type="button"
          aria-pressed={value === 'any'}
          onClick={() => onChange('any', null)}
          className="anywhere-button inline-flex min-h-12 cursor-pointer items-center rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{
            color: value === 'any' ? colors.primary : colors.muted,
            outlineColor: colors.primary,
          }}
        >
          Anywhere
        </button>
      </div>
      {loadError && (
        <p className="mt-2 text-xs" role="alert" style={{ color: colors.error }}>
          {loadError}
        </p>
      )}
    </div>
  )
}

export default WhereButton
