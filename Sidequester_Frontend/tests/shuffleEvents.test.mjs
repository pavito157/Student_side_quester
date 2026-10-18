import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
const source = await readFile(new URL('../src/services/shuffleEvents.ts', import.meta.url), 'utf8')
const mod = new vm.SourceTextModule(ts.transpileModule(source, {compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText)
await mod.link(()=>{throw new Error('Unexpected import')}); await mod.evaluate()
const shuffle = mod.namespace.shuffleEvents

test('refresh shuffles without removing events or mutating event state', () => {
  const events = Object.freeze([{id:'a',completed:true}, {id:'b'}, {id:'c'}])
  for(let i=0;i<30;i++) {
    const result = shuffle(events, events)
    assert.deepEqual([...result].map(e=>e.id).sort(), ['a','b','c'])
    assert.notDeepEqual([...result].map(e=>e.id), events.map(e=>e.id))
    assert.ok(result.every(e=>events.includes(e)))
    assert.equal(events[0].completed,true)
  }
})
test('empty and single-event boards remain usable',()=>{
  assert.equal(shuffle([]).length,0)
  const events=[{id:'a'}]
  assert.equal(shuffle(events,events)[0],events[0])
})
