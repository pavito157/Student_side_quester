import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const source = await readFile(new URL('../src/services/leaderboard.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023 },
}).outputText

async function loadService({ apiBaseUrl, response }) {
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
      meta.env = { VITE_API_BASE_URL: apiBaseUrl }
    },
  })
  await module.link(() => {
    throw new Error('The leaderboard service should not import dependencies.')
  })
  await module.evaluate()
  return { api: module.namespace, requests }
}

test('loads individual leaderboard from the backend with Firebase bearer token', async () => {
  const f = await loadService({
    apiBaseUrl: 'https://api.example.test/',
    response: {
      ok: true,
      json: async () => ({
        leaderboard: [{ userId: 'user_1', username: 'Alex', xp: 42 }],
          }),
    },
  })

  assert.deepEqual(JSON.parse(JSON.stringify(await f.api.getLeaderboardEntries('firebase-id-token'))), {
    entries: [{ userId: 'user_1', username: 'Alex', xp: 42 }],
  })
  assert.equal(f.requests[0][0], 'https://api.example.test/leaderboard')
  assert.equal(f.requests[0][1].headers.Authorization, 'Bearer firebase-id-token')
  assert.equal(f.requests[0][1].credentials, 'omit')
})

test('loads dorm leaderboard from the backend', async () => {
  const f = await loadService({
    apiBaseUrl: 'http://127.0.0.1:8000',
    response: {
      ok: true,
      json: async () => ({
        leaderboard: [{ dormId: 'broward', dormName: 'Broward Hall', xp: 120, memberCount: 4 }],
          }),
    },
  })

  assert.deepEqual(JSON.parse(JSON.stringify(await f.api.getDormLeaderboardEntries('firebase-id-token'))), {
    entries: [{ dormId: 'broward', dormName: 'Broward Hall', xp: 120, memberCount: 4 }],
  })
  assert.equal(f.requests[0][0], 'http://127.0.0.1:8000/leaderboard/dorms')
})

test('surfaces backend error and rejects malformed ranking data', async () => {
  const failed = await loadService({
    apiBaseUrl: '',
    response: { ok: false, json: async () => ({ detail: 'A verified email account is required' }) },
  })
  await assert.rejects(
    failed.api.getLeaderboardEntries('firebase-id-token'),
    /verified email account is required/,
  )

  const malformed = await loadService({
    apiBaseUrl: '',
    response: { ok: true, json: async () => ({ leaderboard: [{ xp: 'many' }], skippedUsers: 0 }) },
  })
  await assert.rejects(
    malformed.api.getLeaderboardEntries('firebase-id-token'),
    /invalid student data/,
  )
})
