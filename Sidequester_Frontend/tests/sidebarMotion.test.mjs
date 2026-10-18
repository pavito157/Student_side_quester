import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

async function fixture(reducedMotion = false) {
  const classes = new Set(), timers = new Map()
  const dialog = { open: false, classList: {
    add: (name) => classes.add(name), remove: (name) => classes.delete(name),
  }, showModal() { this.open = true }, close() { this.open = false } }
  let cleanup, nextTimer = 0, closed = 0
  const jsx = (type, props) => ({ type, props })
  const context = vm.createContext({ window: {
    matchMedia: () => ({ matches: reducedMotion }),
    setTimeout(fn, delay) { const id = ++nextTimer; timers.set(id, { fn, delay }); return id },
    clearTimeout: (id) => timers.delete(id),
  } })
  const synthetic = (values) => new vm.SyntheticModule(Object.keys(values), function () {
    for (const [key, value] of Object.entries(values)) this.setExport(key, value)
  }, { context })
  const source = await readFile(new URL('../src/features/vibes/sidebar/SidebarModal.tsx', import.meta.url), 'utf8')
  const module = new vm.SourceTextModule(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, { context })
  await module.link((name) => name === 'react' ? synthetic({
    useRef: () => ({ current: dialog }),
    useEffect(effect) { cleanup?.(); cleanup = effect() },
  }) : name === 'react/jsx-runtime' ? synthetic({ jsx, jsxs: jsx, Fragment: 'fragment' })
    : name.endsWith('/colors') ? synthetic({ colors: {} })
      : name.endsWith('/icons') ? synthetic({ BackIcon() {}, CloseIcon() {} })
        : synthetic(Object.fromEntries(['PixelBranchIcon', 'PixelHangingVineIcon', 'PixelLeafIcon',
          'PixelMushroomIcon', 'PixelTrailSignIcon'].map((key) => [key, () => null]))))
  await module.evaluate()
  return { dialog, classes, timers,
    render: (isOpen) => module.namespace.default({ isOpen, title: 'Quick menu',
      onClose: () => closed++, onAddVibe() {}, children: null }),
    get closed() { return closed }, unmount: () => cleanup?.(),
  }
}

test('sidebar reopens during its exit without staying invisible or closing later', async () => {
  const f = await fixture()
  f.render(true)
  assert.equal(f.dialog.open, true)
  f.render(false)
  assert.equal(f.classes.has('is-closing'), true)
  assert.equal([...f.timers.values()][0].delay, 420)
  f.render(true)
  assert.equal(f.dialog.open, true)
  assert.equal(f.classes.has('is-closing'), false)
  assert.equal(f.timers.size, 0)
  f.render(false)
  const timer = [...f.timers.values()][0]
  timer.fn()
  assert.equal(f.dialog.open, false)
  assert.equal(f.classes.has('is-closing'), false)
  f.unmount()
})

test('sidebar reduced motion closes immediately and Escape keeps the existing close handler', async () => {
  const f = await fixture(true)
  const tree = f.render(true)
  let prevented = false
  tree.props.onCancel({ preventDefault() { prevented = true } })
  assert.equal(prevented, true)
  assert.equal(f.closed, 1)
  f.render(false)
  assert.equal(f.dialog.open, false)
  assert.equal(f.timers.size, 0)
  f.unmount()
})
