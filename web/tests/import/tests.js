import * as api from '../../import/index.js';
import {emptySnapshot, importText} from '../../import/index.js';
const results = [];
function test(name, run) { try { run(); results.push(`PASS ${name}`); } catch (error) { results.push(`FAIL ${name}: ${error.message}`); } }
function assert(value, message) { if (!value) throw new Error(message); }
const event = {eventId:'demo:e1',taskId:'demo:t1',actorId:'demo:reporter',actorLabel:null,roleLabel:null,runId:'demo:r1',attemptId:'demo:a1',kind:'completion',occurredAt:'2026-11-04T10:00:00.000Z',source:{producerId:'demo:p',label:'Synthetic example',synthetic:true},data:{summary:'Reported completion'}};
const text = events => JSON.stringify({formatVersion:1, events});
const deps = () => ({now:()=> '2026-11-04T12:00:00.000Z',receiptId:id=>`receipt:${id}`});
test('valid file accepts event with separate ledger receipt', () => {
 const result = importText(emptySnapshot(), text([event]), deps());
 assert(result.ok, `expected success, got ${result.error?.code}`);
 assert(result.snapshot.events.length === 1, 'one event');
 assert(result.snapshot.receipts[0].receivedAt === '2026-11-04T12:00:00.000Z', 'injected local time');
});
test('nested escaped-equivalent duplicate keys reject without touching previous state', () => {
 const previous = emptySnapshot();
 const result = importText(previous, text([event]).replace('"summary":', '"summary":"first","summ\\u0061ry":'), deps());
 assert(!result.ok && result.error.code === 'duplicate_key', 'expected duplicate_key');
 assert(result.error.location.line === 1 && previous.events.length === 0, 'location and unchanged history');
});
test('retry preserves first receipt and conflicting batch rejects atomically', () => {
 const first = importText(emptySnapshot(), text([event]), deps()).snapshot;
 const retry = importText(first, text([{...event,source:{synthetic:true,label:'Synthetic example',producerId:'demo:p'}}]), {now:()=>{throw Error('must not create receipt');},receiptId:()=>{throw Error('must not create receipt');}});
 assert(retry.ok && retry.snapshot.events.length === 1, 'retry is idempotent');
 assert(retry.snapshot.receipts[0].receiptId === 'receipt:demo:e1', 'first receipt survives');
 const rejected = importText(first,text([{...event,eventId:'demo:new'}, {...event,data:{summary:'Conflicting report'}}]),deps());
 assert(!rejected.ok && rejected.error.code === 'event_id_conflict' && !('snapshot' in rejected), 'conflict has no snapshot');
 assert(first.events.length === 1 && first.events[0].data.summary === 'Reported completion', 'history unchanged');
});
test('invalid calendar rejects entire batch with event index and field', () => {
 const result = importText(emptySnapshot(),text([event,{...event,eventId:'demo:invalid',occurredAt:'2026-02-29T00:00:00.000Z'}]),deps());
 assert(!result.ok && result.error.code === 'invalid_schema' && result.error.eventIndex === 1 && result.error.field === 'occurredAt','actionable calendar rejection');
});
test('raw UTF-8 rejects invalid byte sequence and leading BOM explicitly', () => {
 const invalid = api.importBytes(emptySnapshot(), new Uint8Array([0xc3,0x28]), deps());
 assert(!invalid.ok && invalid.error.code === 'invalid_utf8','invalid bytes must not be replaced');
 const bom = importText(emptySnapshot(),'\ufeff'+text([event]),deps());
 assert(!bom.ok && bom.error.code === 'leading_bom','actionable explicit BOM policy');
});

// Additional contract regressions were authored after the tracer implementations.
const clone = value => JSON.parse(JSON.stringify(value));
const ids = rows => rows.map(row=>row.event.eventId);
const same = (actual,expected,message='unexpected value') => assert(JSON.stringify(actual)===JSON.stringify(expected), `${message}: ${JSON.stringify(actual)}`);
function rejectRaw(raw, code, field, index) {
 const previous = importText(emptySnapshot(),text([event]),deps()).snapshot;
 const before = JSON.stringify(previous);
 const result = importText(previous,raw,deps());
 assert(!result.ok, 'expected rejection');
 assert(result.error.code === code, `expected ${code}, got ${result.error.code}`);
 if (field !== undefined) assert(result.error.field === field, `expected field ${field}, got ${result.error.field}`);
 if (index !== undefined) assert(result.error.eventIndex === index, 'event index');
 assert(!('snapshot' in result), 'error must not offer replacement state');
 assert(JSON.stringify(previous) === before,'previous snapshot changed');
 assert(typeof result.error.message === 'string' && result.error.message.length>0,'remediation required');
 return result;
}
function badEvent(name, mutate, field) {
 test(name,()=>{const value=clone(event);mutate(value);rejectRaw(text([{...event,eventId:'demo:new'},value]),'invalid_schema',field,1);});
}
for (const raw of ['', '{', 'null trailing', '[1,]', '{"a":1,}', '{"a" 1}', '{"a":}', '{"a":01}', '{"a":+1}', '{"a":NaN}', '{"a":Infinity}', '{"a":1e999}', '{"a":"\\q"}', '{"a":"unterminated}', '{"a":"line\nfeed"}', 'true false', '\v{}', '{"formatVersion":1,"events":[]}x']) {
 test(`malformed JSON ${JSON.stringify(raw)}`,()=>rejectRaw(raw,'invalid_json'));
}
for (const raw of ['{"formatVersion":1,"formatVersion":1,"events":[]}', '{"formatVersion":1,"events":[],"ev\\u0065nts":[]}', text([event]).replace('"summary":','"summary":"x","summary":'), '{"__proto__":{},"__proto__":{}}']) {
 test('duplicate keys rejected at every raw object boundary '+raw.slice(0,30),()=>{const result=rejectRaw(raw,'duplicate_key');assert(result.error.location.offset>=0,'location');});
}
test('malformed multiline JSON has line/column location without raw text',()=>{
 const result=rejectRaw('{\n "formatVersion":1,\n "events":[}\n','invalid_json');
 assert(result.error.location.line === 3 && result.error.location.column === 12,'line 3 column 12');
 assert(!result.error.message.includes('formatVersion'),'no input dump');
});
for (const raw of ['null','[]','1','true','"envelope"','{}','{"formatVersion":1}','{"formatVersion":1,"events":{}}','{"formatVersion":1,"events":[],"extra":1}']) test('invalid envelope '+raw,()=>rejectRaw(raw,'invalid_schema'));
for (const version of [0,2,'1',null,true]) test('unsupported version '+version,()=>rejectRaw(JSON.stringify({formatVersion:version,events:[]}),'unsupported_version','formatVersion',null));
for (const key of Object.keys(event)) badEvent('required event field '+key,value=>delete value[key],key);
badEvent('unknown event field',value=>value.extra=1,'extra');
badEvent('unknown kind',value=>value.kind='toString','kind');
badEvent('invalid source type',value=>value.source=[], 'source');
for (const key of Object.keys(event.source)) badEvent('required source field '+key,value=>delete value.source[key],'source.'+key);
badEvent('unknown source field',value=>value.source.extra=1,'source.extra');
badEvent('synthetic must be boolean',value=>value.source.synthetic='true','source.synthetic');
for (const value of ['', 'space id','é','x/y','x\n','x'.repeat(129),42,null]) badEvent('invalid ID '+JSON.stringify(value),e=>e.eventId=value,'eventId');
test('128 ASCII ID characters accepted case-sensitive',()=>{
 const result=importText(emptySnapshot(),text([{...event,eventId:'A'.repeat(128)},{...event,eventId:'a'.repeat(128)}]),deps());
 assert(result.ok && result.acceptedCount===2,'ID boundary');
});
for (const value of ['',42,'a'.repeat(501),'😀'.repeat(501)]) badEvent('display text rejects '+String(value).slice(0,20),e=>e.actorLabel=value,'actorLabel');
test('500 Unicode code points and literal HTML remain exact text',()=>{
 const value={...event,actorLabel:'😀'.repeat(500),roleLabel:'<img src=x onerror=alert(1)>'};
 const result=importText(emptySnapshot(),text([value]),deps());
 assert(result.ok && result.snapshot.events[0].actorLabel===value.actorLabel && result.snapshot.events[0].roleLabel===value.roleLabel,'preserved plain text');
});
for (const value of ['2026-02-29T00:00:00.000Z','2026-04-31T00:00:00.000Z','2026-13-01T00:00:00.000Z','2026-01-01T24:00:00.000Z','2026-01-01T00:00:60.000Z','2026-01-01T00:00:00Z','2026-01-01T00:00:00.000+00:00',42]) badEvent('invalid timestamp '+value,e=>e.occurredAt=value,'occurredAt');
for (const value of ['2024-02-29T23:59:59.999Z','2000-02-29T00:00:00.000Z','0000-01-01T00:00:00.000Z',null]) test('valid timestamp '+value,()=>assert(importText(emptySnapshot(),text([{...event,occurredAt:value}]),deps()).ok,'valid calendar'));
badEvent('attempt needs run',e=>e.runId=null,'runId');
badEvent('completion requires attempt',e=>e.attemptId=null,'attemptId');
badEvent('unknown payload member',e=>e.data.extra=1,'data.extra');
badEvent('payload must be object',e=>e.data=null,'data');

test('within-batch equal duplicates counted and conflicting duplicates reject',()=>{
 const result=importText(emptySnapshot(),text([event,event,event]),deps());
 same(result.acceptedEventIds,['demo:e1']);same(result.duplicateEventIds,['demo:e1','demo:e1']);
 assert(result.acceptedCount===1 && result.duplicateCount===2 && result.snapshot.receipts.length===1,'occurrence counts');
 rejectRaw(text([{...event,eventId:'demo:new'},{...event,eventId:'demo:new',actorLabel:'changed'}]),'event_id_conflict','eventId',1);
});
test('equality includes exact strings, nulls and every producer field',()=>{
 for (const change of [e=>e.actorLabel='', e=>e.actorLabel=' ', e=>e.source.label='Synthetic example ', e=>e.data.summary='reported completion']) {
  const value=clone(event);change(value);
  const result=importText(importText(emptySnapshot(),text([event]),deps()).snapshot,text([value]),deps());
  assert(!result.ok,'changed producer content not silently normalized');
 }
});
test('reordered producer objects, whitespace and equivalent JSON escapes remain identical',()=>{
 const reorder=value=>value && typeof value==='object' ? Object.fromEntries(Object.entries(value).reverse().map(([key,entry])=>[key,reorder(entry)])) : value;
 const previous=importText(emptySnapshot(),text([event]),deps()).snapshot;
 const raw=JSON.stringify({events:[reorder(event)],formatVersion:1},null,2).replace('Reported','\\u0052eported');
 const result=importText(previous,raw);
 assert(result.ok && result.acceptedCount===0 && result.duplicateCount===1,'structural equality');
 same(result.snapshot.receipts,previous.receipts,'original receipt unchanged');
});
test('empty import succeeds without clock or receipt generator',()=>{
 const result=importText(emptySnapshot(),text([]));
 assert(result.ok && result.acceptedCount===0 && result.duplicateCount===0 && result.snapshot.events.length===0,'empty batch');
});
test('receipt failures return atomic error and immutable snapshots resist caller writes',()=>{
 const previous=importText(emptySnapshot(),text([event]),deps()).snapshot;
 for (const dependency of [{now:()=>{throw Error('secret');}}, {now:()=> 'bad'}, {now:()=> '2026-11-04T12:00:00.000Z',receiptId:()=>''}]) {
  const result=importText(previous,text([{...event,eventId:'demo:new'}]),dependency);
  assert(!result.ok && result.error.code==='receipt_error' && previous.events.length===1,'atomic local failure');
 }
 let threw=false;try {previous.events[0].data.summary='edited';} catch {threw=true;}
 assert(threw && previous.events[0].data.summary==='Reported completion','immutable event');
});
test('byte decoder rejects malformed UTF-8 variants and byte BOM',()=>{
 for(const bytes of [[0xc0,0xaf],[0xe2,0x82],[0xed,0xa0,0x80],[0xff]]) {
  const result=api.importBytes(emptySnapshot(),new Uint8Array(bytes),deps());
  assert(!result.ok && result.error.code==='invalid_utf8','strict decoding');
 }
 const result=api.importBytes(emptySnapshot(),new Uint8Array([0xef,0xbb,0xbf,0x7b,0x7d]),deps());
 assert(!result.ok && result.error.code==='leading_bom','byte BOM');
 assert(api.importBytes(emptySnapshot(),new TextEncoder().encode(text([event])),deps()).ok,'valid byte input');
});
test('1 MiB exact encoded boundary accepted and one extra byte rejected',()=>{
 const base=text([]), exact=base+' '.repeat(1048576-base.length);
 assert(importText(emptySnapshot(),exact,deps()).ok,'exact text size');
 assert(api.importBytes(emptySnapshot(),new TextEncoder().encode(exact),deps()).ok,'exact byte size');
 rejectRaw(exact+' ','input_limit');
 assert(api.importBytes(emptySnapshot(),new Uint8Array(1048577),deps()).error.code==='input_limit','byte overflow');
 rejectRaw(text([{...event,actorLabel:'😀'.repeat(262144)}]),'input_limit');
});
test('1,000-event limit counts incoming occurrences including duplicates',()=>{
 const result=importText(emptySnapshot(),text(Array(1000).fill(event)),deps());
 assert(result.ok && result.acceptedCount===1 && result.duplicateCount===999,'exact count');
 rejectRaw(text(Array(1001).fill(event)),'event_limit','events',null);
});
test('1,000 unique events accepted with one receipt each',()=>{
 const events=Array.from({length:1000},(_,index)=>({...event,eventId:'limit:'+index}));
 const result=importText(emptySnapshot(),text(events),deps());
 assert(result.ok && result.acceptedCount===1000 && result.snapshot.receipts.length===1000,'unique limit');
});
test('hostile nesting returns structured rejection',()=>rejectRaw('['.repeat(10000)+']'.repeat(10000),'invalid_schema'));
test('raw public APIs reject parsed objects and wrong byte types',()=>{
 assert(importText(emptySnapshot(),{formatVersion:1,events:[]},deps()).error.code==='invalid_input','parsed objects bypass raw validation');
 assert(api.importBytes(emptySnapshot(),[123,125],deps()).error.code==='invalid_input','wrong bytes');
});

const fixturePaths=['../../examples/synthetic-timeline.json','all-kinds.json','out-of-order.json','conflict.json','malformed.json','expected.json'];
try {
 const fixtureTexts=await Promise.all(fixturePaths.map(async path=>{const response=await fetch(path);if(!response.ok)throw Error('fixture HTTP '+response.status);return response.text();}));
 const [synthetic,allKinds,outOfOrder,conflict,malformed,expectedText]=fixtureTexts;
 const expected=JSON.parse(expectedText);
 test('public synthetic file uses ordinary raw import and independently expected projection',()=>{
  const result=importText(emptySnapshot(),synthetic,deps());
  assert(result.ok && result.acceptedCount===expected.synthetic.acceptedCount && result.duplicateCount===0,'synthetic counts');
  same(api.taskIds(result.snapshot),expected.synthetic.tasks);same(ids(api.timeline(result.snapshot,'demo:launch')),expected.synthetic.launchTimeline);
  const runtime=api.timeline(result.snapshot,'demo:launch').find(row=>row.event.eventId===expected.synthetic.runtimeEventId);
  assert(runtime.event.data.configured.model===expected.synthetic.runtimeConfiguredModel && runtime.event.data.verified.model===null && runtime.event.data.verification===null,'configured never inferred as runtime');
  assert(runtime.receipt.channel==='file' && runtime.receipt.receivedAt!==runtime.event.occurredAt,'time and provenance separated');
  assert(api.timeline(result.snapshot,'missing:task').length===0,'unknown task');
 });
 test('golden conflict and malformed files preserve prior synthetic snapshot',()=>{
  const previous=importText(emptySnapshot(),synthetic,deps()).snapshot;
  for(const [raw,want] of [[conflict,expected.conflictAfterSynthetic],[malformed,expected.malformed]]) {
   const before=JSON.stringify(previous),result=importText(previous,raw,deps());
   assert(!result.ok && result.error.code===want.code && previous.events.length===want.retainedCount,'golden rejection');
   if(want.eventIndex!==undefined) assert(result.error.eventIndex===want.eventIndex && result.error.eventId===want.eventId && result.error.field===want.field,'golden conflict details');
   assert(JSON.stringify(previous)===before,'golden rollback');
  }
 });
 test('golden out-of-order file and shuffled separate imports share canonical timeline',()=>{
  const result=importText(emptySnapshot(),outOfOrder,deps());
  assert(result.ok && result.acceptedCount===expected.outOfOrder.acceptedCount,'golden counts');
  same(ids(api.timeline(result.snapshot,'demo:launch')),expected.outOfOrder.timeline);
  const incoming=JSON.parse(outOfOrder).events;
  for(const events of [incoming,[...incoming].reverse(),[incoming[2],incoming[4],incoming[0],incoming[3],incoming[1]]]) {
   let snapshot=emptySnapshot();for(const event of events) snapshot=importText(snapshot,text([event]),deps()).snapshot;
   same(ids(api.timeline(snapshot,'demo:launch')),expected.outOfOrder.timeline);
  }
 });
 test('ASCII ties, null-last order and task filtering',()=>{
  const values=[['demo:z',null],['demo:a',event.occurredAt],['demo:Z',event.occurredAt],['demo:A',null],['demo:0','2026-01-01T00:00:00.000Z']].map(([eventId,occurredAt])=>({...event,eventId,occurredAt}));
  const snapshot=importText(emptySnapshot(),text(values),deps()).snapshot;
  same(ids(api.timeline(snapshot,event.taskId)),['demo:0','demo:Z','demo:a','demo:A','demo:z']);
 });
 const kinds=JSON.parse(allKinds).events;
 test('all ten v1 kinds plus reported tool verification accepted',()=>{
  const result=importText(emptySnapshot(),allKinds,deps());
  assert(result.ok && result.acceptedCount===expected.allKinds.acceptedCount,'all kinds valid');
 });
 for(const sample of kinds) {
  for(const field of Object.keys(sample.data)) test(`required ${sample.kind}.data.${field} (${sample.eventId})`,()=>{
   const value=clone(sample);delete value.data[field];rejectRaw(text([value]),'invalid_schema','data.'+field,0);
  });
  test(`unknown ${sample.kind} payload field (${sample.eventId})`,()=>{const value=clone(sample);value.data.extra=1;rejectRaw(text([value]),'invalid_schema','data.extra',0);});
 }
 for(const kind of ['assignment','block','resolution','handoff','revision','review','qa','completion','runtime']) {
  const value=clone(kinds.find(event=>event.kind===kind));value.runId=null;value.attemptId=null;
  test(`${kind} requires run`,()=>rejectRaw(text([value]),'invalid_schema','runId',0));
 }
 test('kind-specific attempt requirements and nullable review/runtime attempts',()=>{
  for(const kind of ['assignment','block','resolution','handoff','revision','completion']) {
   const value=clone(kinds.find(event=>event.kind===kind));value.attemptId=null;
   rejectRaw(text([value]),'invalid_schema','attemptId',0);
  }
  for(const kind of ['review','qa','runtime']) {
   const value=clone(kinds.find(event=>event.kind===kind));value.attemptId=null;
   assert(importText(emptySnapshot(),text([value]),deps()).ok,kind+' optional attempt');
  }
 });
 test('nullable consultation run/attempt and nullable labels accepted',()=>{
  const value=clone(kinds[1]);value.runId=null;value.attemptId=null;value.actorLabel=null;value.roleLabel=null;
  assert(importText(emptySnapshot(),text([value]),deps()).ok,'consultation requires no invented run');
 });
 for(const field of ['configured','verified']) for(const key of ['model','effort']) test(`runtime ${field}.${key} required nullable`,()=>{
  const value=clone(kinds[9]);delete value.data[field][key];rejectRaw(text([value]),'invalid_schema',`data.${field}.${key}`,0);
 });
 for(const field of ['configured','verified']) test(`runtime ${field} exact fields`,()=>{
  const value=clone(kinds[9]);value.data[field].extra=1;rejectRaw(text([value]),'invalid_schema',`data.${field}.extra`,0);
 });
 for(const field of ['method','verifierActorId','evidenceRef','summary']) test(`reported verification requires ${field}`,()=>{
  const value=clone(kinds[10]);delete value.data.verification[field];rejectRaw(text([value]),'invalid_schema','data.verification.'+field,0);
 });
 test('runtime known values require tool basis; all unknown require null',()=>{
  const missing=clone(kinds[9]);missing.data.verified.model='model';rejectRaw(text([missing]),'invalid_schema','data.verification',0);
  const extra=clone(kinds[10]);extra.data.verified.model=null;rejectRaw(text([extra]),'invalid_schema','data.verification',0);
  const wrong=clone(kinds[10]);wrong.data.verification.method='self';rejectRaw(text([wrong]),'invalid_schema','data.verification.method',0);
 });
 test('revision self reference is a schema error; unresolved foreign references remain accepted',()=>{
  const value=clone(kinds[5]);value.data.previousAttemptId=value.attemptId;rejectRaw(text([value]),'invalid_schema','data.previousAttemptId',0);
  const resolution=clone(kinds[3]);resolution.data.blockEventId='missing:block';assert(importText(emptySnapshot(),text([resolution]),deps()).ok,'unresolved evidence accepted');
  const assignment=clone(kinds[0]);assignment.data.parentRunId=assignment.runId;assert(importText(emptySnapshot(),text([assignment]),deps()).ok,'cycle not schema validation');
 });
 for(const kind of ['review','qa']) test(kind+' outcome constrained',()=>{
  const value=clone(kinds.find(event=>event.kind===kind));value.data.outcome='done';rejectRaw(text([value]),'invalid_schema','data.outcome',0);
 });
} catch(error) { test('fixture loading',()=>{throw error;}); }
// Shared raw Unicode corpus is also consumed by the durable Python core.
try {
 const response = await fetch('unicode.json');
 const bytes = new Uint8Array(await response.arrayBuffer());
 test('shared surrogate corpus preserves lone units and pair/literal identity',()=>{
  const first = api.importBytes(emptySnapshot(),bytes,deps());
  assert(first.ok && first.acceptedCount===3,'all Unicode records accepted');
  same(first.snapshot.events.map(event=>event.eventId),['unicode:high','unicode:low','unicode:pair']);
  assert(first.snapshot.events[0].data.summary==='\ud800','lone high surrogate retained');
  assert(first.snapshot.events[1].data.summary==='\udc00','lone low surrogate retained');
  assert([...first.snapshot.events[2].actorLabel].length===500,'paired escapes count code points');
  const literal = JSON.stringify(JSON.parse(new TextDecoder().decode(bytes)));
  const retry = importText(first.snapshot,literal,deps());
  assert(retry.ok && retry.acceptedCount===0 && retry.duplicateCount===3,'literal non-BMP equals escaped pairs');
  same(retry.snapshot.receipts,first.snapshot.receipts,'original receipts');
  const oversized = JSON.parse(literal); oversized.events[0].actorLabel += '😀';
  assert(importText(emptySnapshot(),JSON.stringify(oversized),deps()).error.code==='invalid_schema','501 code points rejected');
 });
 test('paired Unicode key escapes collide with literal keys',()=>rejectRaw('{"😀":1,"\\ud83d\\ude00":2}','duplicate_key'));
} catch(error) { test('Unicode fixture loading',()=>{throw error;}); }

const failed = results.filter(line=>line.startsWith('FAIL')).length;
document.querySelector('#results').textContent = `${results.join('\n')}\nTOTAL ${results.length} PASS ${results.length-failed} FAIL ${failed} SKIP 0`;
document.title = failed ? 'FAIL import tests' : 'PASS import tests';
