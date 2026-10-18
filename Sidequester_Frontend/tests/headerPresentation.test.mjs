import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

async function fixture(props = {}) {
  const f = { menuClicks: 0, settingsClicks: 0, navigations: [], handlers: new Map() }
  const slots = []; let cursor = 0; const pending = []
  const react = {
    useState(initial) {
      const i = cursor++; slots[i] ??= { value: initial }
      return [slots[i].value, value => { slots[i].value = typeof value === 'function' ? value(slots[i].value) : value }]
    },
    useRef(initial) { const i = cursor++; slots[i] ??= { current: initial }; return slots[i] },
    useEffect(effect, deps) {
      const i = cursor++; const old = slots[i]
      if (!old || deps.some((dep, index) => dep !== old.deps[index])) {
        old?.cleanup?.(); slots[i] = { deps }; pending.push(() => { slots[i].cleanup = effect() })
      }
    },
  }
  const context = vm.createContext({ document: {
    addEventListener(name, handler) { f.handlers.set(name, handler) },
    removeEventListener(name) { f.handlers.delete(name) },
  } })
  const jsx = (type, props) => ({ type, props: props ?? {} })
  const synthetic = exports => new vm.SyntheticModule(Object.keys(exports), function () {
    for (const [key, value] of Object.entries(exports)) this.setExport(key, value)
  }, { context })
  const compile = async path => new vm.SourceTextModule(ts.transpileModule(await readFile(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { context })
  const runtime = synthetic({ jsx, jsxs: jsx, Fragment: 'fragment' })
  const icons = await compile('../src/components/ui/icons.tsx')
  await icons.link(() => runtime)
  const module = await compile('../src/components/navigation/Header.tsx')
  await module.link(name => {
    if (name === 'react') return synthetic(react)
    if (name === 'react/jsx-runtime') return runtime
    if (name === '@clerk/clerk-react') return synthetic({
      SignedIn: () => null, SignedOut: ({ children }) => children, UserButton: () => null,
      SignInButton: ({ children }) => children, SignUpButton: ({ children }) => children,
    })
    if (name.endsWith('/ui/icons')) return icons
    if (name.endsWith('/colors')) return synthetic({ colors: { foreground: '#43301f', primary: '#246347', surface: '#fff9e9' } })
    if (name.endsWith('/navigation')) return synthetic({ navigateTo: path => f.navigations.push(path) })
    if (name.endsWith('.css')) return synthetic({ default: { questBadge: 'questBadge' } })
    if (name.endsWith('/AdventureDecor')) return synthetic(Object.fromEntries(
      ['FallingLeaves', 'NavFoliage', 'PixelHangingVineIcon', 'PixelLeafIcon', 'PixelTrailSignIcon'].map(name => [name,
        props => jsx('decor', { ...props, 'data-decoration': name })])))
    throw new Error(`Unexpected import: ${name}`)
  })
  await module.evaluate()
  function expand(node) {
    if (Array.isArray(node)) return node.map(expand)
    if (!node || typeof node !== 'object') return node
    if (typeof node.type === 'function') return expand(node.type(node.props))
    return { ...node, props: { ...node.props, children: expand(node.props.children) } }
  }
  f.render = () => {
    cursor = 0
    f.tree = expand(module.namespace.default({ onMenuClick: () => f.menuClicks++, onSettingsClick: () => f.settingsClicks++, ...props }))
    for (const effect of pending.splice(0)) effect()
    return f.tree
  }
  f.render()
  return f
}
function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes)
  if (!tree || typeof tree !== 'object') return []
  return [tree, ...nodes(tree.props.children)]
}
const menu = f => nodes(f.tree).find(node => node.type === 'button' && node.props['aria-label']?.startsWith('Open menu'))

test('restored badge uses the previous positioning and size without restoring the signpost', async () => {
  const f = await fixture({ activeSidequestCount: 3 })
  const badge = nodes(menu(f)).find(node => node.props.className?.includes('quest-count-pixel'))
  assert.match(badge.props.className, /absolute -right-1 -top-1/)
  assert.match(badge.props.className, /min-h-5 min-w-5/)
  const source = await readFile(new URL('../src/components/navigation/Header.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /PixelTrailSignIcon|header-trail-sign|Header\.module\.css/)
})

for (const count of [0, 1, 3, 9, 10, 99, 100, 1000]) {
  test(`satchel and badge preserve count ${count}, including zero hiding and 99+ cap`, async () => {
    const f = await fixture({ activeSidequestCount: count })
    const button = menu(f)
    const satchel = nodes(button).find(node => node.type === 'img')
    assert.equal(satchel.props.src, '/art/cozy/satchel.png')
    assert.equal(satchel.props.className, 'cozy-icon size-7 sm:size-8')
    assert.equal(button.props.type, 'button')
    assert.equal(button.props['aria-haspopup'], 'dialog')
    assert.equal(button.props.hidden, false)
    assert.match(button.props.className, /size-10/)
    assert.match(button.props.className, /focus-visible:outline/)
    const badge = nodes(button).find(node => node.props.className?.includes('quest-count-pixel'))
    if (count === 0) assert.equal(badge, undefined)
    else {
      assert.equal(badge.props.children, count > 99 ? '99+' : count)
      assert.equal(badge.props['aria-hidden'], 'true')
      assert.match(button.props['aria-label'], new RegExp(`${count} active sidequest`))
    }
    button.props.onClick(); assert.equal(f.menuClicks, 1)
  })
}
test('only signpost instance is removed; vines, leaves and scenery remain', async () => {
  const f = await fixture()
  const decorations = nodes(f.tree).filter(node => node.type === 'decor')
  assert.equal(decorations.filter(node => node.props['data-decoration'] === 'PixelHangingVineIcon').length, 2)
  assert.equal(decorations.filter(node => node.props['data-decoration'] === 'PixelLeafIcon').length, 9)
  assert.equal(decorations.filter(node => node.props['data-decoration'] === 'FallingLeaves').length, 1)
  assert.equal(decorations.filter(node => node.props['data-decoration'] === 'NavFoliage').length, 1)
  const source = await readFile(new URL('../src/components/navigation/Header.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /PixelTrailSignIcon|header-trail-sign/)
  const artwork = await readFile(new URL('../src/components/decor/AdventureDecor.tsx', import.meta.url), 'utf8')
  assert.match(artwork, /export function PixelTrailSignIcon/)
})
test('other controls and auth Escape behavior remain unchanged; absent menu retains home link', async () => {
  const f = await fixture()
  nodes(f.tree).find(node => node.props['aria-label'] === 'Settings').props.onClick()
  assert.equal(f.settingsClicks, 1)
  assert.ok(nodes(f.tree).some(node => node.type === 'a' && node.props.href === '/leaderboard'))
  assert.ok(nodes(f.tree).some(node => node.type === 'a' && node.props.href === '/welcome'))
  nodes(f.tree).find(node => node.props['aria-label'] === 'Sign in or sign up').props.onClick()
  f.render()
  assert.ok(nodes(f.tree).some(node => node.props.id === 'auth-dropdown'))
  f.handlers.get('keydown')({ key: 'Escape' }); f.render()
  assert.equal(nodes(f.tree).some(node => node.props.id === 'auth-dropdown'), false)
  const noMenu = await fixture({ onMenuClick: undefined })
  assert.equal(menu(noMenu).props.hidden, true)
  assert.ok(nodes(noMenu.tree).some(node => node.type === 'a' && node.props['aria-label'] === 'Quest board'))
})
