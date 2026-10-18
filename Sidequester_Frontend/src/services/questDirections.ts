type Point = { latitude: number; longitude: number }
type Stop = Point & { placeId?: string | null }
const coordinate = (point: Point) => `${point.latitude},${point.longitude}`
const mapPoint = (point: Point) => ({ lat: point.latitude, lng: point.longitude })

// Preserve canonical order. Map rendering must not independently reorder stops.
export function walkingRouteLocations(stops: Stop[], origin: Point | null) {
  if (!stops.length || (!origin && stops.length === 1)) return null
  return {
    origin: mapPoint(origin ?? stops[0]),
    intermediates: (origin ? stops.slice(0, -1) : stops.slice(1, -1))
      .map((stop) => ({ location: mapPoint(stop) })),
    destination: mapPoint(stops[stops.length - 1]),
  }
}

export function remainingQuestDirections(stops: Stop[], completedCount: number, origin: Point | null) {
  const links: { url: string; firstStop: number; lastStop: number }[] = []
  // Google Maps URLs support only three intermediate waypoints on mobile.
  // Split longer routes into contiguous sections; never silently omit a stop.
  for (let start = completedCount; start < stops.length; start += 4) {
    const section = stops.slice(start, start + 4)
    const destination = section[section.length - 1]
    const waypoints = section.slice(0, -1)
    const from = start > 0 ? stops[start - 1] : origin
    const params = new URLSearchParams({ api: '1', travelmode: 'walking', destination: coordinate(destination) })
    if (from) params.set('origin', coordinate(from))
    if (destination.placeId) params.set('destination_place_id', destination.placeId)
    if (waypoints.length) {
      params.set('waypoints', waypoints.map(coordinate).join('|'))
      if (waypoints.every((stop) => stop.placeId)) {
        params.set('waypoint_place_ids', waypoints.map((stop) => stop.placeId).join('|'))
      }
    }
    if (`https://www.google.com/maps/dir/?${params}`.length > 2048) {
      // Coordinates still identify every stop if unusually long IDs exceed the URL limit.
      params.delete('waypoint_place_ids')
      params.delete('destination_place_id')
    }
    links.push({ url: `https://www.google.com/maps/dir/?${params}`, firstStop: start + 1, lastStop: start + section.length })
  }
  return links
}
