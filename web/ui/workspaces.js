import {emptySnapshot,importBytes} from '../import/index.js';
// Two explicit page-lifetime workspaces. Only accepted importer snapshots enter.
export function createWorkspaces(dependencies){
 const snapshots={example:emptySnapshot(),files:emptySnapshot()};
 function accept(mode,bytes){const result=importBytes(snapshots[mode],bytes,dependencies);if(result.ok)snapshots[mode]=result.snapshot;return result}
 return {
  snapshot:mode=>snapshots[mode],
  importExample:bytes=>accept('example',bytes),
  importFile:bytes=>accept('files',bytes),
  source(mode,eventId){const s=snapshots[mode],index=s.events.findIndex(e=>e.eventId===eventId);return index<0?null:{event:s.events[index],receipt:s.receipts[index]}}
 };
}
