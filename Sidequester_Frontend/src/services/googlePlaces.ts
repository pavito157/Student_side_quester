import { importLibrary, setOptions } from '@googlemaps/js-api-loader'

const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY
let placesLibraryPromise: Promise<google.maps.PlacesLibrary> | undefined
let geocodingLibraryPromise: Promise<google.maps.GeocodingLibrary> | undefined
let mapsLibraryPromise: Promise<google.maps.MapsLibrary> | undefined
let loaderOptionsConfigured = false

function configureLoaderOptions(): void {
  if (loaderOptionsConfigured) return
  if (!apiKey) {
    throw new Error(
      'Missing VITE_GOOGLE_MAPS_API_KEY. Add your restricted Maps key to .env.local.',
    )
  }

  setOptions({ key: apiKey, v: 'weekly' })
  loaderOptionsConfigured = true
}

export function loadPlacesLibrary(): Promise<google.maps.PlacesLibrary> {
  if (!placesLibraryPromise) {
    configureLoaderOptions()
    placesLibraryPromise = importLibrary('places')
  }

  return placesLibraryPromise
}

export function loadGeocodingLibrary(): Promise<google.maps.GeocodingLibrary> {
  if (!geocodingLibraryPromise) {
    configureLoaderOptions()
    geocodingLibraryPromise = importLibrary('geocoding')
  }

  return geocodingLibraryPromise
}

export function loadMapsLibrary(): Promise<google.maps.MapsLibrary> {
  if (!mapsLibraryPromise) {
    configureLoaderOptions()
    mapsLibraryPromise = importLibrary('maps')
  }

  return mapsLibraryPromise
}
