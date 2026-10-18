import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const source = await readFile(new URL('../src/components/decor/AmbientScene.tsx', import.meta.url), 'utf8')
const context = vm.createContext({})
const jsx = (type, props) => ({ type, props: props ?? {} })
const module = new vm.SourceTextModule(ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX,
} }).outputText, { context })
await module.link(() => new vm.SyntheticModule(['jsx', 'jsxs'], function () {
  this.setExport('jsx', jsx); this.setExport('jsxs', jsx)
}, { context }))
await module.evaluate()
function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes)
  return !tree || typeof tree !== 'object' ? [] : [tree, ...nodes(tree.props.children)]
}
const tree = module.namespace.default()
const all = nodes(tree)

test('ambient scene is decorative and has no media player, focus targets or interaction handlers', () => {
  assert.equal(tree.props['aria-hidden'], 'true')
  assert.equal(all.filter(node => ['video', 'audio', 'button', 'a', 'input'].includes(node.type)).length, 0)
  assert.ok(all.every(node => node.props.tabIndex == null && !Object.keys(node.props).some(key => /^on[A-Z]/.test(key))))
  assert.doesNotMatch(source, /useEffect|useState|requestAnimationFrame|setInterval|setTimeout|fetch\(/)
})

test('every scenery sprite is bundled and has empty decorative alt text', async () => {
  const images = all.filter(node => node.type === 'img')
  assert.equal(images.length, 7)
  for (const image of images) {
    assert.equal(image.props.alt, '')
    assert.equal(image.props.draggable, false)
    assert.match(image.props.src, /^\/art\/ambient\/[a-z-]+\.webp$/)
    const bytes = await readFile(new URL(`../public${image.props.src}`, import.meta.url))
    assert.equal(bytes.subarray(0, 4).toString(), 'RIFF')
    assert.equal(bytes.subarray(8, 12).toString(), 'WEBP')
  }
})

test('reduced motion keeps the scene visible and stops sprite and glow animations', async () => {
  const css = await readFile(new URL('../src/index.css', import.meta.url), 'utf8')
  const rule = css.slice(css.lastIndexOf('@media(prefers-reduced-motion:reduce)'))
  assert.match(rule, /\.ambient-scene \*, \.ambient-scene \*::before/)
  assert.match(rule, /animation:none!important/)
  assert.doesNotMatch(rule, /display:none|visibility:hidden/)
})
