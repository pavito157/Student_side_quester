import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const source = await readFile(new URL('../src/services/questAssignment.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023 },
}).outputText
const example = JSON.parse(await readFile(
  new URL('../../backend/contracts/assignment.preview.example.json', import.meta.url), 'utf8',
))
const payload = JSON.parse(await readFile(
  new URL('../../backend/contracts/assignment.request.example.json', import.meta.url), 'utf8',
))
const savedExample = JSON.parse(await readFile(
  new URL('../../backend/contracts/assignment.response.example.json', import.meta.url), 'utf8',
))

async function fixture() {
  const calls = []
  const state = {
    getToken: async (uid) => { calls.push(['getToken', uid]); return 'firebase-id-token' },
    fetch: async (url, options) => {
      calls.push(['fetch', url, options])
      return { ok: true, status: 200, json: async () => structuredClone(example) }
    },
  }
  const context = vm.createContext({ fetch: (...args) => state.fetch(...args) })
  const module = new vm.SourceTextModule(compiled, {
    context,
    initializeImportMeta(meta) { meta.env = { VITE_API_BASE_URL: 'http://localhost:8000/' } },
  })
  await module.link((name) => name === '../types/sidequest'
    ? new vm.SyntheticModule(['MAX_QUEST_STEPS', 'MAX_QUEST_STOPS'], function () {
      this.setExport('MAX_QUEST_STEPS', 10)
      this.setExport('MAX_QUEST_STOPS', 10)
    }, { context })
    : new vm.SyntheticModule(['getFirebaseIdToken'], function () {
      this.setExport('getFirebaseIdToken', (...args) => state.getToken(...args))
    }, { context }))
  await module.evaluate()
  return { api: module.namespace, state, calls }
}

test('posts the exact teammate payload with a Firebase ID token, without mutating input', async () => {
  const f = await fixture()
  const before = structuredClone(payload)
  const result = await f.api.requestTestQuest('user_student', payload)
  assert.equal(result.mode, 'test')
  assert.equal(result.saved, false)
  assert.deepEqual(f.calls[0], ['getToken', 'user_student'])
  const [, url, request] = f.calls[1]
  assert.equal(url, 'http://localhost:8000/quests/preview')
  assert.equal(request.method, 'POST')
  assert.equal(request.headers.Authorization, 'Bearer firebase-id-token')
  assert.equal(request.credentials, 'omit')
  assert.deepEqual(JSON.parse(request.body), before)
  assert.deepEqual(payload, before)
  assert.equal(JSON.parse(request.body).userId, undefined)
})

test('an unavailable or mismatched identity prevents the HTTP request', async () => {
  const f = await fixture()
  f.state.getToken = async () => { throw new Error('Account not connected') }
  await assert.rejects(f.api.requestTestQuest('user_other', payload), /Account not connected/)
  assert.equal(f.calls.length, 0)
})

test('authentication and authorization errors retain their HTTP status', async () => {
  const f = await fixture()
  for (const status of [401, 403, 503]) {
    f.state.fetch = async () => ({ ok: false, status, json: async () => ({ detail: 'Request rejected' }) })
    await assert.rejects(f.api.requestTestQuest('user_student', payload), (error) => {
      assert.ok(error instanceof f.api.QuestApiError)
      assert.equal(error.status, status)
      assert.equal(error.message, 'Request rejected')
      return true
    })
  }
})

test('422 responses expose field errors for frontend form feedback', async () => {
  const f = await fixture()
  const detail = [{ loc: ['body', 'time', 'customMinutes'], msg: 'Input should be a valid integer' }]
  f.state.fetch = async () => ({ ok: false, status: 422, json: async () => ({ detail }) })
  await assert.rejects(f.api.requestTestQuest('user_student', payload), (error) => {
    assert.equal(error.status, 422)
    assert.equal(error.message, 'time.customMinutes: Input should be a valid integer')
    assert.deepEqual(error.detail, detail)
    return true
  })
})

test('network failures identify the backend connection without including credentials', async () => {
  const f = await fixture()
  f.state.fetch = async () => { throw new TypeError('Failed to fetch') }
  await assert.rejects(f.api.requestTestQuest('user_student', payload), (error) => {
    assert.match(error.message, /Could not connect right now/)
    assert.equal(error.message.includes('firebase-id-token'), false)
    return true
  })
})

test('non-JSON responses explain a possible backend URL mismatch', async () => {
  const f = await fixture()
  f.state.fetch = async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('HTML') } })
  await assert.rejects(f.api.requestTestQuest('user_student', payload), /Something went wrong while loading your quest/)
})

test('saved assignments and malformed responses cannot masquerade as integration previews', async () => {
  const f = await fixture()
  for (const result of [
    { ...example, saved: true }, { ...example, filtersApplied: true },
    { ...example, quest: { ...example.quest, steps: [] } },
    { ...example, quest: { ...example.quest, estimatedMinutes: '20' } },
    { ...example, quest: { ...example.quest, estimatedCostDollars: -1 } },
    { quest: example.quest, assignment: { status: 'assigned' } },
  ]) {
    f.state.fetch = async () => ({ ok: true, status: 200, json: async () => result })
    await assert.rejects(f.api.requestTestQuest('user_student', payload), /unexpected quest preview format/)
  }
})

test('caller cancellation is passed to fetch and is not converted into a network error', async () => {
  const f = await fixture()
  const controller = new AbortController()
  const cancellation = new DOMException('Cancelled', 'AbortError')
  f.state.fetch = async (_, options) => {
    assert.equal(options.signal, controller.signal)
    controller.abort()
    throw cancellation
  }
  await assert.rejects(f.api.requestTestQuest('user_student', payload, { signal: controller.signal }),
    (error) => error === cancellation)
})

const generatedExample = {
  ...example, mode: 'generated', filtersApplied: false, destinationVerified: false,
  distanceStatus: 'not_requested', distanceMeters: null, destination: null,
  quest: {
    ...example.quest,
    stepProofMethods: example.quest.steps.map(() => 'location'),
    locationAddress: 'Proposed UF campus address',
  },
}

test('Gemini helper posts the same input plus optional search coordinates to its own endpoint', async () => {
  const f = await fixture()
  f.state.fetch = async (url, options) => {
    f.calls.push(['fetch', url, options])
    return { ok: true, status: 200, json: async () => ({ ...structuredClone(generatedExample), distanceStatus: 'pending' }) }
  }
  const body = { ...payload, distance: 2, originCoordinates: { latitude: 29.64, longitude: -82.35 } }
  const result = await f.api.requestGeneratedQuest('user_student', body)
  assert.equal(result.mode, 'generated')
  assert.equal(result.saved, false)
  assert.equal(f.calls[1][1], 'http://localhost:8000/quests/generate')
  assert.equal(f.calls[1][2].headers.Authorization, 'Bearer firebase-id-token')
  assert.deepEqual(JSON.parse(f.calls[1][2].body), body)
})

test('guests can request a preview without a Firebase token or persistence endpoint', async () => {
  const f = await fixture()
  f.state.fetch = async (url, options) => {
    f.calls.push(['fetch', url, options])
    return { ok: true, status: 200, json: async () => structuredClone(generatedExample) }
  }
  const result = await f.api.requestGeneratedQuest(null, payload)
  assert.equal(result.saved, false)
  assert.equal(f.calls.length, 1)
  assert.equal(f.calls[0][0], 'fetch')
  assert.equal(f.calls[0][2].headers.Authorization, undefined)
  assert.equal(f.calls[0][1], 'http://localhost:8000/quests/generate')
})

test('Gemini helper rejects test, saved, and malformed destination responses', async () => {
  const f = await fixture()
  for (const result of [example, { ...generatedExample, saved: true },
    { ...generatedExample, quest: { ...generatedExample.quest, locationAddress: '' } },
    { ...generatedExample, filtersApplied: true, destinationVerified: true, destination: { latitude: 91 } },
  ]) {
    f.state.fetch = async () => ({ ok: true, status: 200, json: async () => result })
    await assert.rejects(f.api.requestGeneratedQuest('user_student', payload), /unexpected generated quest format|invalid quest destination/)
  }
})

test('Gemini setup, quota and validation failures preserve actionable HTTP errors', async () => {
  const f = await fixture()
  for (const status of [409, 422, 429, 502, 503, 504]) {
    f.state.fetch = async () => ({ ok: false, status, json: async () => ({ detail: 'Generation failed' }) })
    await assert.rejects(f.api.requestGeneratedQuest('user_student', payload), (error) => {
      assert.equal(error.status, status)
      assert.equal(error.message, 'Generation failed')
      return true
    })
  }
})


test('Gemini helper accepts resolver output only with consistent verification flags', async () => {
  const f = await fixture()
  const resolved = {
    ...generatedExample, destinationVerified: true, filtersApplied: true,
    destination: { latitude: 29.64, longitude: -82.35, locationName: 'Verified place', scope: 'gainesville_city', placeId: 'p1' },
  }
  f.state.fetch = async () => ({ ok: true, status: 200, json: async () => structuredClone(resolved) })
  assert.equal((await f.api.requestGeneratedQuest('user_student', payload)).destinationVerified, true)
  for (const invalid of [
    { ...resolved, destinationVerified: false },
    { ...resolved, distanceStatus: 'verified', distanceMeters: 200 },
    { ...resolved, destination: { ...resolved.destination, scope: 'off_campus' } },
    { ...resolved, destination: { ...resolved.destination, latitude: '29.64' } },
  ]) {
    f.state.fetch = async () => ({ ok: true, status: 200, json: async () => invalid })
    await assert.rejects(f.api.requestGeneratedQuest('user_student', payload))
  }
})

test('optional diagnostics report client durations and server stages without credentials', async () => {
  const f = await fixture()
  f.state.fetch = async () => ({ ok: true, status: 200,
    headers: { get: () => 'auth;dur=120.0, gemini;dur=1500.0, total;dur=1630.0' },
    json: async () => structuredClone(generatedExample),
  })
  let timing
  await f.api.requestGeneratedQuest('user_student', payload, { onTiming: (value) => { timing = value } })
  for (const field of ['tokenMs', 'requestMs', 'totalMs']) assert.ok(timing[field] >= 0)
  assert.ok(timing.totalMs >= timing.tokenMs)
  assert.match(timing.serverTiming, /gemini;dur=1500/)
  assert.equal(JSON.stringify(timing).includes('firebase-id-token'), false)
  const result = await f.api.requestGeneratedQuest('user_student', payload, {
    onTiming: () => { throw new Error('Diagnostic UI failed') },
  })
  assert.equal(result.mode, 'generated')
})

test('assignment helper accepts committed new/reused responses and binds them to the account', async () => {
  const f = await fixture()
  const uid = savedExample.assignment.userId
  for (const reusedExisting of [false, true]) {
    f.state.fetch = async (url, options) => {
      assert.equal(url, 'http://localhost:8000/quests/assign')
      assert.equal(options.method, 'POST')
      assert.deepEqual(JSON.parse(options.body), payload)
      return { ok: true, status: reusedExisting ? 200 : 201,
        json: async () => ({ ...structuredClone(savedExample), reusedExisting }) }
    }
    assert.equal((await f.api.requestAssignedQuest(uid, payload)).reusedExisting, reusedExisting)
  }
})

test('current-quest helper reloads by GET and handles an empty active assignment', async () => {
  const f = await fixture()
  const uid = savedExample.assignment.userId
  for (const result of [null, savedExample]) {
    f.state.fetch = async (url, options) => {
      assert.equal(url, 'http://localhost:8000/me/quest')
      assert.equal(options.method, 'GET')
      assert.equal(options.body, undefined)
      assert.equal(options.headers.Authorization, 'Bearer firebase-id-token')
      return { ok: true, status: 200, json: async () => structuredClone(result) }
    }
    const loaded = await f.api.getCurrentQuest(uid)
    assert.equal(loaded === null, result === null)
    if (loaded) assert.equal(loaded.quest.id, savedExample.quest.id)
  }
})

test('saved-assignment helpers reject previews, cross-account and inconsistent states', async () => {
  const f = await fixture()
  const uid = savedExample.assignment.userId
  for (const value of [
    example, generatedExample,
    { ...savedExample, assignment: { ...savedExample.assignment, userId: 'other' } },
    { ...savedExample, assignment: { ...savedExample.assignment, questId: 'other' } },
    { ...savedExample, assignment: { ...savedExample.assignment, status: 'completed' } },
    { ...savedExample, assignment: { ...savedExample.assignment, xpAwarded: 25 } },
    { ...savedExample, assignment: { ...savedExample.assignment, assignedAt: 'not-a-date' } },
    { ...savedExample, quest: { ...savedExample.quest, latitude: 91 } },
    { ...savedExample, quest: { ...savedExample.quest, isActive: false } },
  ]) {
    f.state.fetch = async () => ({ ok: true, status: 200, json: async () => structuredClone(value) })
    await assert.rejects(f.api.requestAssignedQuest(uid, payload), /invalid saved assignment/)
    await assert.rejects(f.api.getCurrentQuest(uid), /invalid saved assignment/)
  }
})

test('assignment resolver/configuration failures do not masquerade as saved quests', async () => {
  const f = await fixture()
  f.state.fetch = async () => ({ ok: false, status: 503,
    json: async () => ({ detail: 'Destination resolver is not connected' }) })
  await assert.rejects(f.api.requestAssignedQuest('user_student', payload), (error) => {
    assert.equal(error.status, 503)
    assert.match(error.message, /resolver/)
    return true
  })
})

test('posts the merged frontend distance object and nullable vibe unchanged', async () => {
  const f = await fixture()
  const body = {
    ...payload, distance: { maxDistance: 2, unit: 'miles' }, vibePreferences: null,
    originCoordinates: { latitude: 29.64, longitude: -82.35 },
  }
  await f.api.requestTestQuest('user_student', body)
  assert.deepEqual(JSON.parse(f.calls[1][2].body), body)
})

test('frontend helper accepts the captured real FastAPI emulator response', async () => {
  const f = await fixture()
  const captured = JSON.parse(await readFile(new URL(
    '../../backend/contracts/assignment.response.tested.example.json', import.meta.url,
  ), 'utf8'))
  f.state.fetch = async () => ({ ok: true, status: 201, json: async () => structuredClone(captured) })
  const result = await f.api.requestAssignedQuest('example-user', payload)
  assert.deepEqual(result, captured)
  assert.equal(result.assignment.questId, result.quest.id)
  assert.equal(result.assignment.xpAwarded, 0)
})

test('frontend helper accepts FastAPI JSON generated with live Gemini and Places', async () => {
  const f = await fixture()
  const captured = JSON.parse(await readFile(new URL(
    '../../backend/contracts/assignment.response.live.example.json', import.meta.url,
  ), 'utf8'))
  f.state.fetch = async () => ({ ok: true, status: 201, json: async () => structuredClone(captured) })
  assert.deepEqual(await f.api.requestAssignedQuest('example-user', payload), captured)
})

test('completion sends fresh GPS to FastAPI with the authenticated identity and uses server XP', async () => {
  const f = await fixture()
  const response = {
    questId: 'quest-1', status: 'completed', stopIndex: 0, xpAwarded: 40, xpAwardedSoFar: 40,
    completedStops: [0], totalStops: 1,
  }
  f.state.fetch = async (url, options) => {
    f.calls.push(['fetch', url, options])
    return { ok: true, status: 200, json: async () => response }
  }
  const completion = await f.api.requestQuestCompletion(
    'user_student', 'quest-1', { latitude: 29.65, longitude: -82.34, accuracy: 12 },
  )
  assert.equal(completion.xpAwarded, response.xpAwarded)
  assert.equal(completion.status, response.status)
  assert.deepEqual(Array.from(completion.completedStops), response.completedStops)
  const [, url, request] = f.calls[1]
  assert.equal(url, 'http://localhost:8000/quests/quest-1/complete')
  assert.equal(request.headers.Authorization, 'Bearer firebase-id-token')
  assert.deepEqual(JSON.parse(request.body), { latitude: 29.65, longitude: -82.34, accuracy: 12, stopIndex: 0 })
})

test('completion surfaces proximity failures and refuses inconsistent successful responses', async () => {
  const f = await fixture()
  f.state.fetch = async () => ({ ok: false, status: 400, json: async () => ({ detail: { valid: false, reason: 'Move closer to the destination and try again.' } }) })
  await assert.rejects(f.api.requestQuestCompletion('user_student', 'quest-1', {}), /Move closer/)
  f.state.fetch = async () => ({ ok: true, status: 200, json: async () => ({
    questId: 'another-quest', status: 'completed', stopIndex: 0, xpAwarded: 999,
    xpAwardedSoFar: 999, completedStops: [0], totalStops: 1,
  }) })
  await assert.rejects(f.api.requestQuestCompletion('user_student', 'quest-1', {}), /invalid completion response/)
})


test('replacement helper posts the latest filters for the displayed quest with Firebase authentication', async () => {
  const f = await fixture()
  f.state.fetch = async (url, options) => {
    f.calls.push(['fetch', url, options])
    return { ok: true, status: 201, json: async () => structuredClone(savedExample) }
  }
  const result = await f.api.requestReplacementQuest(savedExample.assignment.userId, 'old-quest', payload)
  assert.equal(result.quest.id, savedExample.quest.id)
  const [, url, options] = f.calls[1]
  assert.equal(url, 'http://localhost:8000/quests/old-quest/another')
  assert.equal(options.headers.Authorization, 'Bearer firebase-id-token')
  assert.deepEqual(JSON.parse(options.body), payload)
  for (const response of [savedExample, { ...savedExample, reusedExisting: true }]) {
    f.state.fetch = async () => ({ ok: true, status: 201, json: async () => structuredClone(response) })
    await assert.rejects(f.api.requestReplacementQuest(savedExample.assignment.userId, savedExample.quest.id, payload), /invalid additional/)
  }
})

test('stale replacement errors retain HTTP 409 for actionable UI feedback', async () => {
  const f = await fixture()
  f.state.fetch = async () => ({ ok: false, status: 409, json: async () => ({ detail: 'Your current quest changed. Reopen it before generating another.' }) })
  await assert.rejects(f.api.requestReplacementQuest('example-user', 'old-quest', payload), (error) => error.status === 409 && /Reopen/.test(error.message))
})

test('multi-stop completion validates and returns partial progress', async () => {
  const f = await fixture()
  f.state.fetch = async () => ({ ok: true, status: 200, json: async () => ({
    questId: 'quest-1', status: 'in_progress', stopIndex: 1, xpAwarded: 14,
    xpAwardedSoFar: 28, completedStops: [0, 1], totalStops: 3,
  }) })
  const progress = await f.api.requestQuestCompletion(
    'user_student', 'quest-1', { latitude: 29.65, longitude: -82.34, accuracy: 12 }, 1,
  )
  assert.deepEqual(progress.completedStops, [0, 1])
  assert.equal(progress.status, 'in_progress')
})

test('abandon sends an authenticated request and validates the deleted sidequest response', async () => {
  const f = await fixture()
  f.state.fetch = async (url, options) => {
    f.calls.push(['fetch', url, options])
    return { ok: true, status: 200, json: async () => ({ questId: 'quest-1', status: 'abandoned' }) }
  }
  await f.api.requestQuestAbandon('user_student', 'quest-1')
  const [, url, request] = f.calls[1]
  assert.equal(url, 'http://localhost:8000/quests/quest-1/abandon')
  assert.ok(request.headers.Authorization)
  assert.equal(request.body, undefined)

  f.state.fetch = async () => ({ ok: true, status: 200, json: async () => ({ questId: 'other', status: 'abandoned' }) })
  await assert.rejects(f.api.requestQuestAbandon('user_student', 'quest-1'), /invalid abandon response/)
})


test('active list is authenticated and validates ownership, unique IDs and three total quests', async () => {
  const f = await fixture()
  const rows = [1, 2, 3].map((i) => ({ ...structuredClone(savedExample),
    quest: { ...savedExample.quest, id: `quest-${i}` },
    assignment: { ...savedExample.assignment, id: `${savedExample.assignment.userId}_quest-${i}`, questId: `quest-${i}` },
  }))
  let response = rows
  f.state.fetch = async (url, options) => {
    f.calls.push(['fetch', url, options])
    return { ok: true, status: 200, json: async () => response }
  }
  assert.equal((await f.api.getActiveQuests(savedExample.assignment.userId)).length, 3)
  assert.equal(f.calls[1][1], 'http://localhost:8000/me/active-quests')
  assert.equal(f.calls[1][2].method, 'GET')
  assert.equal(f.calls[1][2].headers.Authorization, 'Bearer firebase-id-token')
  for (const bad of [[rows[0], rows[0]], [...rows, rows[0]], [{ ...rows[0], assignment: { ...rows[0].assignment, userId: 'other' } }], null]) {
    response = bad
    await assert.rejects(f.api.getActiveQuests(savedExample.assignment.userId), /invalid active quest list/)
  }
  response = []
  assert.equal((await f.api.getActiveQuests(savedExample.assignment.userId)).length, 0)
})
