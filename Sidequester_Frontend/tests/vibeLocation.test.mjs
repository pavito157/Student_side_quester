import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

class Timestamp {
  toDate() { return new Date('2026-10-17T12:00:00Z') }
}

const source = await readFile(new URL('../src/services/vibes.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023 },
}).outputText

function copyDocument(data) {
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [
    key,
    value instanceof Timestamp ? value : structuredClone(value),
  ]))
}

async function fixture() {
  const state = { vibes: new Map(), nextId: 0 }
  const context = vm.createContext({})
  const mod = new vm.SourceTextModule(compiled, { context })
  await mod.link((name) => {
    let exports
    if (name === 'firebase/firestore') {
      exports = {
        addDoc: async (collectionRef, data) => {
          const id = `vibe-${++state.nextId}`
          state.vibes.set(id, copyDocument(data))
          return { id }
        },
        collection: (_db, ...path) => ({ path }),
        deleteDoc: async () => {},
        doc: (collectionRef, id) => ({ collectionRef, id }),
        getDocs: async () => ({
          docs: [...state.vibes].map(([id, data]) => ({
            id,
            data: () => copyDocument(data),
          })),
        }),
        serverTimestamp: () => new Timestamp(),
        setDoc: async (ref, data) => {
          state.vibes.set(ref.id, { ...state.vibes.get(ref.id), ...copyDocument(data) })
        },
        Timestamp,
      }
    } else if (name.endsWith('/FirebaseConfig')) {
      exports = { db: {} }
    } else {
      throw new Error(`Unexpected runtime dependency: ${name}`)
    }
    return new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value)
    }, { context })
  })
  await mod.evaluate()
  return { api: mod.namespace, state }
}

const vibe = {
  name: 'Campus break',
  preferences: 'A relaxed walk',
  where: 'Lake Alice',
  whereCoordinates: { latitude: 29.64, longitude: -82.35 },
  time: '30',
  budget: '0',
  distance: '5',
}

test('saved vibe location label and coordinates round-trip for applying filters', async () => {
  const f = await fixture()
  const saved = await f.api.saveUserVibe('student-1', vibe)
  assert.deepEqual(saved.whereCoordinates, vibe.whereCoordinates)
  assert.deepEqual(f.state.vibes.get(saved.id).whereCoordinates, vibe.whereCoordinates)

  const [loaded] = await f.api.getUserVibes('student-1')
  assert.equal(loaded.where, 'Lake Alice')
  assert.deepEqual(loaded.whereCoordinates, vibe.whereCoordinates)

  await f.api.saveUserVibe('student-1', { ...vibe, whereCoordinates: null }, saved.id)
  const [edited] = await f.api.getUserVibes('student-1')
  assert.equal(edited.whereCoordinates, null)
})

test('legacy saved vibes without coordinates still load and require location reselection for distance', async () => {
  const f = await fixture()
  const saved = await f.api.saveUserVibe('student-1', { ...vibe, whereCoordinates: null })
  assert.equal(saved.whereCoordinates, null)
  const [loaded] = await f.api.getUserVibes('student-1')
  assert.equal(loaded.whereCoordinates, null)
})

test('vibe persistence rejects invalid coordinates instead of saving an unusable location', async () => {
  const f = await fixture()
  await assert.rejects(
    f.api.saveUserVibe('student-1', {
      ...vibe,
      whereCoordinates: { latitude: 91, longitude: -82.35 },
    }),
    /valid coordinates/,
  )
  assert.equal(f.state.vibes.size, 0)
})
