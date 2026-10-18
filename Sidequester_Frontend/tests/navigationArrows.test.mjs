import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const arrow = '/art/cozy/navigation-arrow.svg'
const consumers = [
  'features/quest-generation/QuestFilterButtons.tsx', 'features/settings/SettingsOptionButton.tsx',
  'features/home/CinematicHero.tsx', 'features/quest-generation/inputs/buttons/SidequestMeButton.tsx',
  'features/quests/components/QuestSlots.tsx',
]
const sourceOf = path => readFile(new URL(`../src/${path}`, import.meta.url), 'utf8')

test('all five approved direct consumers use the new arrow, retaining size and decorative semantics', async () => {
  for (const path of consumers) {
    const source = await sourceOf(path)
    assert.ok(source.includes(`src="${arrow}"`), path)
    assert.ok(!source.includes('/art/cozy/pointer.png'), path)
    const element = source.match(/<img[^>]*navigation-arrow\.svg[^>]*\/>/s)?.[0]
    assert.match(element, /aria-hidden="true"/)
    assert.match(element, /alt=""/)
    assert.match(element, /size-[45]/)
  }
})

test('advanced settings uses the same conditional down/up rotation and expanded-state handler', async () => {
  const source = await sourceOf(consumers[0])
  const ast = ts.createSourceFile('QuestFilterButtons.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let expression
  function visit(node) {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(ast) === 'img' && node.getText(ast).includes(arrow)) {
      const attribute = node.attributes.properties.find(item => item.name?.getText(ast) === 'className')
      expression = attribute.initializer.expression.getText(ast)
    }
    ts.forEachChild(node, visit)
  }
  visit(ast)
  assert.ok(expression)
  for (const open of [false, true]) {
    const classes = vm.runInNewContext(expression, { isAdvancedSettingsOpen: open })
    assert.match(classes, open ? /-rotate-90/ : /(?:^| )rotate-90/)
  }
  assert.match(source, /aria-expanded=\{isAdvancedSettingsOpen\}/)
  assert.match(source, /setIsAdvancedSettingsOpen\(\(open\) => !open\)/)
})

async function component(path, name, props = {}) {
  const context = vm.createContext({})
  const jsx = (type, props) => ({ type, props })
  const synthetic = exports => new vm.SyntheticModule(Object.keys(exports), function () {
    for (const [key, value] of Object.entries(exports)) this.setExport(key, value)
  }, { context })
  const module = new vm.SourceTextModule(ts.transpileModule(await sourceOf(path), { compilerOptions: {
    module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, { context })
  await module.link(importName => importName === 'react/jsx-runtime' ? synthetic({ jsx, jsxs: jsx }) : synthetic({ colors: {} }))
  await module.evaluate()
  return module.namespace[name](props)
}

test('shared BackIcon points left and both approved modals still use it', async () => {
  const icon = await component('components/ui/icons.tsx', 'BackIcon')
  assert.equal(icon.props.src, arrow)
  assert.match(icon.props.className, /rotate-180/)
  assert.match(icon.props.className, /size-5/)
  assert.equal(icon.props['aria-hidden'], 'true')
  for (const path of ['features/settings/SettingsModal.tsx', 'features/vibes/sidebar/SidebarModal.tsx']) {
    assert.match(await sourceOf(path), /<BackIcon \/>/)
  }
})

test('settings-card action and generation-button action remain unchanged', async () => {
  let clicks = 0
  const button = await component(consumers[1], 'default', { title: 'Preferences', description: 'Choose interests', onClick: () => clicks++ })
  assert.equal(button.props.type, 'button')
  button.props.onClick()
  assert.equal(clicks, 1)
  const generate = await component(consumers[3], 'default', { onClick: () => clicks++, isLoading: true })
  assert.equal(generate.props.disabled, true)
  assert.equal(generate.props['aria-busy'], true)
})

test('original SVG has a stepped shaft/head and no smooth curves or external references', async () => {
  const svg = await readFile(new URL('../public/art/cozy/navigation-arrow.svg', import.meta.url), 'utf8')
  assert.match(svg, /viewBox="0 0 16 16"/)
  assert.match(svg, /shape-rendering="crispEdges"/)
  const paths = [...svg.matchAll(/\bd="([^"]+)"/g)].map(match => match[1])
  assert.equal(paths.length, 3)
  assert.ok(paths.every(path => /^[MHVZmhvz\d .-]+$/.test(path)))
  assert.match(svg, /#493625/)
  assert.doesNotMatch(svg, /<image|href=|<script|<filter/)
})

