import {emptySnapshot,importBytes} from '../import/index.js';
import {acceptDurableSnapshot} from '../import/durable.js';
// Separate memory diagnostics and a cached durable view. Each boundary validates before publishing.
export function createWorkspaces(dependencies){
 const snapshots={example:emptySnapshot(),files:emptySnapshot(),durable:emptySnapshot()};
 function accept(mode,bytes){const result=importBytes(snapshots[mode],bytes,dependencies);if(result.ok)snapshots[mode]=result.snapshot;return result}
 return {
  snapshot:mode=>snapshots[mode],
  acceptDurable(bytes){const result=acceptDurableSnapshot(bytes);if(result.ok)snapshots.durable=result.snapshot;return result},
  importExample:bytes=>accept('example',bytes),
  importFile:bytes=>accept('files',bytes),
  source(mode,eventId){const s=snapshots[mode],index=s.events.findIndex(e=>e.eventId===eventId);return index<0?null:{event:s.events[index],receipt:s.receipts[index]}}
 };
}
