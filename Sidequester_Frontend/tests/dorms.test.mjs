import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const source = await readFile(new URL('../src/services/dorms.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023 },
}).outputText

async function loadService(response) {
  const requests = []
  const context = vm.createContext({
    fetch: async (...args) => {
      requests.push(args)
      return response
    },
  })
  const module = new vm.SourceTextModule(compiled, {
    context,
    initializeImportMeta(meta) {
      meta.env = { VITE_API_BASE_URL: 'http://127.0.0.1:8000/' }
    },
  })
  await module.link(() => {
    throw new Error('The dorm service should not import dependencies.')
  })
  await module.evaluate()
  return { api: module.namespace, requests }
}

test('loads signed-in user dorm and catalog from backend', async () => {
  const fixture = await loadService({
    ok: true,
    json: async () => ({
      dormId: null,
      dormName: null,
      dorms: [{ dormId: 'off_campus', dormName: 'Off campus' }],
    }),
  })

  assert.deepEqual(
    JSON.parse(JSON.stringify(await fixture.api.getDormProfile('firebase-id-token'))),
    {
      dormId: null,
      dormName: null,
      dorms: [{ dormId: 'off_campus', dormName: 'Off campus' }],
    },
  )
  assert.equal(fixture.requests[0][0], 'http://127.0.0.1:8000/me/dorm')
  assert.equal(fixture.requests[0][1].headers.Authorization, 'Bearer firebase-id-token')
})

test('saves the selected dorm using an authenticated PUT', async () => {
  const fixture = await loadService({
    ok: true,
    json: async () => ({
      dormId: 'off_campus',
      dormName: 'Off campus',
      dorms: [{ dormId: 'off_campus', dormName: 'Off campus' }],
    }),
  })

  const result = await fixture.api.saveDormSelection('firebase-id-token', 'off_campus')

  assert.equal(result.dormId, 'off_campus')
  assert.equal(fixture.requests[0][0], 'http://127.0.0.1:8000/me/dorm')
  assert.equal(fixture.requests[0][1].method, 'PUT')
  assert.equal(fixture.requests[0][1].body, JSON.stringify({ dormId: 'off_campus' }))
})

test('reports backend errors and rejects malformed catalogs', async () => {
  const failed = await loadService({
    ok: false,
    json: async () => ({ detail: 'Could not save your residence selection.' }),
  })
  await assert.rejects(
    failed.api.saveDormSelection('firebase-id-token', 'beaty_towers'),
    /Could not save your residence selection/,
  )

  const malformed = await loadService({
    ok: true,
    json: async () => ({ dormId: null, dormName: null, dorms: [{ dormId: 12 }] }),
  })
  await assert.rejects(
    malformed.api.getDormProfile('firebase-id-token'),
    /invalid residence data/,
  )
})
