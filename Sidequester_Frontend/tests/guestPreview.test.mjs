import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const source = await readFile(
  new URL('../src/features/quests/preview/GuestQuestPreviewPage.tsx', import.meta.url),
  'utf8',
)
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2023,
    jsx: ts.JsxEmit.ReactJSX,
  },
}).outputText

async function renderPreview(result) {
  const context = vm.createContext({})
  const navigations = []
  const fakeMap = () => null
  const jsx = (type, props, key) => ({ type, props: props ?? {}, key })
  const module = new vm.SourceTextModule(compiled, { context })
  await module.link((name) => {
    const component = () => null
    Object.defineProperty(component, 'name', { value: name.split('/').at(-1) })
    const exports = name === 'react/jsx-runtime'
      ? { jsx, jsxs: jsx, Fragment: 'fragment' }
      : name === '@clerk/clerk-react'
        ? { SignedIn: 'SignedIn', SignedOut: 'SignedOut', SignInButton: 'SignInButton' }
        : name.endsWith('/SidequestMap')
          ? { default: fakeMap }
          : name.endsWith('/navigation')
            ? { navigateTo: (path) => navigations.push(path) }
            : { default: component, colors: new Proxy({}, { get: () => '#123456' }) }
    return new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value)
    }, { context })
  })
  await module.evaluate()
  const tree = module.namespace.default({ result, payload: null })
  const nodes = (node) => !node || typeof node !== 'object'
    ? []
    : [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)]
  return { tree, nodes: nodes(tree), fakeMap, navigations }
}

const preview = {
  destinationVerified: true,
  destinations: [
    { locationName: 'Town square', placeId: 'square', latitude: 29.65, longitude: -82.32 },
    { locationName: 'Art walk', placeId: 'art', latitude: 29.66, longitude: -82.33 },
  ],
  quest: {
    title: 'A playful outing',
    description: 'Explore two local places.',
    locationName: 'Town square',
    steps: ['Find a public pattern.', 'Compare two details.', 'Choose a favorite corner.'],
    stepProofMethods: ['location', 'photo', 'recreation'],
    stepDestinationIndexes: [0, 0, 1],
    estimatedMinutes: 45,
    estimatedCostDollars: 0,
  },
}

test('guest preview associates every route pin with its own ordered steps', async () => {
  const rendered = await renderPreview(preview)
  const map = rendered.nodes.find((node) => node.type === rendered.fakeMap)
  assert.deepEqual(map.props.stops.map(({ step }) => step), [
    'Find a public pattern.\nCompare two details.',
    'Choose a favorite corner.',
  ])
})

test('guest preview explains non-persistence and offers responsive next actions', async () => {
  const rendered = await renderPreview(preview)
  const main = rendered.nodes.find((node) => node.type === 'main')
  const page = rendered.nodes.find((node) => node.props?.className === 'flex h-dvh flex-col overflow-hidden')
  const scrollPanel = rendered.nodes.find((node) => node.props?.['aria-label'] === 'Quest preview')
  const nextActions = rendered.nodes.find((node) => node.props?.['aria-label'] === 'What to do next')
  assert.ok(rendered.nodes.some((node) => node.type?.name === 'QuestVideoBackground'))
  assert.ok(rendered.nodes.some((node) => node.props?.className?.includes('pixel-quest-panel')))
  assert.ok(rendered.nodes.some((node) => node.props?.className?.includes('pixel-quest-step')))
  assert.ok(rendered.nodes.some((node) => node.props?.className?.includes('pixel-quest-step-number')))
  assert.ok(page)
  assert.match(main.props.className, /flex-1/)
  assert.match(main.props.className, /px-3/)
  assert.match(scrollPanel.props.className, /quest-video-scroll/)
  assert.equal(scrollPanel.props.tabIndex, 0)
  assert.match(nextActions.props.className, /sm:flex-row/)
  assert.ok(rendered.nodes.some((node) => node.props?.children === 'This one-time preview is not saved. Only location- or photo-verified quest steps can award XP; recreation steps are for fun only.'))
  assert.ok(rendered.nodes.some((node) => node.props?.children === 'Sign in for saved quests'))
  const returnButton = rendered.nodes.find((node) => node.props?.children === 'Back to quest board')
  returnButton.props.onClick()
  assert.deepEqual(rendered.navigations, ['/'])
})

test('guest preview with expired in-memory data has an explicit return action', async () => {
  const rendered = await renderPreview(null)
  const returnButton = rendered.nodes.find((node) => node.props?.children === 'Return to quest board')
  assert.ok(returnButton)
  returnButton.props.onClick()
  assert.deepEqual(rendered.navigations, ['/'])
})
