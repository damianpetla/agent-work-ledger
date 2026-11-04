const ID = /^[A-Za-z0-9._:-]{1,128}$/;
export function validTimestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}
export function validateEnvelope(envelope) {
  let eventIndex = null;
  function fail(field, message, code = 'invalid_schema') { throw {code,message,eventIndex,field}; }
  function exact(value, keys, path) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path,'Expected an object with the documented fields.');
    for (const key of keys) if (!Object.hasOwn(value,key)) fail(path ? `${path}.${key}` : key,'Required field is missing; include null only where allowed.');
    for (const key of Object.keys(value)) if (!keys.includes(key)) {
      const safeKey = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(key) ? key : '[unknown field]';
      fail(path ? `${path}.${safeKey}` : safeKey,'Unknown field; remove fields outside the v1 contract.');
    }
  }
  function id(value, path, nullable = false) {
    if (nullable && value === null) return;
    if (typeof value !== 'string' || !ID.test(value)) fail(path,'Use an ASCII ID of 1–128 letters, digits or . _ : - .');
  }
  function text(value, path, nullable = false) {
    if (nullable && value === null) return;
    if (typeof value !== 'string' || [...value].length < 1 || [...value].length > 500) fail(path,'Use plain text of 1–500 Unicode code points.');
  }
  exact(envelope,['formatVersion','events'],null);
  if (envelope.formatVersion !== 1) fail('formatVersion','Unsupported version; supply formatVersion 1.','unsupported_version');
  if (!Array.isArray(envelope.events)) fail('events','Supply an array of events.');
  if (envelope.events.length > 1000) fail('events','Split the file into batches of at most 1,000 events.','event_limit');
  const payloads = {
    assignment:['fromActorId','toActorId','parentRunId'],
    consultation:['toActorId','question'],block:['reason','nextActorId'],
    resolution:['blockEventId'],handoff:['toActorId','reason'],revision:['previousAttemptId','reason'],
    review:['targetAttemptId','outcome','summary'],qa:['targetAttemptId','outcome','summary'],
    completion:['summary'],runtime:['configured','verified','verification']
  };
  envelope.events.forEach((event,index)=>{
    eventIndex = index;
    exact(event,['eventId','taskId','actorId','actorLabel','roleLabel','runId','attemptId','kind','occurredAt','source','data'],null);
    for (const key of ['eventId','taskId','actorId']) id(event[key],key);
    for (const key of ['runId','attemptId']) id(event[key],key,true);
    for (const key of ['actorLabel','roleLabel']) text(event[key],key,true);
    if (event.attemptId !== null && event.runId === null) fail('runId','An attempt requires a run ID.');
    if (event.occurredAt !== null && !validTimestamp(event.occurredAt)) fail('occurredAt','Use a valid UTC calendar timestamp YYYY-MM-DDTHH:mm:ss.sssZ or null.');
    exact(event.source,['producerId','label','synthetic'],'source');
    id(event.source.producerId,'source.producerId');
    text(event.source.label,'source.label');
    if (typeof event.source.synthetic !== 'boolean') fail('source.synthetic','Use true for synthetic examples or false for other producer reports.');
    if (typeof event.kind !== 'string' || !Object.hasOwn(payloads,event.kind)) fail('kind','Use one of the documented v1 event kinds.');
    exact(event.data,payloads[event.kind],'data');
    if (event.kind !== 'consultation' && event.runId === null) fail('runId','This event kind requires a run ID.');
    if (['assignment','block','resolution','handoff','revision','completion'].includes(event.kind) && event.attemptId === null) fail('attemptId','This event kind requires an attempt ID.');
    for (const key of payloads[event.kind]) {
      const value = event.data[key], path = `data.${key}`;
      if (key.endsWith('Id')) id(value,path,['parentRunId','nextActorId'].includes(key));
      if (['reason','question','summary'].includes(key)) text(value,path);
    }
    if (event.kind === 'revision' && event.data.previousAttemptId === event.attemptId) fail('data.previousAttemptId','Reference a different previous attempt ID.');
    if (['review','qa'].includes(event.kind) && !['passed','failed','unknown'].includes(event.data.outcome)) fail('data.outcome','Use passed, failed or unknown.');
    if (event.kind === 'runtime') {
      for (const key of ['configured','verified']) {
        exact(event.data[key],['model','effort'],`data.${key}`);
        for (const field of ['model','effort']) text(event.data[key][field],`data.${key}.${field}`,true);
      }
      const {verified,verification} = event.data;
      if (verified.model === null && verified.effort === null) {
        if (verification !== null) fail('data.verification','Use null when all verified values are unknown.');
      } else {
        exact(verification,['method','verifierActorId','evidenceRef','summary'],'data.verification');
        if (verification.method !== 'tool') fail('data.verification.method','Use tool and include its reported verification basis.');
        id(verification.verifierActorId,'data.verification.verifierActorId');
        text(verification.evidenceRef,'data.verification.evidenceRef');
        text(verification.summary,'data.verification.summary');
      }
    }
  });
}
