import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
const compile = source => ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2023,jsx:ts.JsxEmit.ReactJSX}}).outputText
const dataSource = compile(await readFile(new URL('../src/services/questMapData.ts',import.meta.url),'utf8'))
async function dataFixture(context=vm.createContext({})) {
  const module = new vm.SourceTextModule(dataSource,{context})
  await module.link(()=>{throw new Error('Unexpected map data import')}); await module.evaluate()
  return module.namespace
}
const event = (id='event') => ({id,organizationName:'Campus Club',title:'Club meeting',description:'Meet the club.',locationName:'Union',latitude:29.65,longitude:-82.34,xpReward:25})
const quest = (id='quest') => ({id,title:'Visit two places',description:'Explore the campus.',locationName:'Union',latitude:29.65,longitude:-82.34,xpValue:30,
  destinations:[{locationName:'Union',latitude:29.65,longitude:-82.34},{locationName:'Library',latitude:29.66,longitude:-82.33}],completedStops:[0]})

test('global-only map excludes personal quests and all their stops while retaining accepted global events',async()=>{
  const api = await dataFixture()
  const accepted = {...quest('accepted-event'),sourceGlobalEventId:'gbm',destinations:[]}
  const pins = api.buildQuestMapPins([event('gbm'),event('open')],[quest('route'),accepted])
  assert.equal(pins.length,2)
  assert.equal(pins.some(pin=>pin.questId==='route'),false)
  assert.equal(pins.find(pin=>pin.questId==='gbm').path,'/sidequests/accepted-event')
  assert.equal(pins.find(pin=>pin.questId==='open').path,'/global-quests/open')
  assert.ok(pins.every(pin=>pin.label==='Check-in' && pin.xpReward===0 && pin.color==='#e88932'))
  assert.equal(api.buildQuestMapPins([],[quest('route'),accepted]).length,0)
})

test('global map ignores invalid venue coordinates and safely encodes quest links',async()=>{
  const api = await dataFixture()
  const pins = api.buildQuestMapPins([event('event/with spaces'),{...event('bad'),latitude:91}],[quest()])
  assert.equal(pins.length,1)
  assert.equal(pins[0].path,'/global-quests/event%2Fwith%20spaces')
})

test('global XP pins navigate to quest pages, separate overlapping venues and exclude personal routes',async()=>{
  const markers=[], lines=[], effects=[], navigations=[]
  class Element {
    style={}; children=[]; events={}
    append(...nodes){this.children.push(...nodes)}
    setAttribute(){}
    addEventListener(name,callback){this.events[name]=callback}
  }
  class Bounds {extend(){} getCenter(){return {lat:29.65,lng:-82.34}}}
  class Map {fitBounds(){} setCenter(){} setZoom(){}}
  class InfoWindow {setContent(){} open(){} close(){}}
  class Polyline {constructor(options){Object.assign(this,options);lines.push(this)} setMap(map){this.map=map}}
  class Marker {constructor(options){Object.assign(this,options);markers.push(this)}}
  const context=vm.createContext({document:{createElement:()=>new Element()},
    navigator:{geolocation:{getCurrentPosition(_success,failure){failure()}}},
    google:{maps:{LatLngBounds:Bounds,importLibrary:async()=>({AdvancedMarkerElement:Marker})}}})
  const data = await dataFixture(context)
  const synthetic=values=>new vm.SyntheticModule(Object.keys(values),function(){for(const [key,value] of Object.entries(values))this.setExport(key,value)},{context})
  const jsx=(type,props)=>({type,props})
  const module=new vm.SourceTextModule(compile(await readFile(new URL('../src/features/quests/detail/GlobalQuestMap.tsx',import.meta.url),'utf8')),{context})
  await module.link(name=>{
    if(name==='react')return synthetic({useMemo:fn=>fn(),useRef:()=>({current:new Element()}),useState:value=>[value,()=>{}],useEffect:fn=>effects.push(fn)})
    if(name==='react/jsx-runtime')return synthetic({jsx,jsxs:jsx})
    if(name.endsWith('/questMapData'))return synthetic({buildQuestMapPins:data.buildQuestMapPins})
    if(name.endsWith('/googlePlaces'))return synthetic({loadMapsLibrary:async()=>({Map,InfoWindow,Polyline})})
    if(name.endsWith('/navigation'))return synthetic({navigateTo:path=>navigations.push(path)})
    if(name.endsWith('/colors'))return synthetic({colors:{}})
    throw new Error(name)
  });await module.evaluate()
  module.namespace.default({quests:[event('accepted'),event('open')],activeQuests:[quest(),{...quest('saved-event'),sourceGlobalEventId:'accepted'}]})
  const cleanup=effects[0]();await new Promise(resolve=>setImmediate(resolve))
  assert.equal(markers.length,2)
  assert.equal(lines.length,0)
  const sameVenue=markers.filter(marker=>marker.position.lat===29.65)
  assert.notEqual(sameVenue[0].content.style.transform,sameVenue[1].content.style.transform)
  for(const marker of markers)marker.content.children[0].events.click()
  assert.deepEqual(navigations,['/sidequests/saved-event','/global-quests/open'])
  assert.ok(markers.every(marker=>marker.content.children[0].textContent==='Check-in'))
  cleanup();assert.ok(markers.every(marker=>marker.map===null));assert.equal(lines.length,0)
})
