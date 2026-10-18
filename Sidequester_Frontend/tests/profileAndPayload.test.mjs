import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

async function load(name) {
  const source = await readFile(new URL(`../src/services/${name}.ts`, import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023 },
  }).outputText
  const module = new vm.SourceTextModule(compiled)
  await module.link(() => { throw new Error('Unexpected runtime dependency') })
  await module.evaluate()
  return module.namespace
}
const profile = await load('userProfile')
const builder = await load('sidequestJson')

test('XP reads preserve legacy values and canonical zero', () => {
  assert.equal(profile.getUserXp({ totalXp: 42 }), 42)
  assert.equal(profile.getUserXp({ xp: 0, totalXp: 42 }), 0)
  assert.equal(profile.getUserXp(undefined), 0)
  for (const xp of [null, true, -1, '25', NaN, Infinity, 1.5]) {
    assert.throws(() => profile.getUserXp({ xp, totalXp: 42 }), /invalid/)
  }
})

test('request metadata never writes balances, even from an untyped caller', () => {
  const calls = []
  profile.stageUserRequestMetadata({ set: (...args) => calls.push(args) }, 'user-ref', {
    email: 'student@ufl.edu', username: 'Student', requestCount: 3,
    xp: 0, totalXp: 0, activeQuestId: 'forged',
  })
  assert.deepEqual(JSON.parse(JSON.stringify(calls)), [['user-ref', {
    email: 'student@ufl.edu', username: 'Student', requestCount: 3,
  }, { merge: true }]])
})

const input = {
  preferences: ' Nature ', username: ' Student ', location: 'Museum Road',
  originCoordinates: { latitude: 29.65, longitude: -82.34 },
  latitude: null, longitude: null,
  time: { selection: '60', customMinutes: null },
  budget: { selection: '0', customDollars: null },
  distance: { maxDistance: 2, unit: 'miles' }, goals: [' Relax '], vibePreferences: null,
}

test('actual frontend builder preserves the agreed distance object and null vibe', () => {
  const before = structuredClone(input)
  const payload = JSON.parse(builder.serializeSidequestRequest(builder.buildSidequestRequest(input)))
  assert.deepEqual(payload.distance, { maxDistance: 2, unit: 'miles' })
  assert.equal(payload.vibePreferences, null)
  assert.deepEqual(payload.goals, ['Relax'])
  assert.deepEqual(input, before)
})

test('selected vibe name and description survive both request builders without mutation', () => {
  const activeVibe = { name: ' Study Break ', preferences: ' Affordable playful games ' }
  const before = structuredClone(activeVibe)
  const request = builder.buildSidequestRequest({ ...input, activeVibe })
  const payload = builder.toQuestApiPayload(request)
  assert.deepEqual(JSON.parse(JSON.stringify(payload.activeVibe)), {
    name: 'Study Break', preferences: 'Affordable playful games',
  })
  assert.deepEqual(activeVibe, before)
  assert.equal(builder.toQuestApiPayload(builder.buildSidequestRequest({ ...input, activeVibe: null })).activeVibe, null)
  assert.equal('activeVibe' in builder.toQuestApiPayload(builder.buildSidequestRequest(input)), false)
})

test('distance builder rejects invalid limits and unsupported units', () => {
  for (const distance of [
    { maxDistance: 0, unit: 'miles' }, { maxDistance: -1, unit: 'miles' },
    { maxDistance: NaN, unit: 'miles' }, { maxDistance: 2, unit: 'km' },
  ]) {
    assert.throws(() => builder.buildSidequestRequest({ ...input, distance }), /positive number of miles/)
  }
})


test('distance requests require captured origin coordinates, never a silent filter bypass', () => {
  assert.throws(() => builder.buildSidequestRequest({ ...input, originCoordinates: undefined }), /starting place/)
  assert.throws(() => builder.buildSidequestRequest({ ...input, originCoordinates: { latitude: NaN, longitude: -82.34 } }), /valid coordinates/)
  const payload = JSON.parse(builder.serializeSidequestRequest(builder.buildSidequestRequest(input)))
  assert.deepEqual(payload.originCoordinates, input.originCoordinates)
})


test('merged frontend GPS fields are retained for maps but excluded from the API body', () => {
  const request = builder.buildSidequestRequest(input)
  const before = plainJson(request)
  const payload = plainJson(builder.toQuestApiPayload(request))
  assert.equal(request.latitude, input.latitude)
  assert.equal(request.longitude, input.longitude)
  assert.deepEqual(request.originCoordinates, input.originCoordinates)
  assert.deepEqual(plainJson(request), before)
  assert.deepEqual(payload.originCoordinates, input.originCoordinates)
  assert.equal(Object.hasOwn(payload, 'latitude'), false)
  assert.equal(Object.hasOwn(payload, 'longitude'), false)
})

test('API time JSON includes customMinutes only for custom selections', () => {
  for (const selection of ['any', '30', '60', '120']) {
    const request = builder.buildSidequestRequest({
      ...input,
      time: { selection, customMinutes: null },
    })
    assert.deepEqual(plainJson(builder.toQuestApiPayload(request).time), { selection })
  }

  const customRequest = builder.buildSidequestRequest({
    ...input,
    time: { selection: 'custom', customMinutes: 60 },
  })
  assert.deepEqual(plainJson(builder.toQuestApiPayload(customRequest).time), {
    selection: 'custom',
    customMinutes: 60,
  })
})

function plainJson(value) { return JSON.parse(JSON.stringify(value)) }
