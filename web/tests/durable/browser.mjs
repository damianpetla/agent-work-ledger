// Optional author/QA runner: Node >=22 built-ins only; not needed to use the app.
// Drives the real isolated Chromium application via CDP.
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtemp, readFile, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const browserPath = process.env.AWL_TEST_CHROMIUM;
if (!browserPath) throw Error('Set AWL_TEST_CHROMIUM to an installed isolated Chromium executable.');
const origin=process.env.AWL_TEST_ORIGIN ?? 'http://127.0.0.1:18959';
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) throw Error('Use a dedicated 127.0.0.1 origin.');
const root=resolve(fileURLToPath(new URL('../../..',import.meta.url)));
const python=process.env.AWL_TEST_PYTHON,dataDir=process.env.AWL_TEST_DATA_DIR;
if(!python||!dataDir)throw Error('Set isolated installed Python and data paths.');
const env={...process.env};delete env.PYTHONPATH;
let server;
async function startService(directory=dataDir){server=spawn(python,['-m','agent_work_ledger','serve','--data-dir',directory,'--port',new URL(origin).port],{cwd:tmpdir(),env,stdio:'ignore'});for(let i=0;i<200;i++){if(server.exitCode!==null)throw Error('Owned service exited');try{const r=await fetch(origin+'/v1/health',{});if(r.ok)return}catch{}await new Promise(r=>setTimeout(r,30))}throw Error('Service readiness timeout')}
async function stopService(){if(server&&server.exitCode===null){server.kill('SIGTERM');await new Promise(r=>server.once('exit',r))}}
await startService();
const oracle=await(await fetch(origin+'/v1/snapshot',{})).json();
const eventMap=new Map(oracle.data.events.map(e=>[e.eventId,e])),receiptMap=new Map(oracle.data.receipts.map(r=>[r.eventId,r]));
const output=process.env.AWL_TEST_OUTPUT ?? join(tmpdir(),'awl-dam38-evidence');
const {mkdir}=await import('node:fs/promises');await mkdir(output,{recursive:true});
const profile=await mkdtemp(join(tmpdir(),'awl-dam38-'));
const child=spawn(browserPath,['--headless','--no-sandbox','--disable-gpu','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank']);
let socket, session, serial=0, pending=new Map(), requests=[], credentialHeaders=0, scriptErrors=[], report=[],replacement=null;
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
  if(data.method==='Network.requestWillBeSent'){requests.push(data.params.request.url);credentialHeaders+=Object.keys(data.params.request.headers).filter(k=>['authorization','cookie'].includes(k.toLowerCase())).length;}
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
  assert.ok(p.hit,'Physical hit '+selector+' '+JSON.stringify(p));
  for(const type of ['mouseMoved','mousePressed','mouseReleased'])await command('Input.dispatchMouseEvent',{type,x:p.x,y:p.y,button:'left',clickCount:1});
 }
 async function key(key){await command('Input.dispatchKeyEvent',{type:'keyDown',key,code:key,windowsVirtualKeyCode:{Enter:13,ArrowLeft:37,ArrowRight:39,ArrowUp:38,ArrowDown:40}[key],...(key==='Enter'?{text:'\r'}:{})});await command('Input.dispatchKeyEvent',{type:'keyUp',key,code:key})}
 async function align(selector,area='center'){await wait(`[...document.querySelectorAll('.react-flow__node')].some(n=>n.style.transform!=='translate(0px, 0px)')`);await sleep(160);await evaluate(`document.querySelector('.graph-viewport').scrollIntoView({block:'center'});document.querySelector('.graph-viewport').focus({preventScroll:true})`);const d=await evaluate(`(()=>{const n=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(),v=document.querySelector('.graph-viewport').getBoundingClientRect();return{x:Math.round((n.x+(${JSON.stringify(area)}==='padding'?5:n.width/2)-v.x-v.width/2)/64),y:Math.round((n.y+(${JSON.stringify(area)}==='padding'?5:n.height/2)-v.y-v.height/2)/64)}})()`);for(let i=0;i<Math.abs(d.x);i++)await key(d.x>0?'ArrowRight':'ArrowLeft');for(let i=0;i<Math.abs(d.y);i++)await key(d.y>0?'ArrowDown':'ArrowUp')}
 async function noChooser(){assert.equal(await evaluate(`document.querySelectorAll('header,.workspace-bar,.workspace-notices,#durable-workspace,#diagnostics-menu,#example-workspace,input,[download],#files-workspace,#event-file,#ledger-token,a[href="/"],a[href="/demo"]').length`),0);assert.equal(await evaluate(`document.body.textContent.includes('Fresh durable snapshot')||document.body.textContent.includes('Synthetic Example')`),false)}
 async function open(){const before=requests.filter(u=>u===origin+'/v1/snapshot').length;await command('Page.navigate',{url:origin+'/'});await wait(`document.querySelector('#durable-refresh')!==null`);await wait(`!document.querySelector('#startup-status')`);await wait(`document.querySelector('#event-count').textContent==='12 events'`);await sleep(250);assert.equal(requests.filter(u=>u===origin+'/v1/snapshot').length-before,1,'Exactly one automatic snapshot read');await noChooser();assert.equal(await evaluate(`document.querySelectorAll('input,[download],#files-workspace,#event-file,#ledger-token').length`),0)}
 const transform=()=>evaluate(`document.querySelector('.react-flow__viewport').style.transform`);
 async function exact(id){await wait(`document.querySelector('.source-id')?.textContent===${JSON.stringify(id)}`);const row=await evaluate(`[...document.querySelectorAll('.raw-record pre')].map(n=>JSON.parse(n.textContent))`);assert.deepEqual(row[0],eventMap.get(id));assert.deepEqual(row[1],receiptMap.get(id));assert.equal(row[1].channel,'mcp');return row}
 async function shot(name){const result=await command('Page.captureScreenshot',{format:'png'});await writeFile(join(output,name+'.png'),Buffer.from(result.data,'base64'))}
 async function waitForParentEdge(eventId,taskId){
  // Refresh completion marks accepted data; ReactFlow measures/publishes new edges separately.
  const result=await evaluate(`new Promise(resolve=>{
   const started=performance.now();let previous=null,consecutive=0,frames=0,frame,done=false;
   const edgeIds=()=>[...document.querySelectorAll('[data-edge-id]')].map(node=>node.dataset.edgeId);
   const initialEdges=edgeIds();
   function finish(ok,edgeId=null){if(done)return;done=true;clearTimeout(deadline);cancelAnimationFrame(frame);resolve({ok,edgeId,frames,elapsedMs:performance.now()-started,initialEdges,finalEdges:edgeIds()})}
   const deadline=setTimeout(()=>finish(false),5000);
   function observe(){frames++;const id=edgeIds().find(value=>{try{const tuple=JSON.parse(value);return tuple[1]===${JSON.stringify(eventId)}&&tuple[2]==='parent-run'}catch{return false}});consecutive=id&&id===previous?consecutive+1:id?1:0;previous=id;if(consecutive>=2)finish(true,id);else frame=requestAnimationFrame(observe)}
   frame=requestAnimationFrame(observe);
  })`);
  if(!result.ok){
   result.currentTask=await text('#timeline-heading');
   try{const raw=new Uint8Array(await(await fetch(origin+'/v1/snapshot',{signal:AbortSignal.timeout(2000)})).arrayBuffer());const {acceptDurableSnapshot}=await import('../../import/durable.js'),{projectTask}=await import('../../graph/project.js');const accepted=acceptDurableSnapshot(raw);result.projectedParentEdges=accepted.ok?projectTask(accepted.snapshot,taskId).edges.filter(edge=>edge.kind==='parent-run'&&edge.sourceEventIds.includes(eventId)):[];result.snapshotAccepted=accepted.ok}catch{result.snapshotUnavailable=true}
  }
  await writeFile(join(output,'edge-readiness.json'),JSON.stringify({eventId,taskId,...result},null,2));
  assert.equal(result.ok,true,'Expected parent-run edge did not settle within 5 seconds; see edge-readiness.json');
  return result.edgeId;
 }
 async function refreshInspectionRegression(){
  await open();
  let number=1;while(oracle.data.projects.some(p=>p.projectId===`refresh${number}:project`))number++;
  const prefix=`refresh${number}`,runId=prefix+':run',taskId=prefix+':task',sessionId=prefix+':session';
  async function call(tool,args){const path=join(output,'refresh.args.json');await writeFile(path,JSON.stringify(args),{mode:0o600});const result=await new Promise((resolve,reject)=>{const child=spawn(python,['-m','agent_work_ledger.report','sdk','--port',new URL(origin).port,'--tool',tool,'--args-file',path],{cwd:tmpdir(),env});let out='';child.stdout.on('data',x=>out+=x);child.on('exit',code=>code===0?resolve(JSON.parse(out)):reject(Error('SDK append failed')))});assert.equal(result.isError,false)}
  async function refresh(){await click('#durable-refresh');await wait(`!document.querySelector('#durable-refresh').disabled`);await wait(`!document.querySelector('#startup-status')`)}
  const first={eventId:prefix+':e1',taskId,actorId:prefix+':reporter',actorLabel:'Initial reporter',roleLabel:null,runId,attemptId:prefix+':attempt',kind:'assignment',occurredAt:null,source:{producerId:prefix+':producer',label:'Synthetic refresh regression',synthetic:true},data:{fromActorId:prefix+':sender',toActorId:prefix+':worker-a',parentRunId:null}};
  const second={...first,eventId:prefix+':e2',actorLabel:'Second reporter label',data:{...first.data,toActorId:prefix+':worker-b'}};
  await call('register_project',{projectId:prefix+':project',name:'Synthetic refresh regression'});
  await call('register_session',{sessionId,projectId:prefix+':project',taskId,title:'Open inspector update'});
  await call('append_events',{sessionId,envelopeJson:JSON.stringify({formatVersion:1,events:[first]})});await refresh();
  await evaluate(`(()=>{const n=document.querySelector('#durable-project');n.value=${JSON.stringify(prefix+':project')};n.dispatchEvent(new Event('change',{bubbles:true}))})()`);await wait(`document.querySelector('#event-count').textContent==='1 event'`);
  const selector='.graph-card[data-node-id='+JSON.stringify(JSON.stringify(['run',runId]))+']';await align(selector);await click(selector,'padding');
  const before=await evaluate(`JSON.parse(document.querySelector('.projection-detail pre').textContent)`);assert.equal(before.facts.bindingStatus,'consistent');assert.equal(before.sourceEventIds.length,1);
  await click('[data-inspector-source="'+first.eventId+'"]');await wait(`document.querySelector('.source-id').textContent===${JSON.stringify(first.eventId)}`);
  const original=await evaluate(`[...document.querySelectorAll('.raw-record pre')].map(n=>JSON.parse(n.textContent))`),viewport=await transform();
  await call('append_events',{sessionId,envelopeJson:JSON.stringify({formatVersion:1,events:[second]})});await refresh();
  const after=await evaluate(`JSON.parse(document.querySelector('.projection-detail pre').textContent)`);
  await writeFile(join(output,'open-inspector-refresh.json'),JSON.stringify({before,after,original},null,2));
  assert.equal(after.facts.bindingStatus,'ambiguous','Refreshed inspector must adopt the newly ambiguous run binding');
  assert.deepEqual(after.facts.assignedActorIds,[prefix+':worker-a',prefix+':worker-b']);
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('[data-inspector-source]')].map(n=>n.dataset.inspectorSource)`),[first.eventId,second.eventId]);
  assert.match(await text('#diagnostics'),/conflicting_binding/);assert.deepEqual(await evaluate(`[...document.querySelectorAll('.raw-record pre')].map(n=>JSON.parse(n.textContent))`),original);
  assert.equal(await transform(),viewport,'Refresh retains the open entity viewport');
  await click('[data-inspector-source="'+second.eventId+'"]');await wait(`document.querySelector('.source-id').textContent===${JSON.stringify(second.eventId)}`);const current=await(await fetch(origin+'/v1/snapshot',{})).json();eventMap.set(second.eventId,second);receiptMap.set(second.eventId,current.data.receipts.find(r=>r.eventId===second.eventId));await exact(second.eventId);
  await click('.return-button');assert.equal(await evaluate(`document.activeElement===document.querySelector(${JSON.stringify(selector)})`),true,'Nested source Return keeps the entity invoker');await click('.close-source');assert.equal(await transform(),viewport);
  // The same node identity resolution applies to actors and attempts, not just runs.
  for(const [kind,id,next] of [['actor',first.actorId,{...second,eventId:prefix+':e3',actorLabel:'Third reporter label'}],['attempt',first.attemptId,{...second,eventId:prefix+':e4'}]]){
   const target='.graph-card[data-node-id='+JSON.stringify(JSON.stringify([kind,id]))+']';await evaluate(`document.querySelector(${JSON.stringify(target)}).focus({preventScroll:true})`);await key('Enter');await wait(`JSON.parse(document.querySelector('.projection-detail pre').textContent).kind===${JSON.stringify(kind)}`);
   const beforeCount=await evaluate(`document.querySelectorAll('[data-inspector-source]').length`);
   await call('append_events',{sessionId,envelopeJson:JSON.stringify({formatVersion:1,events:[next]})});await refresh();
   assert.equal(await evaluate(`document.querySelectorAll('[data-inspector-source]').length`),beforeCount+1);
   const facts=await evaluate(`JSON.parse(document.querySelector('.projection-detail pre').textContent)`);assert.equal(facts.kind,kind);assert.ok(facts.sourceEventIds.includes(next.eventId));if(kind==='actor')assert.ok(facts.facts.labels.some(label=>label.actorLabel==='Third reporter label'));
   await click('.close-source');
  }
  // A now-resolved parent relation changes identity; invalidate its obsolete edge panel.
  const child={...first,eventId:prefix+':child',runId:prefix+':child-run',attemptId:prefix+':child-attempt',data:{...first.data,parentRunId:prefix+':parent-run'}};
  await call('append_events',{sessionId,envelopeJson:JSON.stringify({formatVersion:1,events:[child]})});await refresh();
  const edgeId=await waitForParentEdge(child.eventId,taskId);assert.ok(edgeId);
  await evaluate(`document.querySelector('[data-edge-id='+CSS.escape(${JSON.stringify(edgeId)})+']').focus({preventScroll:true})`);await key('Enter');await wait(`document.querySelector('.projection-detail')!==null`);
  const parent={...first,eventId:prefix+':parent',runId:prefix+':parent-run',attemptId:prefix+':parent-attempt'};
  await call('append_events',{sessionId,envelopeJson:JSON.stringify({formatVersion:1,events:[parent]})});await refresh();await wait(`document.querySelector('.source-panel')===null`);
 }
 try{
 await command('Page.addScriptToEvaluateOnNewDocument',{source:`globalThis.storageWrites=0;for(const k of ['setItem','removeItem','clear']){const f=Storage.prototype[k];Storage.prototype[k]=function(...args){storageWrites++;return f.apply(this,args)}}`});
 if(process.env.AWL_TEST_REFRESH_ONLY){await step('real MCP append refreshes open entity facts and every source',refreshInspectionRegression)}else{
 await step('ordinary installed D reads actual MCP journey and original receipts',async()=>{await open();assert.equal(await evaluate(`document.querySelectorAll('#durable-project option').length`)>=2,true);assert.equal(await evaluate(`document.querySelectorAll('.graph-card.attempt').length`),2);assert.match(await text('#other-evidence'),/Other evidence/);assert.equal(eventMap.get('qa32:04.qa-v1').data.targetAttemptId,'qa32:v1');assert.equal(eventMap.get('qa32:08.qa-v2').data.targetAttemptId,'qa32:v2');await shot('durable-default')});
 const qa='.graph-card[data-event-id="qa32:04.qa-v1"]';
 for(const width of [1440,1280,777])await step(width+' pointer text/padding and Enter preserve source viewport and focus',async()=>{
  await command('Emulation.setDeviceMetricsOverride',{width,height:1100,deviceScaleFactor:1,mobile:false});await sleep(150);
  for(const area of ['text','padding']){await align(qa);const t=await transform();await click(qa,area);await exact('qa32:04.qa-v1');assert.equal(await transform(),t);await click('.return-button');assert.equal(await evaluate(`document.activeElement===document.querySelector(${JSON.stringify(qa)})`),true);await click('.close-source');assert.equal(await transform(),t)}
  await align(qa);await click('.zoom button');await sleep(150);await align(qa);const zoomed=await transform();await click(qa,'text');await exact('qa32:04.qa-v1');assert.equal(await transform(),zoomed);await click('.close-source');
  const box=await evaluate(`document.querySelector('.graph-viewport').getBoundingClientRect().toJSON()`),beforePan=await transform();for(const point of [{type:'mousePressed',x:box.x+20,y:box.bottom-8,button:'left',clickCount:1},{type:'mouseMoved',x:box.x+44,y:box.bottom-8,button:'left',buttons:1},{type:'mouseReleased',x:box.x+44,y:box.bottom-8,button:'left',clickCount:1}])await command('Input.dispatchMouseEvent',point);await sleep(160);assert.notEqual(await transform(),beforePan);
  await align(qa);await evaluate(`document.querySelector(${JSON.stringify(qa)}).focus({preventScroll:true})`);const t=await transform();await key('Enter');await exact('qa32:04.qa-v1');assert.equal(await transform(),t);await shot('durable-source-'+width);await click('.close-source');
 });
 await step('registered project selection retains exact independent task',async()=>{await evaluate(`(()=>{const n=document.querySelector('#durable-project');n.value='qa32:project-b';n.dispatchEvent(new Event('change',{bubbles:true}))})()`);await wait(`document.querySelector('#event-count').textContent==='1 event'`);await evaluate(`(()=>{const n=document.querySelector('#durable-project');n.value='qa32:project-a';n.dispatchEvent(new Event('change',{bubbles:true}))})()`);await wait(`document.querySelector('#event-count').textContent==='12 events'`)});
 await step('invalid raw global snapshots and 503 retain prior source and graph',async()=>{await align(qa);await click(qa,'text');await exact('qa32:04.qa-v1');const before=await text('#source-content'),t=await transform();await command('Fetch.enable',{patterns:[{urlPattern:'*/v1/snapshot',requestStage:'Request'}]});const wrong=structuredClone(oracle);wrong.data.events.find(e=>e.taskId==='qa32:other-task').taskId='unregistered';
  for(const value of [{status:503,body:'unavailable'},{status:200,body:'{'},{status:200,body:JSON.stringify(wrong)}]){replacement=value;await click('#durable-refresh');await wait(`!document.querySelector('#durable-refresh').disabled`);await wait(`document.querySelector('#startup-status').textContent.startsWith('Stale')`);assert.equal(await text('#source-content'),before);assert.equal(await transform(),t);assert.equal(await text('#event-count'),'12 events')}
  await command('Fetch.disable');replacement=null;await click('#durable-refresh');await wait(`!document.querySelector('#durable-refresh').disabled`);await wait(`!document.querySelector('#startup-status')`);await exact('qa32:04.qa-v1');await click('.close-source')});
 await step('actual dedicated service stop/restart preserves stale source and first receipt',async()=>{await align(qa);await click(qa,'text');await exact('qa32:04.qa-v1');const source=await text('#source-content'),t=await transform();await stopService();await click('#durable-refresh');await wait(`!document.querySelector('#durable-refresh').disabled`);await wait(`document.querySelector('#startup-status').textContent.startsWith('Stale')`);assert.equal(await text('#source-content'),source);assert.equal(await transform(),t);await shot('durable-disconnected');await startService();await click('#durable-refresh');await wait(`!document.querySelector('#durable-refresh').disabled`);await wait(`!document.querySelector('#startup-status')`);await exact('qa32:04.qa-v1');assert.equal(await transform(),t)});
 await step('reload automatically reads once with no login and preserves original source',async()=>{const before=requests.filter(u=>u===origin+'/v1/snapshot').length;await command('Page.reload');await wait(`document.querySelector('#durable-refresh')&&!document.querySelector('#startup-status')`);await wait(`document.querySelector('#event-count').textContent==='12 events'`);await sleep(250);assert.equal(requests.filter(u=>u===origin+'/v1/snapshot').length-before,1);assert.equal(await evaluate(`document.querySelectorAll('input').length`),0);await align(qa);await click(qa,'text');await exact('qa32:04.qa-v1')});
 await step('direct demo and reload show exact ten synthetic events with zero durable traffic or database changes',async()=>{
  const before=await(await fetch(origin+'/v1/snapshot')).json(),hash=()=>readFile(join(dataDir,'ledger.sqlite3')).then(bytes=>createHash('sha256').update(bytes).digest('hex')),beforeHash=await hash(),start=requests.length;
  const demoEvents=JSON.parse(await readFile(join(root,'web/examples/synthetic-workflow.json'),'utf8')).events;
  async function demoReady(){await wait(`document.querySelector('#event-count')?.textContent==='10 events'&&!document.querySelector('#startup-status')`);await noChooser();assert.equal(await evaluate(`document.querySelectorAll('#durable-refresh,#durable-project,#durable-session,.task-panel').length`),0);assert.deepEqual(await evaluate(`[...document.querySelectorAll('.source-button')].map(n=>n.dataset.eventId).sort()`),demoEvents.map(e=>e.eventId).sort())}
  async function demoSource(){const selector='.graph-card[data-event-id="example:04.qa-v1"]';await align(selector);const viewport=await transform();await click(selector,'text');await wait(`document.querySelector('.source-id')?.textContent==='example:04.qa-v1'`);const rows=await evaluate(`[...document.querySelectorAll('.raw-record pre')].map(n=>JSON.parse(n.textContent))`);assert.deepEqual(rows[0],demoEvents.find(e=>e.eventId==='example:04.qa-v1'));assert.equal(rows[1].channel,'file');assert.equal(rows[1].eventId,rows[0].eventId);assert.equal(await transform(),viewport);await click('.return-button');assert.equal(await evaluate(`document.activeElement===document.querySelector(${JSON.stringify(selector)})`),true);await click('.close-source')}
  await command('Page.navigate',{url:origin+'/demo'});await demoReady();await demoSource();await shot('direct-demo');await command('Page.reload');await demoReady();await demoSource();
  const pageRequests=requests.slice(start);assert.deepEqual(pageRequests.filter(u=>new URL(u).pathname.startsWith('/v1/')||new URL(u).pathname==='/mcp'),[]);
  assert.deepEqual(await(await fetch(origin+'/v1/snapshot')).json(),before);const afterHash=await hash();assert.equal(afterHash,beforeHash);
  await writeFile(join(output,'demo-isolation.json'),JSON.stringify({beforeHash,afterHash,pageRequests,eventIds:demoEvents.map(e=>e.eventId),snapshotUnchanged:true},null,2));
  await open();await align(qa);await click(qa,'text');await exact('qa32:04.qa-v1');
 });
 await step('demo fetch and parse failures stay explicit without durable fallback',async()=>{
  const before=await(await fetch(origin+'/v1/snapshot')).json(),start=requests.length;
  await command('Fetch.enable',{patterns:[{urlPattern:'*/examples/synthetic-workflow.json',requestStage:'Request'}]});
  for(const value of [{status:503,body:'unavailable'},{status:200,body:'{'}]){replacement=value;await command('Page.navigate',{url:origin+'/demo'});await wait(`document.querySelector('#startup-status')?.textContent==='Demo unavailable. Reload /demo to retry.'`);assert.equal(await text('#event-count'),'0 events');assert.equal(await evaluate(`document.querySelectorAll('.graph-card,#durable-refresh,#durable-project').length`),0);await noChooser()}
  assert.deepEqual(requests.slice(start).filter(u=>new URL(u).pathname.startsWith('/v1/')||new URL(u).pathname==='/mcp'),[]);assert.deepEqual(await(await fetch(origin+'/v1/snapshot')).json(),before);
  await shot('demo-unavailable');await command('Fetch.disable');replacement=null;await open();await align(qa);await click(qa,'text');await exact('qa32:04.qa-v1');
 });
 await step('actual MCP diagnostic records retain foreign-task sources and cycles',async()=>{
  async function call(tool,args){const path=join(output,'diagnostic.args.json');await writeFile(path,JSON.stringify(args),{mode:0o600});const result=await new Promise((resolve,reject)=>{const p=spawn(python,['-m','agent_work_ledger.report','sdk','--port',new URL(origin).port,'--tool',tool,'--args-file',path],{cwd:tmpdir(),env});let out='',error='';p.stdout.on('data',x=>out+=x);p.stderr.on('data',x=>error+=x);p.on('exit',code=>code===0?resolve(JSON.parse(out)):reject(Error('SDK diagnostic failure '+error)))});assert.equal(result.isError,false)}
  await call('register_project',{projectId:'zz:diagnostics',name:'Synthetic global diagnostics'});
  const reference=JSON.parse(await readFile(join(root,'web/tests/workspace/fixtures/references.json'),'utf8')).events;
  const long=JSON.parse(await readFile(join(root,'web/tests/workspace/fixtures/long.json'),'utf8')).events.map(event=>({...event,taskId:'long:task'}));
  const cycle=JSON.parse((await readFile(join(root,'web/tests/workspace/fixtures/branch-cycle.json'),'utf8')).replaceAll('field:','cycle:')).events;
  for(const [sessionId,taskId] of [['zz:field','field:task'],['zz:foreign','foreign:task'],['zz:cycle','cycle:task'],['zz:long','long:task']]){await call('register_session',{sessionId,projectId:'zz:diagnostics',taskId,title:taskId==='long:task'?'Long literal metadata':'Synthetic diagnostic task'});await call('append_events',{sessionId,envelopeJson:JSON.stringify({formatVersion:1,events:[...reference,...cycle,...long].filter(e=>e.taskId===taskId)})})}
  const actual=await(await fetch(origin+'/v1/snapshot',{})).json();for(const e of actual.data.events)eventMap.set(e.eventId,e);for(const r of actual.data.receipts)receiptMap.set(r.eventId,r);await writeFile(join(output,'diagnostic-snapshot.json'),JSON.stringify(actual));
  await click('.close-source');await click('#durable-refresh');await wait(`!document.querySelector('#durable-refresh').disabled`);await wait(`!document.querySelector('#startup-status')`);
  await wait(`document.querySelector('#durable-project option[value="zz:diagnostics"]')!==null`);
  await evaluate(`(()=>{const n=document.querySelector('#durable-project');n.value='zz:diagnostics';n.dispatchEvent(new Event('change',{bubbles:true}))})()`);
  await wait(`document.querySelector('#durable-session').value==='zz:cycle'`);await wait(`document.querySelector('#diagnostics').textContent.includes('cycle')`);
  await evaluate(`(()=>{const n=document.querySelector('#durable-session');n.value='zz:field';n.dispatchEvent(new Event('change',{bubbles:true}))})()`);await wait(`document.querySelector('#diagnostics').textContent.includes('cross_task')`);assert.match(await text('#diagnostics'),/missing_reference/);
  await click('#diagnostics [data-evidence-source="r:foreign"]');await exact('r:foreign');await shot('durable-foreign-source');
 });
 await step('long literal metadata and 200 percent graph text remain inspectable',async()=>{await click('.close-source');await evaluate(`(()=>{const n=document.querySelector('#durable-session');n.value='zz:long';n.dispatchEvent(new Event('change',{bubbles:true}))})()`);await wait(`document.querySelector('.graph-card[data-event-id="long:check"]')!==null`);await evaluate(`document.documentElement.style.setProperty('--graph-text','2')`);await sleep(300);const overflow=await evaluate(`[...document.querySelectorAll('.graph-card')].filter(n=>n.scrollHeight>n.clientHeight+1||n.scrollWidth>n.clientWidth+1).map(n=>n.dataset.nodeId)`);assert.deepEqual(overflow,[]);const selector='.graph-card[data-event-id="long:check"]';await align(selector,'padding');const before=await transform();await click(selector,'padding');const row=await exact('long:check');assert.equal(row[0].data.summary.length,500);assert.equal(await transform(),before);await shot('long200-source');await click('.close-source');await evaluate(`document.documentElement.style.removeProperty('--graph-text')`)});
 await step('no browser persistence and same-origin read-only traffic',async()=>{assert.equal(await evaluate('globalThis.storageWrites'),0);assert.equal(await evaluate('localStorage.length+sessionStorage.length'),0);assert.deepEqual(await evaluate('indexedDB.databases().then(v=>v.map(d=>d.name))'),[]);assert.deepEqual(requests.filter(u=>!u.startsWith(origin+'/')&&!u.startsWith('data:')),[]);assert.deepEqual(scriptErrors,[]);assert.equal(credentialHeaders,0);assert.equal(await evaluate('document.cookie'),'')});
 await step('real MCP append refreshes open entity facts and every source',refreshInspectionRegression);
 await step('real empty ledger loads once without synthetic fallback',async()=>{await stopService();await startService(join(profile,'empty-ledger'));const before=requests.filter(u=>u===origin+'/v1/snapshot').length;await command('Page.navigate',{url:origin+'/'});await wait(`document.querySelector('#durable-refresh')&&!document.querySelector('#startup-status')`);await sleep(200);assert.equal(await text('#event-count'),'0 events');assert.equal(await evaluate(`document.querySelectorAll('#durable-project option,.graph-card,input').length`),0);await noChooser();assert.equal(requests.filter(u=>u===origin+'/v1/snapshot').length-before,1);await shot('empty-ledger')});
 }
 await writeFile(join(output,'results.txt'),logs.join('\n')+`\nTOTAL ${logs.length} PASS ${logs.length} FAIL 0 SKIP 0\n`);
 }catch(error){await writeFile(join(output,'failure.txt'),logs.join('\n')+'\n'+error.stack);console.error(error.stack);process.exitCode=1}
 await writeFile(join(output,'requests.json'),JSON.stringify(requests,null,2));
}finally{socket?.close();child.kill('SIGTERM');await new Promise(r=>child.once('exit',r));await rm(profile,{recursive:true,force:true});await stopService()}
