import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const source = await readFile(new URL('../src/features/leaderboard/leaderboardTiers.ts', import.meta.url), 'utf8')
const module = new vm.SourceTextModule(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText)
await module.link(() => { throw new Error('Pure tiers must not import services') })
await module.evaluate()
const { getXpTier, XP_TIERS } = module.namespace

for (let index = 0; index <= 8; index++) {
  test(`tier boundary ${XP_TIERS[index]}: exact, immediately below and above`, () => {
    const threshold = index * 50
    assert.equal(getXpTier(threshold).name, XP_TIERS[index])
    assert.equal(getXpTier(threshold).percent, index === 8 ? 100 : 0)
    assert.equal(getXpTier(threshold).remaining, index === 8 ? 0 : 50)
    if (index > 0) {
      assert.equal(getXpTier(threshold - 1).name, XP_TIERS[index - 1])
      assert.equal(getXpTier(threshold - 1).remaining, 1)
      assert.equal(getXpTier(threshold - 1).percent, 98)
    }
    assert.equal(getXpTier(threshold + 1).name, XP_TIERS[index])
    assert.equal(getXpTier(threshold + 1).percent, index === 8 ? 100 : 2)
  })
}
test('138 XP is Silver, 76 percent, 12 XP from Gold; Radiant stays max', () => {
  const tier = getXpTier(138)
  assert.equal(tier.name, 'Silver')
  assert.equal(tier.percent, 76)
  assert.equal(tier.progress, 38)
  assert.equal(tier.remaining, 12)
  assert.equal(tier.next, 'Gold')
  assert.equal(getXpTier(1500).xp, 1500)
  assert.equal(getXpTier(1500).name, 'Radiant')
  assert.equal(getXpTier(1500).next, null)
})
test('invalid display balances fail rather than changing canonical XP', () => {
  for (const value of [-1, NaN, Infinity, 1.5, '50']) assert.throws(() => getXpTier(value))
})
