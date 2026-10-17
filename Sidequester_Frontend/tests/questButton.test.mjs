import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const saved = JSON.parse(await readFile(new URL('../../backend/contracts/assignment.response.live.example.json', import.meta.url), 'utf8'))
const tick = () => new Promise((resolve) => setImmediate(resolve))
const plain = (value) => JSON.parse(JSON.stringify(value))

async function fixture() {
  const f = {
    auth: { isLoaded: true, isSignedIn: true, user: { id: 'example-user', fullName: 'Test Student', primaryEmailAddress: { emailAddress: 'student@ufl.edu' } } },
    calls: [], historyCalls: [],
    request: async () => structuredClone(saved), history: async () => ({ requestCount: 1 }),
    filters: {
      where: 'Selected origin', latitude: 29.65, longitude: -82.34,
      time: '60', budget: '0', distance: '1', customTime: '', customBudget: '', customDistance: '',
    },
  }
  let slots = [], cursor = 0, activeKey, pendingEffects = []
  const react = {
    useState(initial) {
      const i = cursor++
      if (!slots[i]) slots[i] = { value: typeof initial === 'function' ? initial() : initial }
      return [slots[i].value, (value) => { slots[i].value = typeof value === 'function' ? value(slots[i].value) : value }]
    },
    useRef(initial) {
      const i = cursor++
      if (!slots[i]) slots[i] = { current: initial }
      return slots[i]
    },
    useEffect(effect) {
      const i = cursor++
      if (!slots[i]) {
        slots[i] = {}
        pendingEffects.push(() => { slots[i].cleanup = effect() })
      }
    },
  }
  const jsx = (type, props, key) => ({ type, props: props ?? {}, key })
  const link = { href: '', download: '', click() { f.downloadName = this.download }, remove() {} }
  const context = vm.createContext({
    AbortController, Blob, Error,
    URL: { createObjectURL(blob) { f.downloadBlob = blob; return 'blob:test-response' }, revokeObjectURL() {} },
    document: { createElement: () => link, body: { appendChild() {} } },
    window: { setTimeout(callback) { callback() } },
  })
  const cache = new Map()
  function synthetic(exports) {
    return new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value)
    }, { context })
  }
  async function load(relative) {
    if (cache.has(relative)) return cache.get(relative)
    const source = await readFile(new URL(`../src/${relative}`, import.meta.url), 'utf8')
    const compiled = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023, jsx: ts.JsxEmit.ReactJSX },
    }).outputText
    const module = new vm.SourceTextModule(compiled, { context })
    cache.set(relative, module)
    await module.link(async (name) => {
      if (name === 'react') return synthetic(react)
      if (name === 'react/jsx-runtime') return synthetic({ jsx, jsxs: jsx })
      if (name === '@clerk/clerk-react') return synthetic({ useUser: () => f.auth })
      if (name.endsWith('/colors')) return synthetic({ colors: {} })
      if (name.endsWith('/sidequestJson')) return load('services/sidequestJson.ts')
      if (name.endsWith('/questAssignment')) return synthetic({
        requestAssignedQuest: async (...args) => { f.calls.push(args); return f.request(...args) },
      })
      if (name.endsWith('/sidequests')) return synthetic({
        saveSidequestRequest: async (...args) => { f.historyCalls.push(args); return f.history(...args) },
      })
      if (name.endsWith('/userPreferences')) return synthetic({ getUserPreferences: async () => 'Nature', getUserGoals: async () => ['Explore'] })
      const component = () => null
      Object.defineProperty(component, 'name', { value: name.split('/').at(-1) })
      return synthetic({ default: component })
    })
    await module.evaluate()
    return module
  }
  const module = await load('componenets/main-ui/QuestFilterButtons.tsx')
  f.unmount = () => { for (const slot of slots) slot?.cleanup?.(); slots = [] }
  f.render = () => {
    const wrapped = module.namespace.default({
      filters: f.filters, setFilters: (update) => { f.filters = update(f.filters) },
      activeVibe: null, onClearActiveVibe: () => {},
    })
    if (wrapped.key !== activeKey) { f.unmount(); activeKey = wrapped.key }
    cursor = 0
    f.tree = wrapped.type(wrapped.props)
    for (const effect of pendingEffects.splice(0)) effect()
    return f.tree
  }
  function find(node, name) {
    if (!node || typeof node !== 'object') return null
    if (node.type?.name === name) return node
    for (const child of [node.props?.children].flat(Infinity)) {
      const match = find(child, name)
      if (match) return match
    }
    return null
  }
  f.props = (name) => find(f.tree, name)?.props
  f.click = () => f.props('SidequestMeButton').onClick()
  f.settle = async () => { await tick(); f.render() }
  f.modal = async () => (await load('componenets/main-ui/SidequestJsonModal.tsx')).namespace.default
  f.render()
  return f
}

test('button submits current selections and renders saved server XP/JSON', async () => {
  const f = await fixture()
  f.click()
  await f.settle()
  assert.equal(f.calls.length, 1)
  assert.equal(f.calls[0][0], 'example-user')
  assert.deepEqual(plain(f.calls[0][1].originCoordinates), { latitude: f.filters.latitude, longitude: f.filters.longitude })
  assert.equal(Object.hasOwn(f.calls[0][1], 'latitude'), false)
  assert.equal(Object.hasOwn(f.calls[0][1], 'longitude'), false)
  assert.equal(Object.hasOwn(JSON.parse(f.props('SidequestJsonModal').requestJson), 'latitude'), false)
  assert.deepEqual(plain(f.calls[0][1].distance), { maxDistance: 1, unit: 'miles' })
  assert.deepEqual(plain(f.props('SidequestJsonModal').response), saved)
  assert.equal(f.props('SidequestJsonModal').response.quest.xpReward, 25)
  assert.equal(f.historyCalls.length, 1)
  assert.equal(f.props('SidequestMeButton').isLoading, false)
})

test('rapid double click sends one request and exposes pending state', async () => {
  const f = await fixture()
  let finish
  f.request = () => new Promise((resolve) => { finish = resolve })
  f.click(); f.click()
  await f.settle()
  assert.equal(f.calls.length, 1)
  assert.equal(f.props('SidequestMeButton').isLoading, true)
  finish(structuredClone(saved))
  await f.settle()
  assert.equal(f.props('SidequestMeButton').isLoading, false)
})

test('backend errors are shown without a fabricated successful result', async () => {
  const f = await fixture()
  f.request = async () => { throw new Error('No eligible destination found.') }
  f.click(); await f.settle()
  assert.match(f.props('SidequestJsonModal').errorMessage, /No eligible destination/)
  assert.equal(f.props('SidequestJsonModal').response, null)
  assert.equal(f.historyCalls.length, 0)
})

test('request-history failure cannot discard a committed assignment', async () => {
  const f = await fixture()
  f.history = async () => { throw new Error('Permission denied') }
  f.click(); await f.settle()
  assert.deepEqual(plain(f.props('SidequestJsonModal').response), saved)
  assert.match(f.props('SidequestJsonModal').historyWarning, /quest was saved/)
})

test('reusing a saved quest does not create another history record', async () => {
  const f = await fixture()
  f.request = async () => ({ ...structuredClone(saved), reusedExisting: true })
  f.click(); await f.settle()
  assert.equal(f.props('SidequestJsonModal').response.reusedExisting, true)
  assert.equal(f.historyCalls.length, 0)
})

test('account change aborts pending work and discards another account response', async () => {
  const f = await fixture()
  let finish
  f.request = () => new Promise((resolve) => { finish = resolve })
  f.click(); await f.settle()
  const signal = f.calls[0][2].signal
  f.auth.user = { id: 'other-user', fullName: 'Other Student' }
  f.render()
  assert.equal(signal.aborted, true)
  finish(structuredClone(saved)); await f.settle()
  assert.equal(f.props('SidequestJsonModal').response, null)
  assert.equal(f.props('SidequestJsonModal').isOpen, false)
})

test('signed-out requests never call the protected assignment API', async () => {
  const f = await fixture()
  f.auth = { isLoaded: true, isSignedIn: false, user: null }
  f.render(); f.click(); await f.settle()
  assert.equal(f.calls.length, 0)
  assert.match(f.props('SidequestJsonModal').errorMessage, /Sign in.*verified email/)
})

test('result modal exposes full response and server reward as XP on completion', async () => {
  const f = await fixture()
  const Modal = await f.modal()
  const tree = Modal({ isOpen: true, isLoading: false, response: saved, requestJson: '', errorMessage: '', historyWarning: '', onClose() {} })
  const rendered = JSON.stringify(tree)
  assert.match(rendered, /XP on completion/)
  assert.match(rendered, /Download response JSON/)
  assert.match(rendered, /Sidequest response JSON/)
  assert.match(rendered, /xpReward/)
  assert.match(rendered, /XP is awarded after successful completion/)
})


test('download contains the complete server response including XP reward', async () => {
  const f = await fixture()
  const Modal = await f.modal()
  const tree = Modal({ isOpen: true, isLoading: false, response: saved, requestJson: '', errorMessage: '', historyWarning: '', onClose() {} })
  function findDownload(node) {
    if (!node || typeof node !== 'object') return null
    if (node.type === 'button' && node.props.children === 'Download response JSON') return node
    for (const child of [node.props?.children].flat(Infinity)) {
      const match = findDownload(child)
      if (match) return match
    }
  }
  findDownload(tree).props.onClick()
  assert.equal(f.downloadName, 'sidequest-example-quest.json')
  const downloaded = JSON.parse(await f.downloadBlob.text())
  assert.deepEqual(downloaded, saved)
  assert.equal(downloaded.quest.xpReward, 25)
  assert.equal(downloaded.assignment.xpAwarded, 0)
})

test('choosing Anywhere clears old coordinates before submission', async () => {
  const f = await fixture()
  const coordinates = { latitude: 29.66, longitude: -82.33 }
  f.props('WhereButton').onChange('Selected park', coordinates)
  assert.equal(f.filters.latitude, coordinates.latitude)
  assert.equal(f.filters.longitude, coordinates.longitude)
  f.render()
  f.props('WhereButton').onChange('any', null)
  assert.equal(f.filters.latitude, null)
  assert.equal(f.filters.longitude, null)
  f.filters.distance = 'any'
  f.render(); f.click(); await f.settle()
  assert.equal(f.calls[0][1].location, 'Anywhere')
  assert.equal(f.calls[0][1].originCoordinates, undefined)
})
