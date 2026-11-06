import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {acceptDurableSnapshot} from '../../import/durable.js';
import {projectTask} from '../../graph/project.js';
import {taskIds,timeline} from '../../import/index.js';
const encoder=new TextEncoder(),results=[];
function test(name,run){try{run();results.push('PASS '+name)}catch(e){results.push('FAIL '+name+': '+e.message);process.exitCode=1}}
const unicode=JSON.parse(await readFile(new URL('../import/unicode.json',import.meta.url),'utf8'));
const stamp='2026-11-04T10:00:00.000Z';
const registration={registeredAt:stamp,registrationReceiptId:'registration:1'};
const valid={serviceVersion:1,ok:true,data:{formatVersion:1,projects:[{projectId:'p',name:'<b>Literal project</b>',...registration}],sessions:[{sessionId:'s',projectId:'p',taskId:'t',title:'Task',...registration}],events:unicode.events,receipts:unicode.events.map(e=>({eventId:e.eventId,receivedAt:stamp,receiptId:'first:'+e.eventId,channel:'mcp'}))}};
const bytes=value=>encoder.encode(JSON.stringify(value));
const clone=()=>JSON.parse(JSON.stringify(valid));
function rejects(name,mutate,code){test(name,()=>{const value=clone();mutate(value);const result=acceptDurableSnapshot(bytes(value));assert.equal(result.ok,false);assert.equal('snapshot' in result,false);if(code)assert.equal(result.error.code,code)})}
test('invalid UTF-8 cannot become accepted snapshot',()=>assert.equal(acceptDurableSnapshot(new Uint8Array([0xff])).ok,false));
test('valid global source map preserves original receipts and Unicode',()=>{
 const result=acceptDurableSnapshot(bytes(valid));assert.equal(result.ok,true);assert.equal(result.snapshot.events[0].data.summary,'\ud800');assert.equal(result.snapshot.events[2].actorLabel,'😀'.repeat(500));
 assert.deepEqual(result.snapshot.receipts.map(r=>r.eventId),['unicode:high','unicode:low','unicode:pair']);
 assert.equal(result.snapshot.receipts[0].receiptId,'first:unicode:high');assert.deepEqual(taskIds(result.snapshot),['t']);assert.equal(timeline(result.snapshot,'t').length,3);assert.equal(projectTask(result.snapshot,'t').eventIds.length,3);
 assert.throws(()=>result.snapshot.events[0].data.summary='modified');assert.throws(()=>result.projects[0].name='modified');assert.throws(()=>result.snapshot.receipts[0].receivedAt='modified');
});
for(const [name,mutate] of [
 ['service version',v=>v.serviceVersion=2],['boolean version',v=>v.serviceVersion=true],['false success',v=>v.ok=false],['unknown response field',v=>v.extra=1],
 ['unknown data field',v=>v.data.extra=1],['producer version',v=>v.data.formatVersion=2],['wrong arrays',v=>v.data.events={}],
 ['invalid producer',v=>v.data.events[0].source.synthetic='true'],['duplicate event',v=>v.data.events.push(v.data.events[0])],
 ['duplicate project',v=>v.data.projects.push(v.data.projects[0])],['duplicate session',v=>v.data.sessions.push(v.data.sessions[0])],
 ['duplicate task binding',v=>v.data.sessions.push({...v.data.sessions[0],sessionId:'other'})],['missing project',v=>v.data.sessions[0].projectId='missing'],
 ['foreign task outside selection',v=>v.data.events[2].taskId='unregistered'],['missing receipt',v=>v.data.receipts.pop()],['duplicate receipt',v=>v.data.receipts.push(v.data.receipts[0])],
 ['extra receipt',v=>v.data.receipts.push({...v.data.receipts[0],eventId:'extra'})],['bad receipt date',v=>v.data.receipts[0].receivedAt='2026-02-30T00:00:00.000Z'],
 ['empty receipt ID',v=>v.data.receipts[0].receiptId=''],['non-ASCII receipt ID',v=>v.data.receipts[0].receiptId='é'],['receipt ID too long',v=>v.data.receipts[0].receiptId='x'.repeat(129)],
 ['file channel',v=>v.data.receipts[0].channel='file'],['registration date',v=>v.data.projects[0].registeredAt='bad'],['registration metadata',v=>v.data.sessions[0].registrationReceiptId=''],
 ['unknown registration field',v=>v.data.projects[0].extra=1],['project capacity',v=>v.data.projects=Array(1001).fill(v.data.projects[0])],['event capacity',v=>v.data.events=Array(10001).fill(v.data.events[0])]
])rejects(name,mutate);
for(const [name,raw,code] of [['BOM','\ufeff{}','leading_bom'],['duplicate decoded keys','{"serviceVersion":1,"service\\u0056ersion":1}','duplicate_key'],['nonfinite','{"a":1e999}','invalid_json'],['depth','['.repeat(100)+']'.repeat(100),'invalid_schema']])test(name,()=>assert.equal(acceptDurableSnapshot(encoder.encode(raw)).error.code,code));
test('raw type and 32 MiB bounds',()=>{assert.equal(acceptDurableSnapshot({}).error.code,'invalid_input');assert.equal(acceptDurableSnapshot(new Uint8Array(33554433)).error.code,'input_limit')});
rejects('stored ASCII-escaped byte capacity counts Unicode',v=>{
 const e=v.data.events[0];e.actorLabel='😀'.repeat(500);e.roleLabel='😀'.repeat(500);e.source.label='😀'.repeat(500);e.data.summary='😀'.repeat(500);
 v.data.events=Array.from({length:500},(_,i)=>({...e,eventId:'large:'+i}));v.data.receipts=v.data.events.map(e=>({eventId:e.eventId,receivedAt:stamp,receiptId:'r',channel:'mcp'}));
},'storage_limit');
if(process.env.AWL_SNAPSHOT_FILE){const raw=new Uint8Array(await readFile(process.env.AWL_SNAPSHOT_FILE));test('actual server oracle hydrates without receipt generation',()=>{const result=acceptDurableSnapshot(raw);assert.equal(result.ok,true);const original=JSON.parse(new TextDecoder().decode(raw));const map=new Map(original.data.receipts.map(r=>[r.eventId,r]));for(const r of result.snapshot.receipts)assert.deepEqual({...r},map.get(r.eventId));assert.equal(result.snapshot.events.length,original.data.events.length)})}
const failed=results.filter(s=>s.startsWith('FAIL')).length;console.log(results.join('\n'));console.log(`TOTAL ${results.length} PASS ${results.length-failed} FAIL ${failed} SKIP 0`);
