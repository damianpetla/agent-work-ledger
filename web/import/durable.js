import {parseJSON} from './parse.js';
import {validateEnvelope,validTimestamp} from './schema.js';
const ascii=(a,b)=>a<b?-1:a>b?1:0;
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value)}return value};
const bad=(field=null,code='invalid_schema')=>{throw {code,message:'Invalid durable snapshot; preserve the previous view and refresh from a compatible local service.',eventIndex:null,field,eventId:null}};
function exact(value,keys,path){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||keys.some(k=>!Object.hasOwn(value,k)))bad(path)}
const id=(v,path)=>{if(typeof v!=='string'||!/^[A-Za-z0-9._:-]{1,128}$/.test(v))bad(path)};
const text=(v,path)=>{if(typeof v!=='string'||[...v].length<1||[...v].length>500)bad(path)};
const opaque=v=>typeof v==='string'&&v.length>=1&&v.length<=128&&/^[\x00-\x7f]+$/.test(v);
const storedBytes=event=>JSON.stringify(event).replace(/[\u007f-\uffff]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0')).length;
export function acceptDurableSnapshot(rawBytes){
 try{
  if(!(rawBytes instanceof Uint8Array))bad(null,'invalid_input');
  if(rawBytes.byteLength>33554432)bad(null,'input_limit');
  if(rawBytes[0]===0xef&&rawBytes[1]===0xbb&&rawBytes[2]===0xbf)bad(null,'leading_bom');
  let raw;try{raw=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(rawBytes)}catch{bad(null,'invalid_utf8')}
  const result=parseJSON(raw);exact(result,['serviceVersion','ok','data'],null);
  if(result.serviceVersion!==1)bad('serviceVersion','unsupported_version');
  if(result.ok!==true)bad('ok');
  const d=result.data;exact(d,['formatVersion','projects','sessions','events','receipts'],'data');
  if(d.formatVersion!==1)bad('formatVersion','unsupported_version');
  for(const [name,max] of [['projects',1000],['sessions',1000],['events',10000],['receipts',10000]])if(!Array.isArray(d[name])||d[name].length>max)bad(name);
  const projects=new Map(),sessions=new Map(),tasks=new Map(),events=new Map(),receipts=new Map();
  function metadata(record){if(!validTimestamp(record.registeredAt)||!opaque(record.registrationReceiptId))bad('registrationReceiptId')}
  for(const p of d.projects){exact(p,['projectId','name','registeredAt','registrationReceiptId'],'project');id(p.projectId,'projectId');text(p.name,'name');metadata(p);if(projects.has(p.projectId))bad('projectId');projects.set(p.projectId,p)}
  for(const s of d.sessions){exact(s,['sessionId','projectId','taskId','title','registeredAt','registrationReceiptId'],'session');for(const k of ['sessionId','projectId','taskId'])id(s[k],k);text(s.title,'title');metadata(s);if(sessions.has(s.sessionId)||tasks.has(s.taskId)||!projects.has(s.projectId))bad('sessionId');sessions.set(s.sessionId,s);tasks.set(s.taskId,s)}
  // Reuse the authoritative v1 validator, retaining its per-input guard by validating chunks.
  for(let i=0;i<d.events.length;i+=1000)validateEnvelope({formatVersion:1,events:d.events.slice(i,i+1000)});
  let size=0;
  for(const e of d.events){if(events.has(e.eventId)||!tasks.has(e.taskId))bad('eventId');events.set(e.eventId,e);size+=storedBytes(e)}
  if(size>8388608)bad('events','storage_limit');
  for(const r of d.receipts){exact(r,['eventId','receivedAt','receiptId','channel'],'receipt');id(r.eventId,'eventId');if(receipts.has(r.eventId)||!events.has(r.eventId)||!validTimestamp(r.receivedAt)||!opaque(r.receiptId)||r.channel!=='mcp')bad('receipt');receipts.set(r.eventId,r)}
  if(receipts.size!==events.size)bad('receipts');
  const sorted=[...events.values()].sort((a,b)=>(a.occurredAt===null)-(b.occurredAt===null)||ascii(a.occurredAt??'',b.occurredAt??'')||ascii(a.eventId,b.eventId));
  return {ok:true,snapshot:freeze({events:sorted,receipts:sorted.map(e=>receipts.get(e.eventId))}),projects:freeze([...projects.values()].sort((a,b)=>ascii(a.projectId,b.projectId))),sessions:freeze([...sessions.values()].sort((a,b)=>ascii(a.sessionId,b.sessionId)))};
 }catch(error){return {ok:false,error:{code:error.code||'invalid_schema',message:'Invalid durable snapshot; retain the previous view and refresh from a compatible local service.',eventIndex:error.eventIndex??null,field:error.field??null,eventId:null}}}
}
