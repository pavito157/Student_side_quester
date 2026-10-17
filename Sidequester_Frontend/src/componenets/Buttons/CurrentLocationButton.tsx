import { useState } from 'react'
import { colors } from '../../constants/colors'
import { getCurrentLocationLabel } from '../../services/currentLocation'

type CurrentLocationButtonProps = {
  onLocationFound: (location: string) => void
}

function CurrentLocationButton({ onLocationFound }: CurrentLocationButtonProps) {
  const [isLocating, setIsLocating] = useState(false)
  const [error, setError] = useState('')

  async function handleCurrentLocation() {
    setIsLocating(true)
    setError('')
    try {
      onLocationFound(await getCurrentLocationLabel())
    } catch (locationError) {
      setError(
        locationError instanceof Error
          ? locationError.message
          : 'Could not determine your location.',
      )
    } finally {
      setIsLocating(false)
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => void handleCurrentLocation()}
        disabled={isLocating}
        aria-busy={isLocating}
        className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-70"
        style={{
          color: colors.foreground,
          borderColor: colors.border,
          outlineColor: colors.primary,
          backgroundColor: colors.surface,
        }}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          fill="none"
          className="h-4 w-4 shrink-0"
          style={{ color: colors.primary }}
        >
          <circle cx="10" cy="10" r="5.75" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="10" cy="10" r="1.75" fill="currentColor" />
          <path
            d="M10 1.75v2M10 16.25v2M18.25 10h-2M3.75 10h-2"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="1.5"
          />
        </svg>
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
