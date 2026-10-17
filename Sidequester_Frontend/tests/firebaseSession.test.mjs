import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const source = await readFile(new URL('../src/services/firebaseSession.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023 },
}).outputText

async function fixture() {
  const calls = []
  const auth = { currentUser: null, authStateReady: async () => undefined }
  const sdk = {
    inMemoryPersistence: {},
    setPersistence: async () => undefined,
    signOut: async () => { calls.push('signOut'); auth.currentUser = null },
    signInWithCustomToken: async (_, token) => {
      calls.push(['signIn', token])
      await transport.beforeSignIn(token)
      const user = { uid: token, getIdToken: async () => `id-token-for-${token}` }
      auth.currentUser = user
      return { user }
    },
  }
  const transport = {
    beforeSignIn: async () => undefined,
    fetch: async (url, options) => {
      calls.push(['fetch', url, options])
      const uid = options.headers.Authorization.replace('Bearer clerk-', '')
      return { ok: true, json: async () => ({ uid, firebaseCustomToken: uid }) }
    },
  }
  const context = vm.createContext({ DOMException, fetch: (...args) => transport.fetch(...args) })
  const module = new vm.SourceTextModule(compiled, {
    context,
    initializeImportMeta(meta) { meta.env = {} },
  })
  await module.link((specifier) => {
    const exports = specifier === 'firebase/auth' ? sdk : { firebaseAuth: auth }
    return new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [name, value] of Object.entries(exports)) this.setExport(name, value)
    }, { context })
  })
  await module.evaluate()
  return { api: module.namespace, auth, sdk, transport, calls }
}

test('exchanges a Clerk session and returns a Firebase ID token for the same UID', async () => {
  const f = await fixture()
  await f.api.synchronizeFirebaseSession('user_a', async () => 'clerk-user_a', new AbortController().signal)
  assert.equal(f.auth.currentUser.uid, 'user_a')
  assert.equal(await f.api.getFirebaseIdToken('user_a'), 'id-token-for-user_a')
  const request = f.calls.find((call) => call[0] === 'fetch')
  assert.equal(request[1], 'http://127.0.0.1:8000/auth/firebase')
  assert.equal(request[2].body, '{}')
  assert.equal(request[2].headers.Authorization, 'Bearer clerk-user_a')
  await assert.rejects(f.api.getFirebaseIdToken('user_b'), /not connected/)
})

test('Clerk sign-out clears Firebase without requesting a new token', async () => {
  const f = await fixture()
  f.auth.currentUser = { uid: 'user_a' }
  await f.api.synchronizeFirebaseSession(null, async () => { throw new Error('must not run') },
    new AbortController().signal)
  assert.equal(f.auth.currentUser, null)
  assert.equal(f.calls.filter((call) => call[0] === 'fetch').length, 0)
})

test('a bridge identity mismatch fails closed and clears the old session', async () => {
  const f = await fixture()
  f.auth.currentUser = { uid: 'old-user' }
  f.transport.fetch = async () => ({ ok: true, json: async () => ({ uid: 'other', firebaseCustomToken: 'other' }) })
  await assert.rejects(f.api.synchronizeFirebaseSession('user_a', async () => 'clerk-user_a',
    new AbortController().signal), /unexpected identity/)
  assert.equal(f.auth.currentUser, null)
})

test('an SDK identity mismatch is rejected before the app becomes ready', async () => {
  const f = await fixture()
  f.transport.fetch = async () => ({ ok: true, json: async () => ({ uid: 'user_a', firebaseCustomToken: 'wrong-user' }) })
  await assert.rejects(f.api.synchronizeFirebaseSession('user_a', async () => 'clerk-user_a',
    new AbortController().signal), /identities do not match/)
  assert.equal(f.auth.currentUser, null)
})

test('a rejected UF account gets the backend message without signing into Firebase', async () => {
  const f = await fixture()
  f.transport.fetch = async () => ({ ok: false, json: async () => ({ detail: 'A verified UF account is required' }) })
  await assert.rejects(f.api.synchronizeFirebaseSession('user_a', async () => 'clerk-user_a',
    new AbortController().signal), /verified UF/)
  assert.equal(f.calls.filter((call) => call[0] === 'signIn').length, 0)
})

test('cancelled in-flight sign-in cleans up before the next account signs in', async () => {
  const f = await fixture()
  let release
  const signingIn = new Promise((resolve) => { release = resolve })
  let started
  const start = new Promise((resolve) => { started = resolve })
  f.transport.beforeSignIn = async (uid) => {
    if (uid === 'user_a') {
      started()
      await signingIn
    }
  }
  const firstController = new AbortController()
  const first = f.api.synchronizeFirebaseSession('user_a', async () => 'clerk-user_a', firstController.signal)
  const cancelled = assert.rejects(first, { name: 'AbortError' })
  await start
  firstController.abort()
  const second = f.api.synchronizeFirebaseSession('user_b', async () => 'clerk-user_b', new AbortController().signal)
  release()
  await cancelled
  await second
  assert.equal(f.auth.currentUser.uid, 'user_b')
  assert.equal(f.calls.filter((call) => call[0] === 'signIn' && call[1] === 'user_a').length, 1)
  const secondSignIn = f.calls.findIndex((call) => call[0] === 'signIn' && call[1] === 'user_b')
  assert.ok(f.calls.lastIndexOf('signOut') < secondSignIn)
})

test('StrictMode cleanup can cancel a queued transition without poisoning the next one', async () => {
  const f = await fixture()
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(f.api.synchronizeFirebaseSession('user_a', async () => 'unused', controller.signal),
    { name: 'AbortError' })
  await f.api.synchronizeFirebaseSession('user_a', async () => 'clerk-user_a', new AbortController().signal)
  assert.equal(f.auth.currentUser.uid, 'user_a')
})
