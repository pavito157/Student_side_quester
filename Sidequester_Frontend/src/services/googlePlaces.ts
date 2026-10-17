import { importLibrary, setOptions } from '@googlemaps/js-api-loader'

const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
let placesLibraryPromise: Promise<google.maps.PlacesLibrary> | undefined
let geocodingLibraryPromise: Promise<google.maps.GeocodingLibrary> | undefined

export function loadPlacesLibrary(): Promise<google.maps.PlacesLibrary> {
  if (!apiKey) {
    throw new Error(
      'Missing VITE_GOOGLE_MAPS_API_KEY. Add your restricted Maps key to .env.local.',
    )
  }

  if (!placesLibraryPromise) {
    setOptions({ key: apiKey, v: 'weekly' })
    placesLibraryPromise = importLibrary('places')
  }

  return placesLibraryPromise
}

export function loadGeocodingLibrary(): Promise<google.maps.GeocodingLibrary> {
  if (!apiKey) {
    throw new Error(
      'Missing VITE_GOOGLE_MAPS_API_KEY. Add your restricted Maps key to .env.local.',
    )
  }

  if (!geocodingLibraryPromise) {
    setOptions({ key: apiKey, v: 'weekly' })
    geocodingLibraryPromise = importLibrary('geocoding')
  }

  return geocodingLibraryPromise
}
