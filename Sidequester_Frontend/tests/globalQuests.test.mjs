import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
const source = await readFile(new URL('../src/services/globalQuests.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: {module: ts.ModuleKind.ESNext, target:ts.ScriptTarget.ES2023} }).outputText
async function fixture(response, gpsFailure = false) {
  const calls = [], gps = []
  const context = vm.createContext({ fetch:async (...args) => {calls.push(args); return response}, navigator:{geolocation:{
    getCurrentPosition(resolve,reject,options) {gps.push(options); if(gpsFailure) reject(); else resolve({coords:{latitude:29.65,longitude:-82.34,accuracy:8}})},
  }} })
  const mod = new vm.SourceTextModule(compiled,{context,initializeImportMeta(meta){meta.env={VITE_API_BASE_URL:'http://localhost:8000/'}}})
  await mod.link(()=>{throw new Error('Unexpected import')}); await mod.evaluate()
  return {api:mod.namespace,calls,gps}
}
const response = (data,ok=true)=>({ok,json:async()=>data})
test('GPS check-in requests a fresh precise reading and submits coordinates, never XP or UID', async()=>{
  const f=await fixture(response({status:'completed',xpAwarded:25}))
  await f.api.checkInGlobalQuest('id-token',{id:'event/id',verificationMode:'gps'})
  assert.equal(f.gps[0].maximumAge,0); assert.equal(f.gps[0].enableHighAccuracy,true)
  assert.equal(f.calls[0][0],'http://localhost:8000/global-quests/event%2Fid/check-in')
  assert.equal(f.calls[0][1].headers.Authorization,'Bearer id-token')
  assert.deepEqual(JSON.parse(f.calls[0][1].body),{latitude:29.65,longitude:-82.34,accuracy:8})
})
test('denied location never sends a check-in',async()=>{
  const f=await fixture(response({}),true)
  await assert.rejects(f.api.checkInGlobalQuest('token',{id:'event',verificationMode:'gps'}),/location/)
  assert.equal(f.calls.length,0)
})
test('honor policy uses server-configured attendance flow without asking GPS',async()=>{
  const f=await fixture(response({status:'completed',xpAwarded:25}))
  await f.api.checkInGlobalQuest('token',{id:'event',verificationMode:'honor'})
  assert.equal(f.gps.length,0); assert.equal(f.calls[0][1].body,'{}')
})
test('publishing uses authenticated POST with event data and surfaces forbidden response',async()=>{
  const f=await fixture(response({detail:'Organization admin access required.'},false))
  await assert.rejects(f.api.createGlobalQuest('token',{title:'Event'}),/admin access/)
  assert.equal(f.calls[0][1].method,'POST')
  assert.equal(f.calls[0][1].headers.Authorization,'Bearer token')
})
test('feed rejects malformed data rather than rendering incorrect roles',async()=>{
  const f=await fixture(response({quests:[],organizations:'admin',defaults:{}}))
  await assert.rejects(f.api.getGlobalQuests('token'),/Invalid/)
})

async function view(organizations, signedIn=true) {
  const input=await readFile(new URL('../src/componenets/main-ui/GlobalQuests.tsx',import.meta.url),'utf8')
  let cursor=0,slots=[],effects=[]
  const jsx=(type,props)=>({type,props:props??{}})
  const context=vm.createContext({Date,Intl,AbortController,window:{setInterval(){return 1},clearInterval(){}}})
  const react={useState(value){const i=cursor++;if(!(i in slots))slots[i]=typeof value==='function'?value():value;return[slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v}]},
    useRef(value){const i=cursor++;if(!(i in slots))slots[i]={current:value};return slots[i]},
    useEffect(fn,deps){const i=cursor++;if(!(i in slots)){slots[i]=deps;effects.push(fn)}},}
  const synthetic=(values)=>new vm.SyntheticModule(Object.keys(values),function(){for(const[k,v]of Object.entries(values))this.setExport(k,v)},{context})
  const mod=new vm.SourceTextModule(ts.transpileModule(input,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2023,jsx:ts.JsxEmit.ReactJSX}}).outputText,{context})
  await mod.link(name=>{
    if(name==='react')return synthetic(react)
    if(name==='react/jsx-runtime')return synthetic({jsx,jsxs:jsx,Fragment:'fragment'})
    if(name==='@clerk/clerk-react')return synthetic({useUser:()=>({user:signedIn?{id:'admin'}:null}),SignInButton:()=>null})
    if(name.endsWith('/firebaseSession'))return synthetic({getFirebaseIdToken:async()=> 'token'})
    if(name.endsWith('/globalQuests'))return synthetic({getGlobalQuests:async()=>({quests:[],organizations,defaults:{xpReward:25}}),createGlobalQuest:async()=>{},checkInGlobalQuest:async()=>{}})
    return synthetic({default:()=>null})
  });await mod.evaluate();cursor=0;mod.namespace.default();effects.forEach(fn=>fn());await new Promise(resolve=>setImmediate(resolve));cursor=0
  return JSON.stringify(mod.namespace.default())
}
test('only organization admins see Create Global Quest',async()=>{
  assert.match(await view([{id:'campus-events',name:'Campus Events'}]),/Create Global Quest/)
  assert.doesNotMatch(await view([]),/Create Global Quest/)
  assert.doesNotMatch(await view([],false),/Create Global Quest/)
})
