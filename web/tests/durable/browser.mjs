// Optional author/QA runner: Node >=22 built-ins only; not needed to use the app.
// Drives the real isolated Chromium application and native file input via CDP.
import {spawn} from 'node:child_process';
import {mkdtemp, readFile, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const browserPath = process.env.AWL_TEST_CHROMIUM;
if (!browserPath) throw Error('Set AWL_TEST_CHROMIUM to an installed isolated Chromium executable.');
const origin=process.env.AWL_TEST_ORIGIN ?? 'http://127.0.0.1:18938';
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) throw Error('Use a dedicated 127.0.0.1 origin.');
const root=resolve(fileURLToPath(new URL('../../..',import.meta.url)));
const tokenFile=process.env.AWL_TEST_TOKEN_FILE,python=process.env.AWL_TEST_PYTHON,dataDir=process.env.AWL_TEST_DATA_DIR;
if(!tokenFile||!python||!dataDir)throw Error('Set isolated installed Python, data and token paths.');
const token=(await readFile(tokenFile,'utf8')).trim();
const env={...process.env};delete env.PYTHONPATH;
let server;
async function startService(){server=spawn(python,['-m','agent_work_ledger','serve','--data-dir',dataDir,'--token-file',tokenFile,'--port',new URL(origin).port],{cwd:tmpdir(),env,stdio:'ignore'});for(let i=0;i<200;i++){if(server.exitCode!==null)throw Error('Owned service exited');try{const r=await fetch(origin+'/v1/health',{headers:{Authorization:'Bearer '+token}});if(r.ok)return}catch{}await new Promise(r=>setTimeout(r,30))}throw Error('Service readiness timeout')}
async function stopService(){if(server&&server.exitCode===null){server.kill('SIGTERM');await new Promise(r=>server.once('exit',r))}}
await startService();
const oracle=await(await fetch(origin+'/v1/snapshot',{headers:{Authorization:'Bearer '+token}})).json();
const eventMap=new Map(oracle.data.events.map(e=>[e.eventId,e])),receiptMap=new Map(oracle.data.receipts.map(r=>[r.eventId,r]));
const output=process.env.AWL_TEST_OUTPUT ?? join(tmpdir(),'awl-dam38-evidence');
const {mkdir}=await import('node:fs/promises');await mkdir(output,{recursive:true});
const profile=await mkdtemp(join(tmpdir(),'awl-dam38-'));
const child=spawn(browserPath,['--headless','--no-sandbox','--disable-gpu','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank']);
let socket, session, serial=0, pending=new Map(), requests=[], scriptErrors=[], report=[],replacement=null;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
try {
 const endpoint=await new Promise((resolve,reject)=>{
  let text='';const timer=setTimeout(()=>reject(Error('No Chromium debug endpoint')),10000);
  child.stderr.on('data',chunk=>{text+=chunk;const found=/DevTools listening on (ws:\/\/[^\s]+)/.exec(text);if(found){clearTimeout(timer);resolve(found[1]);}});
  child.once('error',reject);
 });
 socket=new WebSocket(endpoint);
 await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
 socket.onmessage=event=>{
  const data=JSON.parse(event.data);
  if(data.id){const entry=pending.get(data.id);pending.delete(data.id);if(data.error)entry.reject(Error(JSON.stringify(data.error)));else entry.resolve(data.result);}
  if(data.method==='Fetch.requestPaused'){void command('Fetch.fulfillRequest',{requestId:data.params.requestId,responseCode:replacement?.status??503,responseHeaders:[{name:'Content-Type',value:'application/json'}],body:Buffer.from(replacement?.body??'unavailable').toString('base64')});return}
  if(data.method==='Network.requestWillBeSent') requests.push(data.params.request.url);
  if(data.method==='Runtime.exceptionThrown') scriptErrors.push(data.params.exceptionDetails.text);
 };
 const command=(method,params={},attached=true)=>new Promise((resolve,reject)=>{
  const id=++serial;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params,...(attached?{sessionId:session}:{})}));
 });
 const {targetId}=await command('Target.createTarget',{url:'about:blank'},false);
 ({sessionId:session}=await command('Target.attachToTarget',{targetId,flatten:true},false));
 for(const domain of ['Page','Runtime','DOM','Network'])await command(`${domain}.enable`);
 await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
 const evaluate=async expression=>{
  const result=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
  if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  return result.result.value;
 };
 async function wait(expression){for(let n=0;n<200;n++){if(await evaluate(expression))return;await sleep(25);}throw Error('Timeout: '+expression);}
 const text=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)})?.textContent`);
 const logs=[];
 async function step(name,fn){try{await fn();logs.push('PASS '+name);console.log(logs.at(-1))}catch(e){logs.push('FAIL '+name+': '+e.message);throw e}}
 async function click(selector,area='center'){
  if(!selector.includes('graph-card'))await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center'})`);
  const p=await evaluate(`(()=>{const n=document.querySelector(${JSON.stringify(selector)}),b=n.getBoundingClientRect(),t=${JSON.stringify(area)}==='text'?n.querySelector('.card-title')?.getBoundingClientRect():null;const x=t?t.x+8:${JSON.stringify(area)}==='padding'?b.x+5:b.x+b.width/2,y=t?t.y+8:${JSON.stringify(area)}==='padding'?b.y+5:b.y+b.height/2;return {x,y,hit:n.contains(document.elementFromPoint(x,y))}})()`);
  assert.ok(p.hit,'Physical hit '+selector);
  for(const type of ['mouseMoved','mousePressed','mouseReleased'])await command('Input.dispatchMouseEvent',{type,x:p.x,y:p.y,button:'left',clickCount:1});
 }
 async function key(key){await command('Input.dispatchKeyEvent',{type:'keyDown',key,code:key,windowsVirtualKeyCode:{Enter:13,ArrowLeft:37,ArrowRight:39,ArrowUp:38,ArrowDown:40}[key],...(key==='Enter'?{text:'\r'}:{})});await command('Input.dispatchKeyEvent',{type:'keyUp',key,code:key})}
 async function align(selector){await wait(`[...document.querySelectorAll('.react-flow__node')].some(n=>n.style.transform!=='translate(0px, 0px)')`);await sleep(160);await evaluate(`document.querySelector('.graph-viewport').scrollIntoView({block:'center'});document.querySelector('.graph-viewport').focus({preventScroll:true})`);const d=await evaluate(`(()=>{const n=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(),v=document.querySelector('.graph-viewport').getBoundingClientRect();return{x:Math.round((n.x+n.width/2-v.x-v.width/2)/64),y:Math.round((n.y+n.height/2-v.y-v.height/2)/64)}})()`);for(let i=0;i<Math.abs(d.x);i++)await key(d.x>0?'ArrowRight':'ArrowLeft');for(let i=0;i<Math.abs(d.y);i++)await key(d.y>0?'ArrowDown':'ArrowUp')}
 async function enterToken(value=token){await evaluate(`(()=>{const n=document.querySelector('#ledger-token');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(n,${JSON.stringify(value)});n.dispatchEvent(new Event('input',{bubbles:true}))})()`)}
 async function open(){await command('Page.navigate',{url:origin+'/'});await wait(`document.querySelector('#durable-workspace')!==null`);await click('#durable-workspace');await enterToken();await click('#durable-refresh');await wait(`!document.querySelector('#durable-refresh').disabled`);await wait(`document.querySelector('#startup-status').textContent.startsWith('Fresh')`);await wait(`document.querySelector('#event-count').textContent==='12 events'`);await sleep(250)}
 const transform=()=>evaluate(`document.querySelector('.react-flow__viewport').style.transform`);
 async function exact(id){await wait(`document.querySelector('.source-id')?.textContent===${JSON.stringify(id)}`);const row=await evaluate(`[...document.querySelectorAll('.raw-record pre')].map(n=>JSON.parse(n.textContent))`);assert.deepEqual(row[0],eventMap.get(id));assert.deepEqual(row[1],receiptMap.get(id));assert.equal(row[1].channel,'mcp');return row}
 async function shot(name){const result=await command('Page.captureScreenshot',{format:'png'});await writeFile(join(output,name+'.png'),Buffer.from(result.data,'base64'))}
 try{
 await command('Page.addScriptToEvaluateOnNewDocument',{source:`globalThis.storageWrites=0;for(const k of ['setItem','removeItem','clear']){const f=Storage.prototype[k];Storage.prototype[k]=function(...args){storageWrites++;return f.apply(this,args)}}`});
 await step('ordinary installed D reads actual MCP journey and original receipts',async()=>{await open();assert.equal(await evaluate(`document.querySelectorAll('#durable-project option').length`)>=2,true);assert.equal(await evaluate(`document.querySelectorAll('.graph-card.attempt').length`),2);assert.match(await text('#other-evidence'),/Other evidence/);assert.equal(eventMap.get('qa32:04.qa-v1').data.targetAttemptId,'qa32:v1');assert.equal(eventMap.get('qa32:08.qa-v2').data.targetAttemptId,'qa32:v2');await shot('durable-default')});
 const qa='.graph-card[data-event-id="qa32:04.qa-v1"]';
 for(const width of [1440,1280,777])await step(width+' pointer text/padding and Enter preserve source viewport and focus',async()=>{
  await command('Emulation.setDeviceMetricsOverride',{width,height:1100,deviceScaleFactor:1,mobile:false});await sleep(150);
  for(const area of ['text','padding']){await align(qa);const t=await transform();await click(qa,area);await exact('qa32:04.qa-v1');assert.equal(await transform(),t);await click('.return-button');assert.equal(await evaluate(`document.activeElement===document.querySelector(${JSON.stringify(qa)})`),true);await click('.close-source');assert.equal(await transform(),t)}
  await align(qa);await evaluate(`document.querySelector(${JSON.stringify(qa)}).focus({preventScroll:true})`);const t=await transform();await key('Enter');await exact('qa32:04.qa-v1');assert.equal(await transform(),t);await shot('durable-source-'+width);await click('.close-source');
 });
 await step('registered project selection retains exact independent task',async()=>{await evaluate(`(()=>{const n=document.querySelector('#durable-project');n.value='qa32:project-b';n.dispatchEvent(new Event('change',{bubbles:true}))})()`);await wait(`document.querySelector('#event-count').textContent==='1 event'`);await evaluate(`(()=>{const n=document.querySelector('#durable-project');n.value='qa32:project-a';n.dispatchEvent(new Event('change',{bubbles:true}))})()`);await wait(`document.querySelector('#event-count').textContent==='12 events'`)});
 await step('invalid raw global snapshots and 503 retain prior source and graph',async()=>{await align(qa);await click(qa,'text');await exact('qa32:04.qa-v1');const before=await text('#source-content'),t=await transform();await enterToken('invalid-token');await click('#durable-refresh');await wait(`!document.querySelector('#durable-refresh').disabled`);await wait(`document.querySelector('#startup-status').textContent.startsWith('Stale')`);assert.equal(await text('#source-content'),before);assert.equal(await transform(),t);await enterToken();await command('Fetch.enable',{patterns:[{urlPattern:'*/v1/snapshot',requestStage:'Request'}]});const wrong=structuredClone(oracle);wrong.data.events.find(e=>e.taskId==='qa32:other-task').taskId='unregistered';
  for(const value of [{status:503,body:'unavailable'},{status:200,body:'{'},{status:200,body:JSON.stringify(wrong)}]){replacement=value;await click('#durable-refresh');await wait(`!document.querySelector('#durable-refresh').disabled`);await wait(`document.querySelector('#startup-status').textContent.startsWith('Stale')`);assert.equal(await text('#source-content'),before);assert.equal(await transform(),t);assert.equal(await text('#event-count'),'12 events')}
  await command('Fetch.disable');replacement=null;await click('#durable-refresh');await wait(`!document.querySelector('#durable-refresh').disabled`);await wait(`document.querySelector('#startup-status').textContent.startsWith('Fresh')`);await exact('qa32:04.qa-v1');await click('.close-source')});
 await step('actual dedicated service stop/restart preserves stale source and first receipt',async()=>{await align(qa);await click(qa,'text');await exact('qa32:04.qa-v1');const source=await text('#source-content'),t=await transform();await stopService();await click('#durable-refresh');await wait(`!document.querySelector('#durable-refresh').disabled`);await wait(`document.querySelector('#startup-status').textContent.startsWith('Stale')`);assert.equal(await text('#source-content'),source);assert.equal(await transform(),t);await shot('durable-disconnected');await startService();await click('#durable-refresh');await wait(`!document.querySelector('#durable-refresh').disabled`);await wait(`document.querySelector('#startup-status').textContent.startsWith('Fresh')`);await exact('qa32:04.qa-v1');assert.equal(await transform(),t)});
 await step('reload clears token and refreshed source matches pre-restart oracle',async()=>{await command('Page.reload');await wait(`document.querySelector('#durable-workspace')!==null`);await click('#durable-workspace');assert.equal(await evaluate(`document.querySelector('#ledger-token').value`),'');await enterToken();await click('#durable-refresh');await wait(`!document.querySelector('#durable-refresh').disabled`);await wait(`document.querySelector('#startup-status').textContent.startsWith('Fresh')`);await sleep(250);await align(qa);await click(qa,'text');await exact('qa32:04.qa-v1')});
 await step('actual MCP diagnostic records retain foreign-task sources and cycles',async()=>{
  async function call(tool,args){const path=join(output,'diagnostic.args.json');await writeFile(path,JSON.stringify(args),{mode:0o600});const result=await new Promise((resolve,reject)=>{const p=spawn(python,['-m','agent_work_ledger.report','sdk','--token-file',tokenFile,'--port',new URL(origin).port,'--tool',tool,'--args-file',path],{cwd:tmpdir(),env});let out='',error='';p.stdout.on('data',x=>out+=x);p.stderr.on('data',x=>error+=x);p.on('exit',code=>code===0?resolve(JSON.parse(out)):reject(Error('SDK diagnostic failure '+error)))});assert.equal(result.isError,false)}
  await call('register_project',{projectId:'zz:diagnostics',name:'Synthetic global diagnostics'});
  const reference=JSON.parse(await readFile(join(root,'web/tests/workspace/fixtures/references.json'),'utf8')).events;
  const cycle=JSON.parse((await readFile(join(root,'web/tests/workspace/fixtures/branch-cycle.json'),'utf8')).replaceAll('field:','cycle:')).events;
  for(const [sessionId,taskId] of [['zz:field','field:task'],['zz:foreign','foreign:task'],['zz:cycle','cycle:task']]){await call('register_session',{sessionId,projectId:'zz:diagnostics',taskId,title:'Synthetic diagnostic task'});await call('append_events',{sessionId,envelopeJson:JSON.stringify({formatVersion:1,events:[...reference,...cycle].filter(e=>e.taskId===taskId)})})}
  const actual=await(await fetch(origin+'/v1/snapshot',{headers:{Authorization:'Bearer '+token}})).json();for(const e of actual.data.events)eventMap.set(e.eventId,e);for(const r of actual.data.receipts)receiptMap.set(r.eventId,r);await writeFile(join(output,'diagnostic-snapshot.json'),JSON.stringify(actual));
  await click('.close-source');await click('#durable-refresh');await wait(`!document.querySelector('#durable-refresh').disabled`);await wait(`document.querySelector('#startup-status').textContent.startsWith('Fresh')`);
  await wait(`document.querySelector('#durable-project option[value="zz:diagnostics"]')!==null`);
  await evaluate(`(()=>{const n=document.querySelector('#durable-project');n.value='zz:diagnostics';n.dispatchEvent(new Event('change',{bubbles:true}))})()`);
  await wait(`document.querySelector('#timeline-heading').textContent==='cycle:task'`);await wait(`document.querySelector('#diagnostics').textContent.includes('cycle')`);
  await evaluate(`(()=>{const n=document.querySelector('#durable-session');n.value='zz:field';n.dispatchEvent(new Event('change',{bubbles:true}))})()`);await wait(`document.querySelector('#diagnostics').textContent.includes('cross_task')`);assert.match(await text('#diagnostics'),/missing_reference/);
  await click('#diagnostics [data-evidence-source="r:foreign"]');await exact('r:foreign');await shot('durable-foreign-source');
 });
 await step('memory only credentials and same-origin read-only traffic',async()=>{assert.equal(await evaluate('globalThis.storageWrites'),0);assert.equal(await evaluate('localStorage.length+sessionStorage.length'),0);assert.deepEqual(await evaluate('indexedDB.databases().then(v=>v.map(d=>d.name))'),[]);assert.deepEqual(requests.filter(u=>!u.startsWith(origin+'/')&&!u.startsWith('data:')),[]);assert.ok(requests.every(u=>!u.includes(token)));assert.deepEqual(scriptErrors,[])});
 await writeFile(join(output,'results.txt'),logs.join('\n')+`\nTOTAL ${logs.length} PASS ${logs.length} FAIL 0 SKIP 0\n`);
 }catch(error){await writeFile(join(output,'failure.txt'),logs.join('\n')+'\n'+error.stack);console.error(error.stack);process.exitCode=1}
 await writeFile(join(output,'requests.json'),JSON.stringify(requests,null,2));
}finally{socket?.close();child.kill('SIGTERM');await new Promise(r=>child.once('exit',r));await rm(profile,{recursive:true,force:true});await stopService()}
