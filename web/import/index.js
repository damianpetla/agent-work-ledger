import {validateEnvelope, validTimestamp} from './schema.js';
import {parseJSON} from './parse.js';

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
export const emptySnapshot = () => freeze({events:[], receipts:[]});
function equal(left, right) {
  if (left === right) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every(key => Object.hasOwn(right,key) && equal(left[key],right[key]));
}
function compare(left, right) {
  if (left.occurredAt !== right.occurredAt) {
    if (left.occurredAt === null) return 1;
    if (right.occurredAt === null) return -1;
    return left.occurredAt < right.occurredAt ? -1 : 1;
  }
  return left.eventId < right.eventId ? -1 : left.eventId > right.eventId ? 1 : 0;
}
const reject = (code,message,field = null) => ({ok:false,error:{code,message,eventIndex:null,field}});
const MAX_BYTES = 1024 * 1024;

export function importBytes(previous, bytes, dependencies) {
  if (!(bytes instanceof Uint8Array)) return reject('invalid_input','Supply file bytes as a Uint8Array.');
  if (bytes.byteLength > MAX_BYTES) return reject('input_limit','Split the UTF-8 file into inputs of at most 1 MiB.');
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return reject('leading_bom','Save the file as UTF-8 without a leading BOM.');
  let text;
  try { text = new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes); }
  catch { return reject('invalid_utf8','Save the file as valid UTF-8; invalid byte sequences are rejected.'); }
  return importText(previous,text,dependencies);
}

export function importText(previous, rawText, dependencies) {
  if (typeof rawText !== 'string') return reject('invalid_input','Supply raw JSON text or use importBytes for a file.');
  if (new TextEncoder().encode(rawText).byteLength > MAX_BYTES) return reject('input_limit','Split the UTF-8 file into inputs of at most 1 MiB.');
  if (rawText.startsWith('\ufeff')) return reject('leading_bom','Save the file as UTF-8 without a leading BOM.');
  let envelope;
  try { envelope = parseJSON(rawText); validateEnvelope(envelope); } catch(error) { return {ok:false,error}; }
  const byId = new Map(previous.events.map(event => [event.eventId,event]));
  const acceptedEventIds = [], duplicateEventIds = [];
  for (const [index,event] of envelope.events.entries()) {
    if (byId.has(event.eventId)) {
      if (!equal(byId.get(event.eventId),event)) return {ok:false,error:{code:'event_id_conflict',message:'This ID already has different content; use a new event ID for a correction.',eventIndex:index,field:'eventId',eventId:event.eventId}};
      duplicateEventIds.push(event.eventId);
    } else {
      byId.set(event.eventId,event);
      acceptedEventIds.push(event.eventId);
    }
  }
  let newReceipts = [];
  if (acceptedEventIds.length) {
    try {
      const receivedAt = dependencies.now();
      if (!validTimestamp(receivedAt)) throw new Error();
      newReceipts = acceptedEventIds.map(eventId=>{
        const receiptId = dependencies.receiptId(eventId);
        if (typeof receiptId !== 'string' || receiptId.length === 0) throw new Error();
        return {eventId,receivedAt,receiptId,channel:'file'};
      });
    } catch { return reject('receipt_error','Provide a valid UTC clock and nonempty receipt IDs; retry the unchanged input.'); }
  }
  const receipts = [...previous.receipts, ...newReceipts];
  const events = [...byId.values()].sort(compare);
  const receiptById = new Map(receipts.map(receipt=>[receipt.eventId,receipt]));
  return {ok:true,snapshot:freeze({events,receipts:events.map(event=>receiptById.get(event.eventId))}),acceptedEventIds,duplicateEventIds,acceptedCount:acceptedEventIds.length,duplicateCount:duplicateEventIds.length};
}
export const taskIds = snapshot => [...new Set(snapshot.events.map(event=>event.taskId))].sort();
export function timeline(snapshot, taskId) {
  const receipts = new Map(snapshot.receipts.map(receipt=>[receipt.eventId,receipt]));
  return snapshot.events.filter(event=>event.taskId === taskId).sort(compare).map(event=>({event,receipt:receipts.get(event.eventId)}));
}
