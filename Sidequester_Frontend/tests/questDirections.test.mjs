import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

const source = await readFile(new URL('../src/services/questDirections.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText
const { remainingQuestDirections, walkingRouteLocations } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)
const stops = Array.from({ length: 10 }, (_, index) => ({ latitude: 29.66, longitude: -82.335 + index * 0.002, placeId: `venue-${index}` }))
const origin = { latitude: 29.66, longitude: -82.339 }
const coordinate = (point) => `${point.latitude},${point.longitude}`
const mapPoint = (point) => ({ lat: point.latitude, lng: point.longitude })

test('map walking request and external directions use the same canonical visit order', () => {
  const selected = stops.slice(0, 3)
  const map = walkingRouteLocations(selected, origin)
  assert.deepEqual(map.origin, mapPoint(origin))
  assert.deepEqual(map.intermediates.map((point) => point.location), selected.slice(0, -1).map(mapPoint))
  assert.deepEqual(map.destination, mapPoint(selected.at(-1)))
  const links = remainingQuestDirections(selected, 0, origin)
  assert.equal(links.length, 1)
  const params = new URL(links[0].url).searchParams
  assert.equal(params.get('origin'), coordinate(origin))
  assert.deepEqual(params.get('waypoints').split('|'), selected.slice(0, -1).map(coordinate))
  assert.equal(params.get('destination'), coordinate(selected.at(-1)))
  assert.equal(params.get('travelmode'), 'walking')
})

test('ten-stop route is split into contiguous mobile-safe sections without omissions', () => {
  const links = remainingQuestDirections(stops, 0, origin)
  assert.deepEqual(links.map((link) => [link.firstStop, link.lastStop]), [[1, 4], [5, 8], [9, 10]])
  const visited = links.flatMap((link, index) => {
    const params = new URL(link.url).searchParams
    const waypoints = params.get('waypoints')?.split('|') ?? []
    assert.ok(waypoints.length <= 3)
    assert.ok(link.url.length <= 2048)
    if (index) assert.equal(params.get('origin'), coordinate(stops[links[index - 1].lastStop - 1]))
    return [...waypoints, params.get('destination')]
  })
  assert.deepEqual(visited, stops.map(coordinate))
})

test('progress removes only completed stops and starts at the last completed destination', () => {
  const links = remainingQuestDirections(stops, 3, origin)
  const params = new URL(links[0].url).searchParams
  assert.equal(links[0].firstStop, 4)
  assert.equal(params.get('origin'), coordinate(stops[2]))
  assert.equal(params.get('waypoints').split('|')[0], coordinate(stops[3]))
  assert.deepEqual(remainingQuestDirections(stops, 10, origin), [])
})

test('unknown origin is not fabricated and singleton route still has usable directions', () => {
  assert.equal(walkingRouteLocations(stops.slice(0, 1), null), null)
  assert.equal(new URL(remainingQuestDirections(stops.slice(0, 1), 0, null)[0].url).searchParams.has('origin'), false)
  assert.deepEqual(walkingRouteLocations(stops.slice(0, 3), null).origin, mapPoint(stops[0]))
})

test('oversized place IDs fall back to coordinates without losing route stops', () => {
  const links = remainingQuestDirections(stops.slice(0, 4).map((stop) => ({ ...stop, placeId: 'x'.repeat(1000) })), 0, origin)
  const params = new URL(links[0].url).searchParams
  assert.ok(links[0].url.length <= 2048)
  assert.equal(params.has('waypoint_place_ids'), false)
  assert.deepEqual(params.get('waypoints').split('|'), stops.slice(0, 3).map(coordinate))
})
