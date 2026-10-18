import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const directionsSource = await readFile(new URL('../src/services/questDirections.ts', import.meta.url), 'utf8')
const questDirections = await import(`data:text/javascript;base64,${Buffer.from(ts.transpileModule(directionsSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext },
}).outputText).toString('base64')}`)

async function fixture() {
  const elements = [], markers = [], effects = [], windows = []
  const createElement = (tag) => {
    const element = { tag, children: [], style: {}, listeners: {}, textContent: '',
      append(...children) { this.children.push(...children) },
      setAttribute() {}, addEventListener(name, fn) { this.listeners[name] = fn },
      removeEventListener() {},
    }
    elements.push(element)
    return element
  }
  class InfoWindow {
    constructor() { windows.push(this) }
    setContent(content) { this.content = content }
    open(options) { this.options = options }
    close() {}
  }
  const maps = { Map: class { fitBounds() {} }, InfoWindow,
    LatLngBounds: class { extend() {} },
    importLibrary: async (name) => name === 'marker'
      ? { AdvancedMarkerElement: class { constructor(options) { Object.assign(this, options); markers.push(this) } } }
      : { Route: { computeRoutes: async () => ({ routes: [] }) }, TravelMode: { WALKING: 'WALKING' } },
  }
  const context = vm.createContext({ document: { createElement }, google: { maps } })
  const jsx = (type, props) => ({ type, props })
  const synthetic = async (values) => {
    const mod = new vm.SyntheticModule(Object.keys(values), function () {
      for (const [key, value] of Object.entries(values)) this.setExport(key, value)
    }, { context })
    await mod.link(() => {})
    await mod.evaluate()
    return mod
  }
  async function load(name) {
    const source = await readFile(new URL(`../src/componenets/main-ui/${name}.tsx`, import.meta.url), 'utf8')
    const compiled = ts.transpileModule(source, { compilerOptions: {
      module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023, jsx: ts.JsxEmit.ReactJSX,
    } }).outputText
    const mod = new vm.SourceTextModule(compiled, { context })
    await mod.link(async (name) => {
      if (name === 'react') return synthetic({ useRef: () => ({ current: {} }),
        useState: () => [{ key: '', message: '' }, () => {}], useEffect: (fn) => effects.push(fn) })
      if (name === 'react/jsx-runtime') return synthetic({ jsx, jsxs: jsx, Fragment: 'Fragment' })
      if (name.endsWith('/googlePlaces')) return synthetic({ loadMapsLibrary: async () => maps })
      if (name.endsWith('/colors')) return synthetic({ colors: {} })
      if (name.endsWith('/questDirections')) return synthetic(questDirections)
      if (name.endsWith('/navigation')) return synthetic({ navigateTo() {} })
      return synthetic({ default: function Placeholder() {} })
    })
    await mod.evaluate()
    return mod.namespace.default
  }
  return { load, elements, markers, effects, windows }
}

test('marker popup renders every step in order with hover, keyboard and tap access', async () => {
  const f = await fixture()
  const Map = await f.load('SidequestMap')
  const steps = ['First', 'Second', 'Third', 'Fourth', '<script>plain text</script>']
  Map({ stops: [{ name: 'One venue', latitude: 29.65, longitude: -82.32, step: steps.join(' '), completed: false }], origin: null })
  f.effects[0]()
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(f.markers.length, 1)
  const pin = f.markers[0].content
  for (const event of ['mouseenter', 'focus', 'click']) {
    pin.listeners[event]()
    const description = f.windows[0].content.children.find((child) => child.tag === 'p').textContent
    let position = -1
    for (const step of steps) {
      const next = description.indexOf(step)
      assert.ok(next > position)
      position = next
    }
  }
})

test('guest preview maps all five steps to one destination and keeps route steps separate', async () => {
  const f = await fixture()
  const Preview = await f.load('GuestQuestPreviewPage')
  const steps = ['First', 'Second', 'Third', 'Fourth', 'Fifth']
  const destination = { locationName: 'Venue', latitude: 29.65, longitude: -82.32 }
  const collectStops = (node) => {
    if (!node || typeof node !== 'object') return null
    if (node.props?.stops) return node.props.stops
    for (const child of [node.props?.children].flat(Infinity)) {
      const stops = collectStops(child)
      if (stops) return stops
    }
    return null
  }
  const result = { quest: { title: 'Quest', description: 'Description', steps,
    stepProofMethods: steps.map(() => 'recreation') }, destinations: [destination], normalizedPreferences: {} }
  assert.equal(collectStops(Preview({ result, payload: null }))[0].step, steps.join(' '))
  result.destinations = [destination, { ...destination, locationName: 'Other venue' }]
  result.quest.steps = steps.slice(0, 2)
  const stops = collectStops(Preview({ result, payload: null }))
  assert.equal(stops[0].step, 'First')
  assert.equal(stops[1].step, 'Second')
  result.quest.steps = ['First', 'Second', 'Third']
  result.quest.stepDestinationIndexes = [0, 0, 1]
  const grouped = collectStops(Preview({ result, payload: null }))
  assert.equal(grouped[0].step, 'First Second')
  assert.equal(grouped[1].step, 'Third')
})
