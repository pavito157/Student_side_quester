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
test('feed rejects event coordinates outside valid map bounds',async()=>{
  const f=await fixture(response({
    adminRole:'member',
    organizations:[],
    defaults:{},
    quests:[{
      id:'event',
      title:'Campus event',
      locationName:'Campus',
      latitude:91,
      longitude:-82,
      xpReward:25,
      startsAt:'2026-10-18T00:00:00Z',
      endsAt:'2026-10-18T01:00:00Z',
    }],
  }))
  await assert.rejects(f.api.getGlobalQuests('token'),/Invalid/)
})
test('public event map feed is read without sending an auth token',async()=>{
  const f=await fixture(response([]))
  assert.deepEqual(await f.api.getPublicGlobalQuests(),[])
  assert.equal(f.calls[0][0],'http://localhost:8000/global-quests/public')
  assert.equal(f.calls[0][1].headers.Authorization,undefined)
})

test('single campus event map uses GlobalQuests coordinates and marks current location',async()=>{
  const component=await readFile(new URL('../src/features/quests/detail/GlobalQuestMap.tsx',import.meta.url),'utf8')
  const board=await readFile(new URL('../src/features/quests/detail/GlobalQuests.tsx',import.meta.url),'utf8')
  const activities=await readFile(new URL('../src/features/organization-quests/OrganizationQuestBoard.tsx',import.meta.url),'utf8')
  assert.match(board,/GlobalQuestMap quests=\{mapQuests \?\? \[\]\} activeQuests=\{activeQuests\}/)
  assert.ok(board.indexOf('<GlobalQuestMap quests={mapQuests ?? []} activeQuests={activeQuests} />') > board.indexOf('{currentFeed?.quests.map'))
  assert.equal((board.match(/<GlobalQuestMap/g) ?? []).length,1)
  assert.match(component,/position: \{ lat: quest\.latitude, lng: quest\.longitude \}/)
  assert.match(component,/attendance check-in/)
  assert.match(component,/quest\.locationName/)
  assert.match(component,/navigator\.geolocation\.getCurrentPosition/)
  assert.match(component,/navigateTo\(quest.path\)/)
  assert.doesNotMatch(activities,/OrganizationQuestMap/)
})

async function view(organizations, signedIn=true, activities=null, adminRole='regular_admin', events=[], activeQuests=[]) {
  const file = activities === null ? 'GlobalQuests' : 'OrganizationQuestBoard'
  const path = file === 'GlobalQuests'
    ? `../src/features/quests/detail/${file}.tsx`
    : `../src/features/organization-quests/${file}.tsx`
  const input=await readFile(new URL(path,import.meta.url),'utf8')
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
    if(name.endsWith('/questAssignment'))return synthetic({MAX_ACTIVE_QUESTS:3,getOrganizationQuestBoard:async()=>activities})
    if(name.endsWith('/AdventureDecor'))return synthetic(Object.fromEntries(['PixelBranchIcon','PixelHangingVineIcon','PixelCompassIcon'].map(key=>[key,()=>null])))
    if(name.endsWith('/navigation'))return synthetic({navigateTo:()=>{}})
    if(name.endsWith('/colors'))return synthetic({colors:{}})
    if(name.endsWith('/firebaseSession'))return synthetic({getFirebaseIdToken:async()=> 'token'})
    if(name.endsWith('/OrganizationAdmin'))return synthetic({default:'OrganizationAdmin'})
    if(name.endsWith('/globalQuests'))return synthetic({getGlobalQuests:async()=>({quests:events,organizations,adminRole,defaults:{xpReward:25}}),getPublicGlobalQuests:async()=>[],createGlobalQuest:async()=>{},checkInGlobalQuest:async()=>{}})
    if(name.endsWith('/AdventureDecor'))return synthetic({
      PixelBranchIcon:()=>null, PixelCompassIcon:()=>null, PixelHangingVineIcon:()=>null,
    })
    return synthetic({default:()=>null})
  });await mod.evaluate();const props = activities === null ? {activeQuests,onAcceptGlobalEvent:async()=>{},onAcceptOrganizationQuest:async()=>{}} : {userId:signedIn?'admin':null,activeQuests:[],onAccept:async()=>{}}
  cursor=0;mod.namespace.default(props);effects.forEach(fn=>fn());await new Promise(resolve=>setImmediate(resolve));cursor=0
  return JSON.stringify(mod.namespace.default(props))
}
test('only organization admins see Create event quest',async()=>{
  assert.match(await view([{id:'campus-events',name:'Campus Events'}]),/Create event quest/)
  assert.doesNotMatch(await view([]),/Create event quest/)
  assert.doesNotMatch(await view([],false),/Create event quest/)
})


test('event creation explains attendance check-ins currently have no XP', async () => {
  const tree = await view([{id:'campus-events',name:'Campus Events'}])
  assert.match(tree, /Event check-ins currently award no XP/)
  assert.doesNotMatch(tree, /"name":"xpReward"/)
  assert.match(tree, /Campus quest board/)
  assert.doesNotMatch(tree, /Organization quest board/)
  assert.equal((tree.match(/Refresh board/g) ?? []).length, 1)
})


test('empty organization activity feed stays separate from the single event map', async () => {
  const tree = await view([],true,[])
  assert.match(tree, /No organization activities are published yet/)
  assert.doesNotMatch(tree, /Organization quest map/)
  assert.doesNotMatch(tree, /Organization quest board/)
})

test('published organization activities remain available within the unified board', async () => {
  const activity = {organizationId:'club',organizationName:'Campus Club',questId:'q1',title:'Campus scavenger hunt',summary:'Explore campus',details:'Find something new',timeLabel:'30 minutes'}
  const tree = await view([],true,[activity])
  assert.match(tree,/Campus scavenger hunt/)
  assert.match(tree,/Add to my quests/)
  assert.doesNotMatch(tree,/Organization quest board/)
  assert.doesNotMatch(tree,/Refresh events|Refresh board/)
})


test('only explicit admins get organization management controls', async () => {
  const organizations = [{id:'campus-events',name:'Campus Events'}]
  assert.match(await view(organizations,true,null,'explicit_admin'),/OrganizationAdmin/)
  assert.doesNotMatch(await view(organizations,true,null,'regular_admin'),/OrganizationAdmin/)
  assert.doesNotMatch(await view([],true,null,'member'),/OrganizationAdmin/)
})

test('regular admins are shown only their assigned publishing options', async () => {
  const tree = await view([{id:'my-club',name:'My Club'}],true,null,'regular_admin')
  assert.match(tree,/My Club/)
  assert.match(tree,/assigned organizations/)
  assert.doesNotMatch(tree,/publish under any active organization/)
})

test('organization management requests use authenticated server endpoints without role injection', async () => {
  const create = await fixture(response({id:'club',name:'Club',adminUserIds:[]}))
  await create.api.createOrganization('firebase-token','Club')
  assert.equal(create.calls[0][0],'http://localhost:8000/organizations')
  assert.equal(create.calls[0][1].headers.Authorization,'Bearer firebase-token')
  assert.deepEqual(JSON.parse(create.calls[0][1].body),{name:'Club'})
  const assign = await fixture(response({id:'club',name:'Club',adminUserIds:['user_member']}))
  await assign.api.setOrganizationAdmin('firebase-token','club','user_member','grant')
  assert.equal(assign.calls[0][0],'http://localhost:8000/organizations/club/admins')
  assert.equal(assign.calls[0][1].method,'PUT')
  assert.deepEqual(JSON.parse(assign.calls[0][1].body),{userId:'user_member',action:'grant'})
})


test('events can be added before their start and existing event quests remain viewable at capacity', async () => {
  const event = {id:'gbm', title:'Club GBM', organizationName:'Club', locationName:'Reitz',
    startsAt:'2099-01-01T12:00:00Z',endsAt:'2099-01-01T13:00:00Z',graceMinutes:0,
    verificationMode:'gps',radiusMeters:100,xpReward:25}
  assert.match(await view([],true,null,'member',[event]),/Add to my quests/)
  const active = [{id:'one'},{id:'two'},{id:'three'}]
  const fullBoard = await view([],true,null,'member',[event],active)
  assert.match(fullBoard,/Club GBM/)
  assert.match(fullBoard,/View quest/)
  assert.match(fullBoard,/Maximum quests reached \(3\/3\)/)
  assert.doesNotMatch(fullBoard,/All 3 slots full/)
  assert.match(fullBoard,/"disabled":false,"children":"View quest"/)
  active[0].sourceGlobalEventId='gbm'
  assert.match(await view([],true,null,'member',[event],active),/View quest/)
  assert.match(await view([],true,null,'member',[{...event,completed:true}]),/Check-in recorded ✓/)
})
