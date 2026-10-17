import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
const plain = (x) => JSON.parse(JSON.stringify(x))
const tick = () => new Promise((resolve) => setImmediate(resolve))
const payload = { location: 'Anywhere', time: { selection: '30' }, budget: { selection: '0' }, preferences: 'Nature' }
const saved = (id) => ({ quest: { id }, assignment: { userId: 'alice' }, reusedExisting: false })
async function fixture(file = 'App.tsx', path = '/') {
  const f = { user: { id: 'alice' }, calls: [], navigations: [],
    assign: async () => saved('quest-1'), replace: async () => saved('quest-2'),
    preferences: async () => 'Nature', goals: async () => ['Explore'],
    detailReplace: async () => {}, activeQuestCount: 1, activeQuests: [],
    sidequest: { id: 'quest-1', title: 'Existing quest', description: 'Existing activity', steps: ['Try it'],
      locationName: 'Park', latitude: 29.65, longitude: -82.34, xpValue: 10,
      estimatedMinutes: 30, estimatedCostDollars: 0, createdAt: '2026-10-17T12:00:00Z', userRequest: payload },
  }
  let slots = [], cursor = 0, pending = [], accountKey
  const listeners = new Set()
  const browser = { location: { pathname: path },
    addEventListener(_event, fn) { listeners.add(fn) }, removeEventListener(_event, fn) { listeners.delete(fn) },
  }
  const react = {
    useMemo(fn) { return fn() },
    useState(initial) {
      const i = cursor++
      if (!slots[i]) slots[i] = { value: typeof initial === 'function' ? initial() : initial }
      return [slots[i].value, (x) => { slots[i].value = typeof x === 'function' ? x(slots[i].value) : x }]
    },
    useRef(initial) { const i = cursor++; if (!slots[i]) slots[i] = { current: initial }; return slots[i] },
    useEffect(effect, deps) {
      const i = cursor++
      if (!slots[i] || deps.some((item, index) => item !== slots[i].deps[index])) {
        slots[i]?.cleanup?.(); slots[i] = { deps }
        pending.push(() => { slots[i].cleanup = effect() })
      }
    },
  }
  const jsx = (type, props, key) => ({ type, props: props ?? {}, key })
  const context = vm.createContext({ AbortController, Error, window: browser })
  function synthetic(exports) { return new vm.SyntheticModule(Object.keys(exports), function () {
    for (const [key, value] of Object.entries(exports)) this.setExport(key, value)
  }, { context }) }
  const source = await readFile(new URL(`../src/${file}`, import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText
  const mod = new vm.SourceTextModule(compiled, { context })
  await mod.link((name) => {
    if (name === 'react') return synthetic(react)
    if (name === 'react/jsx-runtime') return synthetic({ jsx, jsxs: jsx, Fragment: "fragment" })
    if (name === '@clerk/clerk-react') return synthetic({ useUser: () => ({ isLoaded: true, isSignedIn: Boolean(f.user), user: f.user }) })
    if (name.endsWith('/colors')) return synthetic({ colors: {} })
    if (name.endsWith('/questAssignment')) return synthetic({
      MAX_ACTIVE_QUESTS: 3,
      requestGeneratedQuest: async (...args) => { f.calls.push(['preview', ...args]); return { quest: { title: 'Guest challenge' }, saved: false } },
      getActiveQuests: async () => { f.reconciled = true; return [] },
      requestAssignedQuest: async (...args) => { f.calls.push(['assign', ...args]); return f.assign(...args) },
      requestAdditionalQuest: async (...args) => { f.calls.push(['replace', ...args]); return f.replace(...args) },
    })
    if (name.endsWith('/userPreferences')) return synthetic({ getUserPreferences: (...args) => f.preferences(...args), getUserGoals: (...args) => f.goals(...args) })
    if (name.endsWith('/sidequests')) return synthetic({
      subscribeToActiveSidequests(_uid, callback) { f.activeCallback = callback; callback(f.activeQuests); return () => {} },
      subscribeToActiveSidequest(_uid, _id, callback) { callback(f.sidequest); return () => {} },
      completeSidequest: async () => { f.calls.push(['complete']); return { status: 'completed', xpAwarded: 10, xpAwardedSoFar: 10, completedStops: [0] } },
      abandonSidequest: async (...args) => { f.calls.push(['abandon', ...args]) },
    })
    if (name.endsWith('/navigation')) return synthetic({ navigateTo(path) {
      f.navigations.push(path); browser.location.pathname = path; for (const fn of [...listeners]) fn()
    } })
    const component = () => null
    Object.defineProperty(component, 'name', { value: name.split('/').at(-1) })
    return synthetic({ default: component })
  })
  await mod.evaluate()
  f.render = () => {
    let root
    if (file === 'App.tsx') {
      root = mod.namespace.default()
      if (root.key !== accountKey) {
        for (const slot of slots) slot.cleanup?.()
        slots = []; accountKey = root.key
      }
      cursor = 0; f.tree = root.type(root.props)
    } else {
      cursor = 0
      f.tree = file.endsWith('ActiveSidequests.tsx')
        ? mod.namespace.default({ sidequests: f.activeQuests, isLoading: false, error: '', isSignedIn: true })
        : mod.namespace.default({ sidequestId: f.sidequest.id, activeQuestCount: f.activeQuestCount, onGenerateAnother: (...args) => {
        f.calls.push(['detailReplace', ...args]); return f.detailReplace(...args)
      } })
    }
    for (const effect of pending.splice(0)) effect()
  }
  const nodes = (node) => !node || typeof node !== 'object' ? []
    : [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)]
  f.props = (name) => nodes(f.tree).find((node) => node.type?.name === name)?.props
  f.button = (label) => nodes(f.tree).find((node) => node.type === 'button' && JSON.stringify(node.props.children).includes(label))?.props
  f.settle = async () => { await tick(); f.render() }
  f.render(); return f
}

test('new detail-page route regenerates with the latest submitted filters rather than an older saved request', async () => {
  const f = await fixture()
  await f.props('HomePage').onStartQuestGeneration('alice', payload); f.render()
  const detail = f.props('SidequestDetailPage')
  assert.equal(detail.sidequestId, 'quest-1')
  await detail.onGenerateAnother('alice', 'quest-1', { ...payload, time: { selection: '60' } }); f.render()
  assert.equal(f.calls[1][0], 'replace')
  assert.equal(f.calls[1][2], 'quest-1')
  assert.deepEqual(plain(f.calls[1][3]), payload)
  assert.equal(f.props('SidequestDetailPage').sidequestId, 'quest-2')
})

test('refresh regeneration uses the server-saved request; older records fall back to saved preferences', async () => {
  const f = await fixture('App.tsx', '/sidequests/quest-1')
  await f.props('SidequestDetailPage').onGenerateAnother('alice', 'quest-1', payload)
  assert.deepEqual(plain(f.calls[0][3]), payload)
  const older = await fixture('App.tsx', '/sidequests/quest-1')
  await older.props('SidequestDetailPage').onGenerateAnother('alice', 'quest-1', null)
  assert.deepEqual(plain(older.calls[0][3]), { location: 'Anywhere', time: { selection: 'any' }, budget: { selection: 'any' }, preferences: 'Nature', goals: ['Explore'] })
})

test('replacement errors use the new generating error page without calling abandon', async () => {
  const f = await fixture('App.tsx', '/sidequests/quest-1')
  f.replace = async () => { throw new Error('Generation quota reached') }
  await f.props('SidequestDetailPage').onGenerateAnother('alice', 'quest-1', payload); f.render()
  assert.equal(f.props('SidequestDetailPage').sidequestId, 'generating')
  assert.equal(f.props('SidequestDetailPage').generationState.status, 'error')
  assert.match(f.props('SidequestDetailPage').generationState.message, /quota/)
  assert.equal(f.calls.some(([name]) => name === 'abandon'), false)
})

test('account switch aborts pending generation and cannot navigate to the old account result', async () => {
  const f = await fixture()
  let resolve
  f.assign = () => new Promise((done) => { resolve = done })
  const pending = f.props('HomePage').onStartQuestGeneration('alice', payload)
  f.render(); const signal = f.calls[0][3].signal
  f.user = { id: 'bob' }; f.render(); assert.equal(signal.aborted, true)
  resolve(saved('alice-private-quest')); await pending
  assert.equal(f.navigations.includes('/sidequests/alice-private-quest'), false)
})

test('detail Generate another blocks duplicate/overlapping actions and retains the quest on errors', async () => {
  const f = await fixture('componenets/main-ui/SidequestDetailPage.tsx')
  f.render()
  let reject
  f.detailReplace = () => new Promise((_resolve, fail) => { reject = fail })
  f.button('Generate another').onClick(); f.button('Generate another').onClick(); await f.settle()
  assert.equal(f.calls.filter(([name]) => name === 'detailReplace').length, 1)
  assert.equal(f.button('Complete sidequest').disabled, true)
  assert.equal(f.calls[0][1], 'alice'); assert.equal(f.calls[0][2], 'quest-1')
  reject(new Error('Cannot generate right now')); await f.settle()
  assert.equal(f.button('Generate another').disabled, false)
  assert.match(JSON.stringify(f.tree), /Cannot generate right now/)
  assert.match(JSON.stringify(f.tree), /Existing quest/)
})

test('account switch while loading legacy preferences cannot start a stale generation', async () => {
  const f = await fixture('App.tsx', '/sidequests/quest-1')
  let resolve
  f.preferences = () => new Promise((done) => { resolve = done })
  const pending = f.props('SidequestDetailPage').onGenerateAnother('alice', 'quest-1', null)
  f.user = { id: 'bob' }; f.render()
  resolve('Private old-account preferences'); await pending
  assert.equal(f.calls.length, 0)
  assert.equal(f.navigations.includes('/sidequests/generating'), false)
})


test('detail shows active slots and blocks generation when three quests are active', async () => {
  const f = await fixture('componenets/main-ui/SidequestDetailPage.tsx')
  f.activeQuestCount = 3
  f.render()
  assert.equal(f.button('Generate another').disabled, true)
  assert.match(JSON.stringify(f.tree), /three active quests/)
  f.button('Generate another').onClick(); await f.settle()
  assert.equal(f.calls.length, 0)
  assert.equal(f.button('Complete sidequest').disabled, false)
})


test('all three quick-menu cards open their own quest detail route', async () => {
  const f = await fixture('componenets/main-ui/ActiveSidequests.tsx')
  f.activeQuests = [1, 2, 3].map((i) => ({ ...f.sidequest, id: `quest-${i}`, title: `Mission ${i}` }))
  f.render()
  for (let i = 1; i <= 3; i++) {
    f.button(`Mission ${i}`).onClick()
    assert.equal(f.navigations.at(-1), `/sidequests/quest-${i}`)
  }
})

test('selected quest displays its contents and steps and abandons only that quest', async () => {
  const f = await fixture('componenets/main-ui/SidequestDetailPage.tsx')
  f.sidequest = { ...f.sidequest, id: 'quest-2', title: 'Second quest',
    description: 'Second quest contents.', steps: ['Find a bench.', 'Sketch three leaves.'] }
  f.render(); f.render()
  assert.match(JSON.stringify(f.tree), /Second quest contents/)
  assert.match(JSON.stringify(f.tree), /Find a bench/)
  assert.match(JSON.stringify(f.tree), /Sketch three leaves/)
  f.button('Abandon sidequest').onClick(); f.render()
  f.button('Yes, abandon').onClick(); await f.settle()
  assert.deepEqual(f.calls.find(([name]) => name === 'abandon'), ['abandon', 'alice', 'quest-2'])
})

test('root reconciles old alternatives once and keeps the list and detail count current', async () => {
  const f = await fixture()
  assert.equal(f.reconciled, true)
  f.activeCallback([1, 2, 3].map((i) => ({ ...f.sidequest, id: `quest-${i}` })))
  f.render()
  assert.equal(f.props('HomePage').activeSidequestsState.sidequests.length, 3)
  await f.props('HomePage').onStartQuestGeneration('alice', payload); f.render()
  assert.equal(f.props('SidequestDetailPage').activeQuestCount, 3)
  f.activeCallback([f.sidequest]); f.render()
  assert.equal(f.props('SidequestDetailPage').activeQuestCount, 1)
})


test('guest generation opens an unsaved preview without assignment or active-quest reconciliation', async () => {
  const f = await fixture()
  f.user = null; f.calls = []; f.reconciled = false; f.render()
  await f.props('HomePage').onStartQuestGeneration(null, payload); f.render()
  assert.equal(f.calls[0][0], 'preview')
  assert.equal(f.calls[0][1], null)
  assert.equal(f.calls.length, 1)
  assert.equal(f.reconciled, false)
  assert.equal(f.props('GuestQuestPreviewPage').result.saved, false)
  assert.equal(f.navigations.at(-1), '/sidequests/guest-preview')
})
