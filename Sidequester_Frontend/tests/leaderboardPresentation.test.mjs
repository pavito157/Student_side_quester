import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

async function load(name) {
  const source = await readFile(new URL(`../src/features/leaderboard/${name}.ts`, import.meta.url), 'utf8')
  const module = new vm.SourceTextModule(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2023 } }).outputText)
  await module.link(() => { throw new Error('Presentation must remain independent of services') })
  await module.evaluate()
  return module.namespace
}
const { splitRankings, playerStanding, placementName } = await load('leaderboardPresentation')
const rows = Object.freeze([
  { id: 'first', xp: 161 }, { id: 'second', xp: 161 }, { id: 'you', xp: 138 }, { id: 'last', xp: 0 },
].map(Object.freeze))

test('podium and roster preserve backend order/ties/XP without duplication or mutation', () => {
  for (let count = 0; count <= 4; count++) {
    const original = rows.slice(0, count)
    const { podium, remaining } = splitRankings(original)
    assert.deepEqual([...podium, ...remaining], original)
    assert.equal(new Set([...podium, ...remaining].map(row => row.id)).size, count)
    assert.equal(podium.length, Math.min(3, count))
  }
  assert.equal(placementName(1), 'Gold')
  assert.equal(placementName(2), 'Silver')
  assert.equal(placementName(3), 'Bronze')
  assert.equal(placementName(4), null)
})
test('current-player comparisons respect backend ties and omit unavailable or unsafe results', () => {
  assert.equal(playerStanding(rows, 'you').overtake, 24)
  assert.equal(playerStanding(rows, 'second').overtake, 1)
  assert.equal(playerStanding(rows, 'first').place, 1)
  assert.equal(playerStanding(rows, 'first').overtake, null)
  assert.equal(playerStanding(rows, 'missing'), null)
  assert.equal(playerStanding([], 'you'), null)
  assert.equal(playerStanding(rows, ''), null)
  assert.equal(playerStanding([{ id: 'a', xp: Number.MAX_SAFE_INTEGER }, { id: 'you', xp: 0 }], 'you').overtake, null)
})
