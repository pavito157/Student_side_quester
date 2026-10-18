import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

async function apiFixture(status, detail) {
  const source = await readFile(new URL('../src/services/questAssignment.ts', import.meta.url), 'utf8')
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023 },
  }).outputText
  let requests = 0
  const context = vm.createContext({ fetch: async () => {
    requests++
    return { ok: false, status, json: async () => ({ detail }) }
  } })
  const module = new vm.SourceTextModule(compiled, { context,
    initializeImportMeta(meta) { meta.env = { VITE_API_BASE_URL: 'http://localhost:8000' } },
  })
  await module.link((name) => {
    const values = name.endsWith('/types/sidequest')
      ? { MAX_QUEST_STEPS: 10, MAX_QUEST_STOPS: 10 }
      : { getFirebaseIdToken: async () => { throw new Error('Guest request must not require authentication') } }
    return new vm.SyntheticModule(Object.keys(values), function () {
      for (const [key, value] of Object.entries(values)) this.setExport(key, value)
    }, { context })
  })
  await module.evaluate()
  return { api: module.namespace, requests: () => requests }
}

test('unavailable experience and proof incompatibility retain actionable 409 explanations', async () => {
  for (const code of ['experience_unavailable', 'proof_incompatible']) {
    const reason = code === 'experience_unavailable'
      ? 'Event availability is unknown. Choose a compatible independent activity.'
      : 'Location cannot demonstrate dancing. Adjust the selected proof options.'
    const f = await apiFixture(409, { code, reason, correlationId: 'a'.repeat(32),
      stage: 'proof_obligations', missingRequirements: ['action_completion'] })
    await assert.rejects(f.api.requestGeneratedQuest(null, {}), (error) => {
      assert.equal(error.status, 409)
      assert.equal(error.message, reason)
      assert.equal(error.detail.code, code)
      assert.equal(error.detail.correlationId, 'a'.repeat(32))
      assert.deepEqual(error.detail.missingRequirements, ['action_completion'])
      return true
    })
    assert.equal(f.requests(), 1)
  }
})

test('technical provider errors remain distinguishable and never trigger hidden retries', async () => {
  const f = await apiFixture(503, 'Experience planning or review temporarily unavailable')
  await assert.rejects(f.api.requestGeneratedQuest(null, {}), (error) => {
    assert.equal(error.status, 503)
    assert.match(error.message, /temporarily unavailable/)
    return true
  })
  assert.equal(f.requests(), 1)
})
