import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
const plain = (x) => JSON.parse(JSON.stringify(x))
const tick = () => new Promise((resolve) => setImmediate(resolve))
async function fixture() {
  const f = { user: { id: 'alice' }, calls: [], tokens: [], denied: false,
    getToken: async () => 'firebase-id-token',
    response: async () => ({ ok: true, status: 200, json: async () => ({ questId: 'quest-1', status: 'completed', xpAwarded: 40, stopIndex: 0, xpAwardedSoFar: 40, completedStops: [0], totalStops: 1 }) }) }
  let slots = [], cursor = 0, key
  const react = {
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], (x) => { slots[i] = x }] },
    useRef(initial) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i] },
  }
  const jsx = (type, props, key) => ({ type, props: props ?? {}, key })
  const context = vm.createContext({ Error,
    navigator: { geolocation: { getCurrentPosition(ok, fail, options) {
      f.gpsOptions = options
      if (f.denied) fail({ code: 1 }); else ok({ coords: { latitude: 29.65, longitude: -82.34, accuracy: 8 } })
    } } },
    fetch: async (...args) => { f.calls.push(args); return f.response(...args) },
  })
  const synthetic = (exports) => new vm.SyntheticModule(Object.keys(exports), function () {
    for (const [key, value] of Object.entries(exports)) this.setExport(key, value)
  }, { context })
  const cache = new Map()
  async function load(file) {
    if (cache.has(file)) return cache.get(file)
    const source = await readFile(new URL(`../src/${file}`, import.meta.url), 'utf8')
    const compiled = ts.transpileModule(source, { compilerOptions: {
      module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023, jsx: ts.JsxEmit.ReactJSX,
    } }).outputText
    const mod = new vm.SourceTextModule(compiled, { context,
      initializeImportMeta(meta) { meta.env = { VITE_API_BASE_URL: 'http://localhost:8000/' } },
    })
    cache.set(file, mod)
    await mod.link((name) => {
      if (name === 'react') return synthetic(react)
      if (name === 'react/jsx-runtime') return synthetic({ jsx, jsxs: jsx })
      // No Clerk getToken/useAuth exported: completion must use Firebase tokens.
      if (name === '@clerk/clerk-react') return synthetic({ useUser: () => ({ user: f.user }) })
      if (name === 'firebase/firestore') return synthetic({ collection() {}, doc() {}, onSnapshot() {}, Timestamp: class {} })
      if (name.endsWith('FirebaseConfig')) return synthetic({ db: {} })
      if (name.endsWith('firebaseSession')) return synthetic({ getFirebaseIdToken: async (uid) => { f.tokens.push(uid); return f.getToken(uid) } })
      return load(`services/${name.split('/').at(-1)}.ts`)
    })
    return mod
  }
  const api = await load('services/questApi.ts'); await api.evaluate(); f.api = api.namespace
  const component = await load('componenets/main-ui/CompleteQuestButton.tsx'); await component.evaluate()
  const nodes = (node) => !node || typeof node !== 'object' ? []
    : [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)]
  f.render = () => {
    const wrapped = component.namespace.default({ assignedQuestId: 'quest-1' })
    if (wrapped.key !== key) { slots = []; key = wrapped.key }
    cursor = 0; f.tree = wrapped.type(wrapped.props)
  }
  f.button = () => nodes(f.tree).find((node) => node.type === 'button').props
  f.message = (role) => nodes(f.tree).find((node) => node.props.role === role)?.props.children
  f.click = () => f.button().onClick()
  f.settle = async () => { await tick(); f.render() }
  f.render(); return f
}
test('teammate helper uses Firebase auth, fresh GPS, canonical API URL and camelCase server XP', async () => {
  const f = await fixture()
  assert.deepEqual(plain(await f.api.completeQuest('alice', 'quest-1')), { status: 'completed', xpAwarded: 40 })
  assert.deepEqual(f.tokens, ['alice'])
  assert.deepEqual(plain(f.gpsOptions), { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 })
  const [url, options] = f.calls[0]
  assert.equal(url, 'http://localhost:8000/quests/quest-1/complete')
  assert.equal(options.headers.Authorization, 'Bearer firebase-id-token')
  assert.deepEqual(JSON.parse(options.body), { latitude: 29.65, longitude: -82.34, accuracy: 8, stopIndex: 0 })
})
test('teammate button blocks duplicate clicks and shows the server reward', async () => {
  const f = await fixture()
  let resolve
  f.response = () => new Promise((done) => { resolve = done })
  f.click(); f.click(); await f.settle()
  assert.equal(f.calls.length, 1); assert.equal(f.button().disabled, true)
  resolve({ ok: true, status: 200, json: async () => ({ questId: 'quest-1', status: 'completed', xpAwarded: 40, stopIndex: 0, xpAwardedSoFar: 40, completedStops: [0], totalStops: 1 }) })
  await f.settle()
  assert.match(f.message('status'), /40 XP/)
  f.click(); await f.settle(); assert.equal(f.calls.length, 1)
})
test('denied GPS sends no request and displays actionable feedback', async () => {
  const f = await fixture(); f.denied = true; f.click(); await f.settle()
  assert.equal(f.calls.length, 0); assert.match(f.message('alert'), /Enable precise location/)
})
test('identity mismatch prevents submission and changing accounts clears old feedback', async () => {
  const f = await fixture(); f.getToken = async () => { throw new Error('Your account changed.') }
  f.click(); await f.settle()
  assert.equal(f.calls.length, 0); assert.match(f.message('alert'), /account changed/)
  f.user = { id: 'bob' }; f.render(); assert.equal(f.message('alert'), undefined)
})
test('dorm errors, GPS failures and replay rejections never display successful completion', async () => {
  for (const [status, detail, message] of [
    [409, 'Choose a valid dorm first.', /dorm/],
    [400, { valid: false, reason: 'Move closer to the destination.' }, /Move closer/],
    [409, 'This quest is not currently assigned.', /not currently assigned/],
  ]) {
    const f = await fixture()
    f.response = async () => ({ ok: false, status, json: async () => ({ detail }) })
    f.click(); await f.settle(); assert.match(f.message('alert'), message); assert.equal(f.message('status'), undefined)
  }
})
test('signed-out requests are blocked; zero XP still represents completed status', async () => {
  const f = await fixture(); f.user = null; f.render()
  assert.equal(f.button().disabled, true); f.click(); await f.settle(); assert.equal(f.calls.length, 0)
  f.user = { id: 'alice' }; f.render()
  f.response = async () => ({ ok: true, status: 200, json: async () => ({ questId: 'quest-1', status: 'completed', xpAwarded: 0, stopIndex: 0, xpAwardedSoFar: 0, completedStops: [0], totalStops: 1 }) })
  f.click(); await f.settle(); assert.match(f.message('status'), /completed.*0 XP/)
})


test('compatibility button reports a completed stop without claiming the whole route is complete', async () => {
  const f = await fixture()
  f.response = async () => ({ ok: true, status: 200, json: async () => ({
    questId: 'quest-1', status: 'in_progress', stopIndex: 0, xpAwarded: 4,
    xpAwardedSoFar: 4, completedStops: [0], totalStops: 3,
  }) })
  f.click(); await f.settle()
  assert.match(f.message('status'), /Stop 1 completed.*4 XP/)
  assert.doesNotMatch(f.message('status'), /Sidequest completed/)
  assert.equal(f.button().disabled, true)
})
