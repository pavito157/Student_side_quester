import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
const source=ts.transpileModule(await readFile(new URL('../src/features/quests/preview/GlobalQuestPreviewPage.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2023,jsx:ts.JsxEmit.ReactJSX}}).outputText
async function fixture({active=[],loading=false,slotsError='',signedIn=true}={}) {
  const calls=[],navigations=[],slots=[],effects=[];let cursor=0
  const props={eventId:'event',activeQuests:active,slotsLoading:loading,slotsError,onAccept:async(...args)=>calls.push(args)}
  const context=vm.createContext({Date,AbortController})
  const react={useState(value){const i=cursor++;if(!(i in slots))slots[i]=value;return[slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value}]},
    useRef(value){const i=cursor++;if(!(i in slots))slots[i]={current:value};return slots[i]},
    useEffect(fn,deps=[]){const i=cursor++;if(!(i in slots)||deps.some((d,index)=>d!==slots[i][index])){slots[i]=deps;effects.push(fn)}}}
  const synthetic=values=>new vm.SyntheticModule(Object.keys(values),function(){for(const[k,v]of Object.entries(values))this.setExport(k,v)},{context})
  const jsx=(type,props)=>({type,props:props??{}})
  const module=new vm.SourceTextModule(source,{context})
  await module.link(name=>{
    if(name==='react')return synthetic(react)
    if(name==='react/jsx-runtime')return synthetic({jsx,jsxs:jsx,Fragment:'fragment'})
    if(name==='@clerk/clerk-react')return synthetic({useUser:()=>({user:signedIn?{id:'user'}:null}),SignInButton:'SignInButton'})
    if(name.endsWith('/globalQuests'))return synthetic({getPublicGlobalQuest:async()=>({id:'event',title:'Club meeting',description:'Attend the meeting.',organizationName:'Club',locationName:'Union',latitude:29.65,longitude:-82.34,startsAt:'2099-01-01T12:00:00Z',endsAt:'2099-01-01T13:00:00Z',xpReward:25})})
    if(name.endsWith('/navigation'))return synthetic({navigateTo:path=>navigations.push(path)})
    return synthetic({default:name})
  });await module.evaluate()
  let tree
  const render=()=>{cursor=0;tree=module.namespace.default(props);effects.splice(0).forEach(fn=>fn())}
  render();await new Promise(resolve=>setImmediate(resolve));render()
  function buttons(node,results=[]){if(!node||typeof node!=='object')return results;if(Array.isArray(node)){node.forEach(n=>buttons(n,results));return results}if(node.type==='button')results.push(node.props);buttons(node.props?.children,results);return results}
  return {calls,navigations,buttons:()=>buttons(tree),props,render}
}

test('unaccepted global preview offers acceptance and no complete/generate/abandon actions',async()=>{
  const f=await fixture()
  const buttons=f.buttons()
  assert.equal(buttons.length,2) // Back and Add only.
  const add=buttons.find(button=>button.children==='Add sidequest')
  assert.equal(add.disabled,false)
  add.onClick();await new Promise(resolve=>setImmediate(resolve))
  assert.deepEqual(f.calls,[['user','event']])
})
test('preview disables acceptance at capacity, while loading or when slot state is unavailable',async()=>{
  for(const options of [{active:[{},{},{}]},{loading:true},{slotsError:'Unavailable'}]){
    const f=await fixture(options)
    const add=f.buttons().at(-1)
    assert.equal(add.disabled,true)
    add.onClick();await new Promise(resolve=>setImmediate(resolve));assert.equal(f.calls.length,0)
  }
})
test('an already accepted event preview redirects to the saved quest instead of consuming a second slot',async()=>{
  const f=await fixture({active:[{id:'saved',sourceGlobalEventId:'event'}]})
  assert.deepEqual(f.navigations,['/sidequests/saved'])
  assert.equal(f.calls.length,0)
})
