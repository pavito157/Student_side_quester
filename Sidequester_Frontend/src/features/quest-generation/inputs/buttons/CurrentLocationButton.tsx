import { useEffect, useRef, useState } from 'react'
import { colors } from '../../../../constants/colors'
import { getCurrentLocation, type CurrentLocation } from '../../../../services/currentLocation'

type CurrentLocationButtonProps = {
  autoLocate: boolean
  onLocationFound: (location: CurrentLocation) => void
}

function CurrentLocationButton({ autoLocate, onLocationFound }: CurrentLocationButtonProps) {
  const [isLocating, setIsLocating] = useState(false)
  const [isManualLocating, setIsManualLocating] = useState(false)
  const [error, setError] = useState('')
  const onLocationFoundRef = useRef(onLocationFound)
  const manualLookupStartedRef = useRef(false)

  useEffect(() => {
    onLocationFoundRef.current = onLocationFound
  }, [onLocationFound])

  useEffect(() => {
    if (!autoLocate || !navigator.permissions) return

    let isCurrent = true

    async function locateIfAlreadyAllowed() {
      try {
        const permission = await navigator.permissions.query({ name: 'geolocation' })
        if (!isCurrent || permission.state !== 'granted') return

        setIsLocating(true)
        const location = await getCurrentLocation()
        if (isCurrent && !manualLookupStartedRef.current) {
          onLocationFoundRef.current(location)
        }
      } catch (locationError) {
        if (isCurrent) {
          setError(
            locationError instanceof Error
              ? locationError.message
              : 'Could not determine your location.',
          )
        }
      } finally {
        if (isCurrent) setIsLocating(false)
      }
    }

    void locateIfAlreadyAllowed()

    return () => {
      isCurrent = false
    }
  }, [autoLocate])

  async function handleCurrentLocation() {
    manualLookupStartedRef.current = true
    setIsLocating(true)
    setIsManualLocating(true)
    setError('')
    try {
      onLocationFoundRef.current(await getCurrentLocation())
    } catch (locationError) {
      setError(
        locationError instanceof Error
          ? locationError.message
          : 'Could not determine your location.',
      )
    } finally {
      setIsLocating(false)
      setIsManualLocating(false)
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => void handleCurrentLocation()}
        disabled={isManualLocating}
        aria-busy={isLocating}
        className="current-location-button inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-70"
        style={{
          color: colors.foreground,
          borderColor: colors.border,
          outlineColor: colors.primary,
          backgroundColor: colors.surface,
        }}
      >
        <img src="/art/cozy/gps.png" alt="" aria-hidden="true" className="cozy-icon size-5" />
        <span>{isLocating ? 'Finding you…' : 'Use my location'}</span>
      </button>
      {error && (
        <p className="mt-2 text-xs leading-relaxed" role="alert" style={{ color: colors.error }}>
          {error}
        </p>
      )}
    </div>
  )
}

export default CurrentLocationButton
