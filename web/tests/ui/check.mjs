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
const origin=process.env.AWL_TEST_ORIGIN ?? 'http://127.0.0.1:8774';
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) throw Error('Use a dedicated 127.0.0.1 origin.');
const root=resolve(fileURLToPath(new URL('../../..',import.meta.url)));
const output=process.env.AWL_TEST_OUTPUT ?? join(tmpdir(),'awl-dam34-evidence');
const {mkdir}=await import('node:fs/promises');await mkdir(output,{recursive:true});
const profile=await mkdtemp(join(tmpdir(),'awl-dam34-'));
const child=spawn(browserPath,['--headless','--no-sandbox','--disable-gpu','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank']);
let socket, session, serial=0, pending=new Map(), requests=[], scriptErrors=[], report=[];
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
 async function open(path='/'){await command('Page.bringToFront');await command('Page.navigate',{url:origin+path});await wait('document.readyState === "complete"');if(path==='/'){await wait('document.querySelector("#files-workspace")!==null');await evaluate('document.querySelector("#files-workspace").click()');await wait('document.querySelector("#event-count")?.textContent === "0 events"');}}
 async function selectFile(path){
  const {root}=await command('DOM.getDocument');const {nodeId}=await command('DOM.querySelector',{nodeId:root.nodeId,selector:'#event-file'});
  await command('DOM.setFileInputFiles',{nodeId,files:[path]});
  await wait('!document.querySelector("#event-file").disabled && !document.querySelector("#import-status").textContent.startsWith("Reading")');
  // Deliberate D seam: timeline is an alternate disclosure; inspection starts closed.
  await evaluate('document.querySelector("#all-records").open=true;if(!document.querySelector(".source-panel")&&document.querySelector("#import-status").textContent.startsWith("Import complete"))document.querySelector(".source-button")?.click()');
 }
 const example=join(root,'web/examples/synthetic-timeline.json');
 const fixture=name=>join(root,'web/tests/import',name);
 const makeEvent=(eventId,occurredAt=null)=>({
  eventId,taskId:'boundary:task',actorId:'boundary:actor',actorLabel:'Boundary actor',roleLabel:null,
  runId:null,attemptId:null,kind:'consultation',occurredAt,
  source:{producerId:'boundary:producer',label:'Synthetic UI boundary fixture',synthetic:true},
  data:{toActorId:'boundary:recipient',question:'Boundary smoke check'}
 });
 async function step(name,run){try{await run();report.push('PASS '+name);}catch(error){report.push('FAIL '+name+': '+error.message);throw error;}}
 await open();
 await step('empty workspace and visible reconstruction instructions',async()=>{
  assert.match(await text('.memory-note'),/reloading or closing clears/);assert.match(await text('#empty-state'),/Start with the source/);
  assert.equal(await evaluate('document.querySelectorAll(".event-card").length'),0);
  assert.equal(await evaluate('document.querySelector("#file-help a").getAttribute("href")'),'examples/synthetic-timeline.json');
 });
 await step('ordinary file selection displays sorted multitask reports and separate times',async()=>{
  await selectFile(example);assert.match(await text('#import-status'),/6 new, 0 duplicate/);
  assert.equal(await evaluate('document.querySelectorAll(".task-button").length'),2);
  assert.deepEqual(await evaluate('[...document.querySelectorAll(".source-button")].map(button=>button.dataset.eventId)'),['demo:01','demo:02','demo:03','demo:04','demo:05']);
  assert.match(await text('#timeline'),/demo:coordinator → demo:builder/);assert.match(await text('#timeline'),/Consultation does not transfer responsibility/);assert.match(await text('#timeline'),/Waiting for an example input specification/);
  assert.match(await text('#timeline'),/Occurred · unknown/);assert.match(await text('#timeline'),/Imported · \d{4}-\d\d-\d\d/);
  assert.match(await text('#source-content'),/Producer declaration/);assert.match(await text('#source-content'),/Yes · synthetic example/);assert.match(await text('#source-content'),/Ledger receipt/);
 });
 await step('keyboard source activation focuses inspector and returns to event',async()=>{
  await wait('document.activeElement.id === "source-title"');
  await evaluate('document.querySelectorAll(".source-button")[1].focus()');
  await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
  await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
  assert.equal(await evaluate('document.activeElement.dataset.eventId'),'demo:03');
  await command('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r',unmodifiedText:'\r'});
  await command('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  await wait('document.activeElement.id === "source-title"');
  assert.equal(await evaluate('document.activeElement.id'),'source-title',JSON.stringify({active:await evaluate('document.activeElement.outerHTML'),source:await text('.source-id'),errors:scriptErrors}));
  assert.match(await text('#source-content'),/example-model/);assert.match(await text('#source-content'),/unknown · No reported tool verification basis/);
  const raw=await text('.raw-record pre');assert.equal(JSON.parse(raw).eventId,'demo:03');assert.equal(JSON.parse(raw).data.verified.model,null);
  await evaluate('document.querySelector(".return-button").click()');assert.equal(await evaluate('document.activeElement.dataset.eventId'),'demo:03');
 });
 await step('reselecting identical file deduplicates and preserves original receipt',async()=>{
  const before=await text('#source-content');await selectFile(example);assert.match(await text('#import-status'),/0 new, 6 duplicate/);assert.equal(await text('#source-content'),before);
 });
 await step('malformed, conflict and invalid UTF-8 inputs preserve selected history',async()=>{
  const before=await text('#timeline'), source=await text('#source-content');
  const invalid=join(profile,'invalid-utf8.json');await writeFile(invalid,Buffer.from([0xc3,0x28]));
  for(const [path,code] of [[fixture('malformed.json'),'invalid_json'],[fixture('conflict.json'),'event_id_conflict'],[invalid,'invalid_utf8']]){
   await selectFile(path);assert.match(await text('#import-error'),new RegExp(code));assert.match(await text('#import-error'),/previous workspace is unchanged/);assert.equal(await text('#timeline'),before);assert.equal(await text('#source-content'),source);
  }
 });
 await step('exact 1 MiB file accepts 1000 events in contract order and rejects invalid boundaries atomically',async()=>{
  const events=Array.from({length:1000},(_,index)=>makeEvent(`limit:${String(999-index).padStart(4,'0')}`));
  const compact=JSON.stringify({formatVersion:1,events});
  assert.ok(Buffer.byteLength(compact,'utf8')<1048576,'1000-event fixture must fit before whitespace padding');
  const maximum=compact+' '.repeat(1048576-Buffer.byteLength(compact,'utf8'));
  assert.equal(Buffer.byteLength(maximum,'utf8'),1048576);
  const accepted=join(profile,'exact-1mib-1000-events.json');await writeFile(accepted,maximum);
  await selectFile(accepted);
  await evaluate('[...document.querySelectorAll(".task-button")].find(button=>button.dataset.taskId==="boundary:task").click()');
  const expectedIds=Array.from({length:1000},(_,index)=>`limit:${String(index).padStart(4,'0')}`);
  assert.match(await text('#import-status'),/1000 new, 0 duplicate/);
  assert.equal(await text('#event-count'),'1000 events');
  assert.deepEqual(await evaluate('[...document.querySelectorAll(".source-button")].map(button=>button.dataset.eventId)'),expectedIds);

  const priorTimeline=await text('#timeline'),priorSource=await text('#source-content');
  const tooMany=join(profile,'1001-events.json');
  await writeFile(tooMany,JSON.stringify({formatVersion:1,events:Array.from({length:1001},(_,index)=>makeEvent(`too-many:${String(index).padStart(4,'0')}`))}));
  await selectFile(tooMany);
  assert.match(await text('#import-error'),/event_limit/);assert.match(await text('#import-error'),/previous workspace is unchanged/);
  assert.equal(await text('#timeline'),priorTimeline);assert.equal(await text('#source-content'),priorSource);

  const oversize=join(profile,'one-byte-over-limit.json');
  const oversizeJson=JSON.stringify({formatVersion:1,events:[makeEvent('oversize:one')]});
  const oversizeContent=oversizeJson+' '.repeat(1048577-Buffer.byteLength(oversizeJson,'utf8'));
  assert.equal(Buffer.byteLength(oversizeContent,'utf8'),1048577);await writeFile(oversize,oversizeContent);
  await selectFile(oversize);
  assert.match(await text('#import-error'),/input_limit/);assert.match(await text('#import-error'),/previous workspace is unchanged/);
  assert.equal(await text('#timeline'),priorTimeline);assert.equal(await text('#source-content'),priorSource);

  const bom=join(profile,'leading-bom.json');await writeFile(bom,Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),Buffer.from(JSON.stringify({formatVersion:1,events:[makeEvent('bom:one')]}))]));
  await selectFile(bom);
  assert.match(await text('#import-error'),/leading_bom/);assert.match(await text('#import-error'),/previous workspace is unchanged/);
  assert.equal(await text('#timeline'),priorTimeline);assert.equal(await text('#source-content'),priorSource);
 });
 await step('tied and unknown occurrence times keep exact source-link order',async()=>{
  await open();
  const events=[
   makeEvent('order:null:z'),
   makeEvent('order:tie:z','2026-01-02T03:04:05.000Z'),
   makeEvent('order:early','2026-01-01T00:00:00.000Z'),
   makeEvent('order:null:a'),
   makeEvent('order:tie:a','2026-01-02T03:04:05.000Z')
  ];
  const path=join(profile,'tied-and-null-order.json');await writeFile(path,JSON.stringify({formatVersion:1,events}));await selectFile(path);
  const expectedIds=['order:early','order:tie:a','order:tie:z','order:null:a','order:null:z'];
  assert.deepEqual(await evaluate('[...document.querySelectorAll(".source-button")].map(button=>button.dataset.eventId)'),expectedIds);
  assert.match(await text('#timeline'),/Occurred · unknown/);
  for(const eventId of expectedIds){
   await evaluate(`document.querySelector('.source-button[data-event-id="${eventId}"]').click()`);
   assert.equal(await text('.source-id'),eventId,`source link did not inspect ${eventId}`);
   assert.equal(JSON.parse(await text('.raw-record pre')).eventId,eventId,`raw source did not match ${eventId}`);
  }
 });
 await step('task selection filters timeline and source consistently',async()=>{
  await open();
  await selectFile(example);
  await evaluate('document.querySelectorAll(".task-button")[1].click()');await wait('document.querySelector("#timeline-heading").textContent === "demo:other-task"');await evaluate('document.querySelector("#all-records").open=true;document.querySelector(".source-button").click()');assert.equal(await text('#timeline-heading'),'demo:other-task');assert.equal(await evaluate('document.querySelectorAll(".event-card").length'),1);assert.match(await text('#source-content'),/demo:other/);
  await evaluate('document.querySelectorAll(".task-button")[0].click()');
 });
 await step('reported verification basis and multiple runtime reports stay separate',async()=>{
  await selectFile(fixture('all-kinds.json'));assert.equal(await evaluate('document.querySelectorAll(".kind.runtime").length'),2);
  await evaluate('[...document.querySelectorAll(".source-button")].find(button=>button.dataset.eventId==="demo:verified").click()');
  assert.match(await text('#source-content'),/Reported tool verification/);assert.match(await text('#source-content'),/demo:evidence-1/);assert.match(await text('#source-content'),/does not certify its truth or independence/);
 });
 await step('HTML-like labels and summaries render literally without elements or execution',async()=>{
  const envelope=JSON.parse(await readFile(example,'utf8'));const event=envelope.events[0];event.eventId='literal:event';event.actorLabel='<img src=x onerror="globalThis.badHTML=true">';event.data.reason='<script>globalThis.badHTML=true</script>';
  const path=join(profile,'literal.json');await writeFile(path,JSON.stringify({formatVersion:1,events:[event]}));await selectFile(path);
  await evaluate('[...document.querySelectorAll(".source-button")].find(button=>button.dataset.eventId==="literal:event").click()');
  assert.match(await text('#source-content'),/<img src=x/);assert.match(await text('#timeline'),/<script>/);assert.equal(await evaluate('document.querySelectorAll("#source-content img, #timeline script").length'),0);assert.equal(await evaluate('globalThis.badHTML ?? false'),false);
 });
 await step('read lock prevents overlapping file imports and permits retry after read failure',async()=>{
  // Delay the actual native File.arrayBuffer read, then exercise the ordinary input.
  await evaluate('globalThis.originalBuffer=File.prototype.arrayBuffer; File.prototype.arrayBuffer=function(){return new Promise((resolve,reject)=>setTimeout(()=>originalBuffer.call(this).then(resolve,reject),250));}');
  const {root:documentRoot}=await command('DOM.getDocument');const {nodeId}=await command('DOM.querySelector',{nodeId:documentRoot.nodeId,selector:'#event-file'});
  await command('DOM.setFileInputFiles',{nodeId,files:[example]});
  assert.equal(await evaluate('document.querySelector("#event-file").disabled'),true);
  await wait('!document.querySelector("#event-file").disabled');
  await evaluate('File.prototype.arrayBuffer=function(){return Promise.reject(Error("synthetic read failure"));}');
  await selectFile(example);assert.match(await text('#import-error'),/file_read_error/);
  await evaluate('File.prototype.arrayBuffer=originalBuffer');await selectFile(example);assert.match(await text('#import-status'),/0 new, 6 duplicate/);
 });
 await step('reload clears session and ordinary reimport reconstructs timeline',async()=>{
  await open();
  assert.equal(await evaluate('document.querySelectorAll(".event-card").length'),0);await selectFile(example);assert.match(await text('#import-status'),/6 new, 0 duplicate/);
  const image=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});await writeFile(join(output,'timeline.png'),Buffer.from(image.data,'base64'));
 });
 await step('ordinary viewing has no remote requests or uncaught JavaScript errors',async()=>{
  assert.deepEqual(requests.filter(url=>!url.startsWith(origin+'/')&&!url.startsWith('data:')),[]);assert.deepEqual(scriptErrors,[]);
 });
 await step('accepted importer regressions pass through integrated server',async()=>{
  await open('/tests/import/');await wait('document.title === "PASS import tests" || document.title === "FAIL import tests"');assert.match(await text('#results'),/TOTAL 168 PASS 168 FAIL 0 SKIP 0$/);
 });
 const extraFile=process.env.AWL_TEST_EXTRA_FILE;
 if(extraFile){
  const requestStart=requests.length,errorStart=scriptErrors.length;
  await open();await wait('document.querySelector("#event-count")?.textContent === "0 events"');
  await selectFile(resolve(extraFile));
  const eventIds=await evaluate('[...document.querySelectorAll(".source-button")].map(button=>button.dataset.eventId)');
  const observations={
   inputPath:resolve(extraFile),status:await text('#import-status'),bodyText:await evaluate('document.body.innerText'),
   taskIds:await evaluate('[...document.querySelectorAll(".task-button")].map(button=>button.dataset.taskId)'),
   selectedTask:await text('#timeline-heading'),eventCount:await text('#event-count'),orderedTimelineEventIds:eventIds,
   pageErrors:[],requests:[],unexpectedElements:null,qaInjected:null,inspections:[]
  };
  for(let index=0;index<eventIds.length;index++){
   const eventId=eventIds[index];
   await evaluate(`document.querySelectorAll(".source-button")[${index}].click()`);
   const sourceRecords=await evaluate('[...document.querySelectorAll("#source-content .raw-record pre")].map(node=>node.textContent)');
   observations.inspections.push({
    eventId,selectedEventId:await text('.source-id'),sourceJson:sourceRecords[0]?JSON.parse(sourceRecords[0]):null,
    separateReceipt:sourceRecords[1]?JSON.parse(sourceRecords[1]):null,sourcePanelText:await text('#source-content')
   });
   const screenshot=await command('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
   await writeFile(join(output,`extra-event-${String(index+1).padStart(2,'0')}.png`),Buffer.from(screenshot.data,'base64'));
  }
  observations.pageErrors=scriptErrors.slice(errorStart);
  observations.requests=requests.slice(requestStart);
  observations.unexpectedElements=await evaluate('document.querySelectorAll("#timeline img,#timeline script,#source-content img,#source-content script").length');
  observations.qaInjected=await evaluate('globalThis.qaInjected ?? null');
  await writeFile(join(output,'observations.json'),JSON.stringify(observations,null,2));
 }
 console.log(report.join('\n'));console.log(`TOTAL ${report.length} PASS ${report.length} FAIL 0 SKIP 0`);
 await writeFile(join(output,'results.txt'),report.join('\n')+`\nTOTAL ${report.length} PASS ${report.length} FAIL 0 SKIP 0\n`);
 await writeFile(join(output,'requests.json'),JSON.stringify(requests,null,2));
} catch(error) {
 console.error(report.join('\n'));console.error(error.stack);await writeFile(join(output,'failure.txt'),report.join('\n')+'\n'+error.stack);process.exitCode=1;
} finally {
 socket?.close();child.kill('SIGTERM');await new Promise(resolve=>child.once('exit',resolve));await rm(profile,{recursive:true,force:true});
}
