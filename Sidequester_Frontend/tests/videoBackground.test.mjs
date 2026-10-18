import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

async function fixture(reducedMotion) {
  const values = [], listeners = new Set()
  let cursor = 0, mounted = false, effect, cleanup
  const preference = { matches: reducedMotion,
    addEventListener: (_name, fn) => listeners.add(fn),
    removeEventListener: (_name, fn) => listeners.delete(fn) }
  const context = vm.createContext({ window: { matchMedia: () => preference } })
  const jsx = (type, props) => ({ type, props })
  const synthetic = (exports) => new vm.SyntheticModule(Object.keys(exports), function () {
    for (const [key, value] of Object.entries(exports)) this.setExport(key, value)
  }, { context })
  const source = await readFile(new URL('../src/components/decor/QuestVideoBackground.tsx', import.meta.url), 'utf8')
  const module = new vm.SourceTextModule(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, { context })
  await module.link((name) => name === 'react' ? synthetic({
    useState(initial) { const i = cursor++; if (!(i in values)) values[i] = initial
      return [values[i], (value) => { values[i] = value }] },
    useEffect(fn) { if (!mounted) effect = fn },
  }) : synthetic({ jsx, jsxs: jsx }))
  await module.evaluate()
  const render = () => {
    cursor = 0
    const tree = module.namespace.default()
    if (!mounted) { mounted = true; cleanup = effect() }
    return tree
  }
  render()
  return { render, listeners, unmount: () => cleanup(),
    changeMotion(value) { preference.matches = value; for (const fn of listeners) fn() } }
}
const video = (tree) => tree.props.children.find((node) => node?.type === 'video')

test('ambient video honors reduced motion on mount and when the preference changes', async () => {
  const f = await fixture(true)
  assert.equal(video(f.render()), undefined)
  f.changeMotion(false)
  const clip = video(f.render())
  for (const attribute of ['muted', 'autoPlay', 'loop', 'playsInline']) assert.equal(clip.props[attribute], true)
  f.changeMotion(true)
  assert.equal(video(f.render()), undefined)
  f.unmount()
  assert.equal(f.listeners.size, 0)
})

test('video and source loading errors leave the static decorative fallback available', async () => {
  for (const target of ['video', 'source']) {
    const f = await fixture(false)
    const clip = video(f.render())
    ;(target === 'video' ? clip : clip.props.children).props.onError()
    const fallback = f.render()
    assert.equal(video(fallback), undefined)
    assert.equal(fallback.props.className, 'quest-video-layer')
    assert.equal(fallback.props['aria-hidden'], 'true')
    f.unmount()
  }
})
