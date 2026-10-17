import { loadGeocodingLibrary } from './googlePlaces'

function getCoordinates(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Location detection is not supported by this browser.'))
      return
    }

    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      timeout: 10000,
      maximumAge: 60000,
    })
  })
}

function getGeolocationErrorMessage(error: unknown): string {
  if (!(error instanceof GeolocationPositionError)) {
    return error instanceof Error ? error.message : 'Could not determine your location.'
  }

  switch (error.code) {
    case error.PERMISSION_DENIED:
      return 'Location access was denied. Allow location access in your browser to use this.'
    case error.POSITION_UNAVAILABLE:
      return 'Your location is unavailable right now. Try again in a moment.'
    case error.TIMEOUT:
      return 'Location detection timed out. Please try again.'
    default:
      return 'Could not determine your location.'
  }
}

export type CurrentLocation = {
  label: string
  latitude: number
  longitude: number
}

export async function getCurrentLocation(): Promise<CurrentLocation> {
  try {
    const position = await getCoordinates()
    const { latitude, longitude } = position.coords
    const { Geocoder } = await loadGeocodingLibrary()
    const geocoder = new Geocoder()
    const { results } = await geocoder.geocode({
      location: {
        lat: latitude,
        lng: longitude,
      },
    })
    const address = results[0]?.formatted_address

    if (!address) throw new Error('Google Maps could not find an address for your location.')
    return { label: address, latitude, longitude }
  } catch (error) {
    throw new Error(getGeolocationErrorMessage(error))
  }
}

// Preserve the original helper for teammates that only need a display label.
export async function getCurrentLocationLabel(): Promise<string> {
  return (await getCurrentLocation()).label
}
