import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

class Timestamp {
  toDate() { return new Date('2026-10-17T12:00:00Z') }
}
const source = await readFile(new URL('../src/services/sidequests.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023 },
}).outputText
const record = () => ({
  userId: 'alice', ownerId: 'alice', questId: 'quest-1', status: 'assigned', isActive: true,
  title: 'Tree sketch', description: 'Draw three leaves.', steps: ['Walk there.', 'Draw three leaves.'],
  locationName: 'Verified park', latitude: 29.65, longitude: -82.34,
  placeId: 'google-place-123',
  xpReward: 40, estimatedMinutes: 20, estimatedCostDollars: 0, assignedAt: new Timestamp(),
  userRequest: {
    preferences: 'Explore nature.',
    username: 'Alice',
    location: 'Campus',
    originCoordinates: { latitude: 29.65, longitude: -82.34 },
    time: { selection: '60', customMinutes: null },
    budget: { selection: '0', customDollars: null },
    distance: { maxDistance: 5, unit: 'miles' },
    goals: ['Learn outdoors'],
    vibePreferences: 'Relaxed',
  },
})
async function fixture() {
  const state = { refs: [], callbacks: [], completions: [], abandonments: [], gpsOptions: null, denied: false }
  const context = vm.createContext({ navigator: { geolocation: {
    getCurrentPosition(ok, fail, options) {
      state.gpsOptions = options
      if (state.denied) fail({ code: 1 })
      else ok({ coords: { latitude: 29.6501, longitude: -82.3401, accuracy: 8 } })
    },
  } } })
  const mod = new vm.SourceTextModule(compiled, { context })
  await mod.link((name) => {
    let exports
    if (name === 'firebase/firestore') exports = {
      collection: (...args) => { state.refs.push(args.slice(1)); return args.slice(1) },
      doc: (...args) => { state.refs.push(args.slice(1)); return args.slice(1) },
      onSnapshot: (ref, callback) => { state.callbacks.push(callback); return () => {} }, Timestamp,
    }
    else if (name.endsWith('FirebaseConfig')) exports = { db: {} }
    else exports = {
      MAX_QUEST_REPLACEMENTS: 3,
      requestQuestCompletion: async (...args) => {
        state.completions.push(args)
        return {
          questId: args[1], status: 'completed', stopIndex: args[3], xpAwarded: 40,
          xpAwardedSoFar: 40, completedStops: [args[3]], totalStops: 1,
        }
      },
      requestQuestAbandon: async (...args) => { state.abandonments.push(args) },
      requestPhotoProof: async () => ({ accepted: true, feedback: 'Looks good.' }),
      requestQuestPhotoProofSkip: async () => [],
    }
    return new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value)
    }, { context })
  })
  await mod.evaluate()
  return { api: mod.namespace, state }
}
const plain = (value) => JSON.parse(JSON.stringify(value))

test('active quest subscriptions use Users/uid/sidequests and display generated destinations and server XP', async () => {
  const f = await fixture()
  let rows
  f.api.subscribeToActiveSidequests('alice', (value) => { rows = value }, (message) => assert.fail(message))
  assert.deepEqual(f.state.refs[0], ['Users', 'alice', 'sidequests'])
  f.state.callbacks[0]({ docs: [
    { id: 'quest-1', data: record },
    { id: 'old-preview', data: () => ({ status: 'prepared', isActive: true, xpValue: 999 }) },
    { id: 'completed', data: () => ({ status: 'completed', isActive: false }) },
  ] })
  assert.equal(rows.length, 1)
  assert.equal(rows[0].title, 'Tree sketch')
  assert.equal(rows[0].locationName, 'Verified park')
  assert.equal(rows[0].placeId, 'google-place-123')
  assert.equal(rows[0].xpValue, 40)
  assert.equal(rows[0].latitude, 29.65)
  assert.deepEqual(plain(rows[0].steps), ['Walk there.', 'Draw three leaves.'])
  assert.equal(rows[0].userRequest.preferences, 'Explore nature.')
  assert.deepEqual(plain(rows[0].userRequest.goals), ['Learn outdoors'])
  // The service has no client write/XP/delete imports; none are provided by this fixture.
})

test('stored assignments reject a different account and invalid rewards', async () => {
  const f = await fixture()
  assert.throws(() => f.api.parseActiveSidequest('quest-1', record(), 'bob'), /invalid assignment/)
  assert.throws(() => f.api.parseActiveSidequest('quest-1', { ...record(), xpReward: -1 }, 'alice'), /invalid assignment/)
  assert.throws(() => f.api.parseActiveSidequest('quest-1', { ...record(), userRequest: 'invalid' }, 'alice'), /invalid assignment/)
  assert.throws(() => f.api.parseActiveSidequest('quest-1', { ...record(), placeId: 123 }, 'alice'), /invalid assignment/)
  assert.throws(() => f.api.parseActiveSidequest('quest-1', { ...record(), destinations: {} }, 'alice'), /invalid assignment/)
  const legacy = { ...record() }
  delete legacy.placeId
  assert.equal(f.api.parseActiveSidequest('quest-1', legacy, 'alice').placeId, null)
})

test('active multi-stop assignments retain ordered verified pins and progress', async () => {
  const f = await fixture()
  const data = {
    ...record(),
    locationName: 'First park',
    latitude: 29.65,
    longitude: -82.34,
    placeId: 'first',
    destinations: [
      { locationName: 'First park', latitude: 29.65, longitude: -82.34, placeId: 'first' },
      { locationName: 'Second park', latitude: 29.66, longitude: -82.33, placeId: 'second' },
    ],
    completedStops: [0],
    userRequest: { ...record().userRequest, multiQuest: true },
  }
  const parsed = f.api.parseActiveSidequest('quest-1', data, 'alice')
  assert.deepEqual(plain(parsed.destinations.map((stop) => stop.locationName)), ['First park', 'Second park'])
  assert.deepEqual(plain(parsed.completedStops), [0])
  assert.throws(() => f.api.parseActiveSidequest('quest-1', {
    ...data,
    destinations: [],
  }, 'alice'), /invalid route/)
})

test('completion requests a fresh precise GPS reading and delegates XP to FastAPI', async () => {
  const f = await fixture()
  assert.equal((await f.api.completeSidequest('alice', 'quest-1')).xpAwarded, 40)
  assert.deepEqual(plain(f.state.gpsOptions), { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 })
  assert.deepEqual(plain(f.state.completions), [
    ['alice', 'quest-1', { latitude: 29.6501, longitude: -82.3401, accuracy: 8 }, 0],
  ])
})

test('denied GPS access cannot mark a quest complete or award XP', async () => {
  const f = await fixture()
  f.state.denied = true
  await assert.rejects(f.api.completeSidequest('alice', 'quest-1'), /Enable precise location/)
  assert.equal(f.state.completions.length, 0)
})

test('abandon requests backend deletion for the signed-in user and sidequest', async () => {
  const f = await fixture()
  await f.api.abandonSidequest('alice', 'quest-1')
  assert.deepEqual(plain(f.state.abandonments), [['alice', 'quest-1']])
  await assert.rejects(f.api.abandonSidequest('', 'quest-1'), /Sign in/)
})


test('replacement counter reloads from Firestore and legacy quests start at zero', async () => {
  const f = await fixture()
  assert.equal(f.api.parseActiveSidequest('quest-1', record(), 'alice').replacementCount, 0)
  assert.equal(f.api.parseActiveSidequest('quest-1', { ...record(), replacementCount: 3 }, 'alice').replacementCount, 3)
  for (const value of [-1, 4, 1.5, null, true]) {
    assert.throws(() => f.api.parseActiveSidequest('quest-1', { ...record(), replacementCount: value }, 'alice'), /invalid assignment/)
  }
})


test('Firestore list retains all three independent quests and removes only the abandoned record', async () => {
  const f = await fixture()
  let rows
  f.api.subscribeToActiveSidequests('alice', (value) => { rows = value }, assert.fail)
  const docs = [1, 2, 3].map((i) => ({ id: `quest-${i}`, data: () => ({ ...record(), questId: `quest-${i}`, title: `Mission ${i}` }) }))
  f.state.callbacks[0]({ docs })
  assert.deepEqual(plain(rows.map((row) => row.id).sort()), ['quest-1', 'quest-2', 'quest-3'])
  assert.ok(rows.every((row) => row.steps.length === 2 && row.description === 'Draw three leaves.'))
  await f.api.abandonSidequest('alice', 'quest-2')
  assert.deepEqual(plain(f.state.abandonments), [['alice', 'quest-2']])
  f.state.callbacks[0]({ docs: [docs[0], docs[2]] })
  assert.deepEqual(plain(rows.map((row) => row.id).sort()), ['quest-1', 'quest-3'])
})
