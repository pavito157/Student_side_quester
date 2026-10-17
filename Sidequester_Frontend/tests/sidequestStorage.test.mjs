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
  xpReward: 40, estimatedMinutes: 20, estimatedCostDollars: 0, assignedAt: new Timestamp(),
})
async function fixture() {
  const state = { refs: [], callbacks: [], completions: [], gpsOptions: null, denied: false }
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
    else exports = { requestQuestCompletion: async (...args) => { state.completions.push(args); return 40 } }
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
  assert.equal(rows[0].xpValue, 40)
  assert.equal(rows[0].latitude, 29.65)
  assert.deepEqual(plain(rows[0].steps), ['Walk there.', 'Draw three leaves.'])
  // The service has no client write/XP/delete imports; none are provided by this fixture.
})

test('stored assignments reject a different account and invalid rewards', async () => {
  const f = await fixture()
  assert.throws(() => f.api.parseActiveSidequest('quest-1', record(), 'bob'), /invalid assignment/)
  assert.throws(() => f.api.parseActiveSidequest('quest-1', { ...record(), xpReward: -1 }, 'alice'), /invalid assignment/)
})

test('completion requests a fresh precise GPS reading and delegates XP to FastAPI', async () => {
  const f = await fixture()
  assert.equal(await f.api.completeSidequest('alice', 'quest-1'), 40)
  assert.deepEqual(plain(f.state.gpsOptions), { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 })
  assert.deepEqual(plain(f.state.completions), [['alice', 'quest-1', { latitude: 29.6501, longitude: -82.3401, accuracy: 8 }]])
})

test('denied GPS access cannot mark a quest complete or award XP', async () => {
  const f = await fixture()
  f.state.denied = true
  await assert.rejects(f.api.completeSidequest('alice', 'quest-1'), /Enable precise location/)
  assert.equal(f.state.completions.length, 0)
})
