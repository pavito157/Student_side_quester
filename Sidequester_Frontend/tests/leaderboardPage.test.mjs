import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

async function fixture() {
  const f = { auth: { isLoaded: true, isSignedIn: true, user: { id: 'you' } }, requests: [],
    students: { entries: [{ userId: 'first', username: 'First', xp: 161 }, { userId: 'you', username: 'You name', xp: 138 }], skippedUsers: 0 },
    dorms: { entries: [{ dormId: 'off_campus', dormName: 'Off campus', xp: 0, memberCount: 0 }], unassignedUsers: 0 } }
  const slots = []; let cursor = 0; const pending = []
  const react = {
    useState(initial) { const i = cursor++; slots[i] ??= { value: initial }; return [slots[i].value, value => { slots[i].value = value }] },
    useEffect(effect, deps) {
      const i = cursor++; const old = slots[i]
      if (!old || deps.some((dep, n) => dep !== old.deps[n])) {
        old?.cleanup?.(); slots[i] = { deps }; pending.push(() => { slots[i].cleanup = effect() })
      }
    },
  }
  const context = vm.createContext({ console, Error })
  const cache = new Map()
  const jsx = (type, props) => ({ type, props: props ?? {} })
  function synthetic(exports) {
    return new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value)
    }, { context })
  }
  async function load(url) {
    if (cache.has(url.href)) return cache.get(url.href)
    const source = await readFile(url, 'utf8')
    const module = new vm.SourceTextModule(ts.transpileModule(source, { compilerOptions: {
      module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023, jsx: ts.JsxEmit.ReactJSX,
    } }).outputText, { context })
    cache.set(url.href, module)
    await module.link(async name => {
      if (name === 'react') return synthetic(react)
      if (name === 'react/jsx-runtime') return synthetic({ jsx, jsxs: jsx, Fragment: 'fragment' })
      if (name === '@clerk/clerk-react') return synthetic({ useUser: () => f.auth,
        SignedOut: ({ children }) => f.auth.isSignedIn ? null : children, SignInButton: ({ children }) => children })
      if (name.endsWith('/Header')) return synthetic({ default: () => null })
      if (name.endsWith('/firebaseSession')) return synthetic({ getFirebaseIdToken: async id => { f.requests.push(id); return 'test-token' } })
      if (name.endsWith('/services/leaderboard')) return synthetic({
        getLeaderboardEntries: async () => { if (f.error) throw new Error(f.error); return f.studentRequest ?? f.students },
        getDormLeaderboardEntries: async () => { if (f.error) throw new Error(f.error); return f.dorms },
      })
      if (name.endsWith('/colors')) return synthetic({ colors: {} })
      if (name.endsWith('.css')) return synthetic({ default: new Proxy({}, { get: (_, key) => key }) })
      const file = /Leaderboard(?:Row|Artwork|Forest)$/.test(name) ? '.tsx' : '.ts'
      return load(new URL(name + file, url))
    })
    return module
  }
  const page = await load(new URL('../src/features/leaderboard/LeaderboardPage.tsx', import.meta.url))
  await page.evaluate()
  function expand(node) {
    if (Array.isArray(node)) return node.map(expand)
    if (!node || typeof node !== 'object') return node
    if (typeof node.type === 'function') return expand(node.type(node.props))
    return { ...node, props: { ...node.props, children: expand(node.props.children) } }
  }
  f.render = () => { cursor = 0; f.tree = expand(page.namespace.default()); for (const effect of pending.splice(0)) effect(); return f.tree }
  f.settle = async () => { await new Promise(resolve => setImmediate(resolve)); return f.render() }
  return f
}
function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes)
  if (!tree || typeof tree !== 'object') return []
  return [tree, ...nodes(tree.props.children)]
}
function text(tree) {
  if (Array.isArray(tree)) return tree.map(text).join('')
  if (typeof tree === 'boolean' || tree == null) return ''
  if (typeof tree !== 'object') return String(tree)
  return text(tree.props.children)
}
test('students retain ranking/XP and highlight the signed-in player without duplicates', async () => {
  const f = await fixture(); f.render(); await f.settle()
  const entries = nodes(f.tree).filter(node => node.type === 'li')
  assert.equal(entries.length, 2)
  assert.deepEqual(entries.map(node => node.props.value), [1, 2])
  assert.equal(entries[0].props['data-placement'], 'gold')
  assert.equal(entries[1].props['data-placement'], 'silver')
  assert.equal(entries[1].props['aria-current'], 'true')
  assert.match(text(entries[1]), /24 XP to overtake Rank #1/)
  assert.match(text(entries[1]), /138/)
  assert.match(text(entries[1]), /12 XP to Gold/)
})
test('tab click loads zero-member/zero-XP dorm with Iron tier', async () => {
  const f = await fixture(); f.render(); await f.settle()
  nodes(f.tree).find(node => node.type === 'button' && text(node) === 'UF Dorms').props.onClick()
  f.render(); await f.settle()
  assert.match(text(f.tree), /Off campus/)
  assert.match(text(f.tree), /0 members/)
  assert.match(text(f.tree), /Iron/)
  assert.equal(nodes(f.tree).filter(node => node.type === 'li').length, 1)
  assert.equal(nodes(f.tree).filter(node => node.props['aria-current']).length, 0)
  assert.equal(nodes(f.tree).find(node => node.type === 'button' && text(node) === 'UF Dorms').props['aria-pressed'], true)
})
test('placement and XP tier are separate, and fourth place appears once in the existing list', async () => {
  const f = await fixture()
  f.students.entries = ['first', 'second', 'third', 'fourth'].map(userId => ({ userId, username: userId, xp: 0 }))
  f.render(); await f.settle()
  const entries = nodes(f.tree).filter(node => node.type === 'li')
  assert.equal(entries.length, 4)
  assert.deepEqual(entries.map(node => node.props.value), [1, 2, 3, 4])
  assert.deepEqual(entries.map(node => node.props['data-placement']), ['gold', 'silver', 'bronze', undefined])
  assert.match(text(entries[0]), /Iron/)
  const bars = nodes(f.tree).filter(node => node.props.role === 'progressbar')
  assert.equal(bars.length, 4)
  assert.ok(bars.every(node => node.props['aria-valuenow'] === 0 && node.props['aria-valuemax'] === 50))
})
test('loading, empty, service error and signed-out states remain functional', async () => {
  const f = await fixture(); f.students = { entries: [], skippedUsers: 0 }
  assert.match(text(f.render()), /Loading students/)
  await f.settle(); assert.match(text(f.tree), /No student rankings/)
  const failed = await fixture(); failed.error = 'Backend unavailable'; failed.render(); await failed.settle()
  assert.ok(nodes(failed.tree).some(node => node.props.role === 'alert'))
  assert.match(text(failed.tree), /Could not load the leaderboard/)
  const guest = await fixture(); guest.auth.isSignedIn = false; guest.render()
  assert.match(text(guest.tree), /Sign in with your UF account/)
  assert.equal(guest.requests.length, 0)
})
test('missing current player and first-place message remain accurate', async () => {
  const f = await fixture(); f.students.skippedUsers = 2; f.auth.user.id = 'first'; f.render(); await f.settle()
  assert.match(text(f.tree), /You lead the adventure/)
  f.auth.user.id = 'not-in-results'; f.render(); await f.settle()
  assert.equal(nodes(f.tree).filter(node => node.props['aria-current']).length, 0)
})

test('a late student response cannot replace the dorm board after switching tabs', async () => {
  const f = await fixture()
  let resolveStudents
  f.studentRequest = new Promise(resolve => { resolveStudents = resolve })
  f.render()
  await new Promise(resolve => setImmediate(resolve))
  nodes(f.tree).find(node => node.type === 'button' && text(node) === 'UF Dorms').props.onClick()
  f.render(); await f.settle()
  resolveStudents(f.students)
  await f.settle()
  assert.match(text(f.tree), /Off campus/)
  assert.doesNotMatch(text(f.tree), /You name/)
})

test('podium contains the top three once and the roster continues at fourth place', async () => {
  const f = await fixture()
  f.students.entries = Array.from({ length: 6 }, (_, index) => ({ userId: `student-${index}`, username: `Student ${index}`, xp: 500 - index * 50 }))
  f.render(); await f.settle()
  const lists = nodes(f.tree).filter(node => node.type === 'ol')
  const podium = lists.find(node => node.props['aria-label'] === 'Top-ranked competitors')
  const roster = lists.find(node => node.props['aria-label'] === 'Remaining rankings')
  assert.equal(nodes(podium).filter(node => node.type === 'li').length, 3)
  assert.deepEqual(nodes(roster).filter(node => node.type === 'li').map(node => node.props.value), [4, 5, 6])
  assert.equal(roster.props.start, 4)
  assert.equal(nodes(f.tree).filter(node => node.type === 'li').length, 6)
  assert.match(text(f.tree), /Top achievers/)
})

test('a partial podium has no invented competitors or empty roster section', async () => {
  for (const count of [1, 2, 3]) {
    const f = await fixture()
    f.students.entries = Array.from({ length: count }, (_, i) => ({ userId: `s-${i}`, username: `Student ${i}`, xp: 0 }))
    f.render(); await f.settle()
    assert.equal(nodes(f.tree).filter(node => node.type === 'li').length, count)
    assert.equal(nodes(f.tree).filter(node => node.props['aria-label'] === 'Remaining rankings').length, 0)
    assert.doesNotMatch(text(f.tree), /The adventurer roster/)
  }
})
