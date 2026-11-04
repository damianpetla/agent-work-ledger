// Pure received-record projection. IDs are serialized typed tuples, never display labels.
const id = (...parts) => JSON.stringify(parts);
const sorted = values => [...new Set(values)].sort();
const compare = (a,b) => a < b ? -1 : a > b ? 1 : 0;

export function projectTask(snapshot, taskId) {
  if (!snapshot || !Array.isArray(snapshot.events) || !Array.isArray(snapshot.receipts) || typeof taskId !== 'string') {
    throw new TypeError('Supply an accepted importer snapshot and a task ID string.');
  }
  const events = snapshot.events.filter(event=>event.taskId === taskId).sort((a,b)=>compare(a.eventId,b.eventId));
  const nodes = new Map(), edges = [], diagnostics = [];
  function node(kind, key, facts, eventId) {
    const keyId = id(kind,key);
    if (!nodes.has(keyId)) nodes.set(keyId,{id:keyId,kind,label:`${kind} ${key}`,facts,sourceEventIds:[]});
    const value = nodes.get(keyId);
    if (eventId) value.sourceEventIds.push(eventId);
    return keyId;
  }
  function edge(kind, source, target, eventId, validity = 'valid') {
    edges.push({id:id('edge',eventId,kind,source,target),kind,source,target,sourceEventIds:[eventId],validity});
  }
  for (const event of events) {
    const actor = node('actor',event.actorId,{actorId:event.actorId,labels:[]},event.eventId);
    if (event.actorLabel !== null || event.roleLabel !== null) nodes.get(actor).facts.labels.push({eventId:event.eventId,actorLabel:event.actorLabel,roleLabel:event.roleLabel});
    if (event.runId !== null) node('run',event.runId,{runId:event.runId,assignedActorIds:[]},event.eventId);
    if (event.attemptId !== null) node('attempt',event.attemptId,{attemptId:event.attemptId,runIds:[]},event.eventId);
    node('event',event.eventId,{eventKind:event.kind,reporterActorId:event.actorId,runId:event.runId,attemptId:event.attemptId,data:event.data,basis:'producer declaration'},event.eventId);
    if (event.kind === 'assignment') {
      node('actor',event.data.fromActorId,{actorId:event.data.fromActorId,labels:[]},event.eventId);
      node('actor',event.data.toActorId,{actorId:event.data.toActorId,labels:[]},event.eventId);
    } else if (event.kind === 'consultation' || event.kind === 'handoff') {
      node('actor',event.data.toActorId,{actorId:event.data.toActorId,labels:[]},event.eventId);
    }
  }
  // Only explicit assignment identifies a run's assigned actor. Reporters never do.
  const runs = new Map(), attempts = new Map();
  for (const event of snapshot.events) {
    if (event.runId !== null) {
      if (!runs.has(event.runId)) runs.set(event.runId,{tasks:new Set(),actors:new Set(),events:[]});
      const run = runs.get(event.runId); run.tasks.add(event.taskId); run.events.push(event);
      if (event.kind === 'assignment') run.actors.add(event.data.toActorId);
    }
    if (event.attemptId !== null) {
      if (!attempts.has(event.attemptId)) attempts.set(event.attemptId,{tasks:new Set(),runs:new Set(),events:[]});
      const attempt = attempts.get(event.attemptId); attempt.tasks.add(event.taskId); attempt.runs.add(event.runId); attempt.events.push(event);
    }
  }
  const runConflict = run => run.tasks.size > 1 || run.actors.size > 1;
  const attemptConflict = attempt => attempt.tasks.size > 1 || attempt.runs.size > 1 || [...attempt.runs].some(run=>runConflict(runs.get(run)));
  for (const value of nodes.values()) {
    let binding;
    if (value.kind === 'run') {
      binding = runs.get(value.facts.runId);
      value.facts.assignedActorIds = sorted(binding.actors);
      value.facts.bindingStatus = runConflict(binding) ? 'ambiguous' : 'consistent';
    }
    if (value.kind === 'attempt') {
      binding = attempts.get(value.facts.attemptId);
      value.facts.runIds = sorted(binding.runs);
      value.facts.bindingStatus = attemptConflict(binding) ? 'ambiguous' : 'consistent';
    }
    if (binding && value.facts.bindingStatus === 'ambiguous') {
      diagnostics.push({id:id('diagnostic',value.id,'conflicting_binding'),code:'conflicting_binding',referenceKind:value.kind,referenceId:value.facts.runId ?? value.facts.attemptId,nodeIds:[value.id],sourceEventIds:sorted(binding.events.map(event=>event.eventId))});
    }
  }
  function hasIdentity(key) {
    return snapshot.events.some(item=>[item.eventId,item.actorId,item.runId,item.attemptId,item.data.fromActorId,item.data.toActorId,item.data.nextActorId,item.data.verification?.verifierActorId].includes(key));
  }
  function reference(kind, key, event, field, expectedRun = null) {
    const binding = kind === 'run' ? runs.get(key) : attempts.get(key);
    let code = null;
    if (!binding) {
      const otherKind = hasIdentity(key);
      code = otherKind ? 'wrong_kind' : 'missing_reference';
    } else if (!binding.tasks.has(taskId)) code = 'cross_task';
    else if (kind === 'run' ? runConflict(binding) : attemptConflict(binding)) code = 'conflicting_binding';
    else if (expectedRun !== null && !binding.runs.has(expectedRun)) code = 'wrong_run';
    if (!code) {
      nodes.get(id(kind,key)).sourceEventIds.push(event.eventId);
      return {nodeId:id(kind,key),validity:'valid'};
    }
    return invalidReference(kind,key,event,field,code);
  }
  function invalidReference(kind, key, event, field, code) {
    const validity = code === 'missing_reference' ? 'unresolved' : code === 'conflicting_binding' ? 'ambiguous' : 'invalid';
    const nodeId = id('reference',event.eventId,field);
    nodes.set(nodeId,{id:nodeId,kind:'reference',label:`${code}: ${kind} ${key}`,facts:{referenceKind:kind,referenceId:key,code},sourceEventIds:[event.eventId]});
    diagnostics.push({id:id('diagnostic',event.eventId,field,code),code,referenceKind:kind,referenceId:key,nodeIds:[nodeId],sourceEventIds:[event.eventId]});
    return {nodeId,validity};
  }
  function relation(kind, source, target, event) {
    const validity = source.validity !== 'valid' ? source.validity : target.validity;
    edge(kind,source.nodeId,target.nodeId,event.eventId,validity);
  }
  const direct = nodeId => ({nodeId,validity:'valid'});
  for (const event of events) {
    const run = () => reference('run',event.runId,event,'runId');
    const attempt = () => reference('attempt',event.attemptId,event,'attemptId',event.runId);
    if (event.kind === 'assignment') {
      edge('assignment',id('actor',event.data.fromActorId),id('actor',event.data.toActorId),event.eventId);
      relation('assigned-run',direct(id('actor',event.data.toActorId)),run(),event);
      relation('assigned-attempt',run(),attempt(),event);
      if (event.data.parentRunId !== null) relation('parent-run',reference('run',event.data.parentRunId,event,'data.parentRunId'),run(),event);
    } else if (event.kind === 'consultation' || event.kind === 'handoff') {
      const source = event.attemptId !== null ? attempt() : event.runId !== null ? run() : direct(id('actor',event.actorId));
      relation(event.kind,source,direct(id('actor',event.data.toActorId)),event);
    } else if (event.kind === 'revision') {
      relation('revision',reference('attempt',event.data.previousAttemptId,event,'data.previousAttemptId',event.runId),attempt(),event);
    } else if (event.kind === 'resolution') {
      const block = snapshot.events.find(item=>item.eventId === event.data.blockEventId);
      let code = !block ? (hasIdentity(event.data.blockEventId) ? 'wrong_kind' : 'missing_reference') : block.kind !== 'block' ? 'wrong_kind' : block.taskId !== taskId ? 'cross_task' : block.runId !== event.runId || block.attemptId !== event.attemptId ? 'wrong_scope' : null;
      if (!code && (runConflict(runs.get(event.runId)) || attemptConflict(attempts.get(event.attemptId)))) code = 'conflicting_binding';
      const target = code ? invalidReference('block',event.data.blockEventId,event,'data.blockEventId',code) : direct(id('event',block.eventId));
      relation('resolution',direct(id('event',event.eventId)),target,event);
    } else if (event.kind === 'review' || event.kind === 'qa') {
      relation(event.kind,direct(id('event',event.eventId)),reference('attempt',event.data.targetAttemptId,event,'data.targetAttemptId'),event);
    }
  }
  // Mark explicit directed cycles without rejecting them or traversing indefinitely.
  const validEdges = edges.filter(value=>value.validity === 'valid');
  const outgoing = new Map();
  for (const value of validEdges) {
    if (!outgoing.has(value.source)) outgoing.set(value.source,[]);
    outgoing.get(value.source).push(value);
  }
  for (const value of validEdges) {
    const queue = [{nodeId:value.target,sources:value.sourceEventIds}], visited = new Set();
    for (let index = 0; index < queue.length; index++) {
      const current = queue[index];
      if (current.nodeId === value.source) {
        diagnostics.push({id:id('diagnostic','cycle',value.id),code:'cycle',referenceKind:null,referenceId:null,nodeIds:[value.source,value.target],sourceEventIds:sorted(current.sources)});
        break;
      }
      if (visited.has(current.nodeId)) continue;
      visited.add(current.nodeId);
      for (const next of outgoing.get(current.nodeId) ?? []) {
        if (!visited.has(next.target)) queue.push({nodeId:next.target,sources:[...current.sources,...next.sourceEventIds]});
      }
    }
  }
  // A reference may support multiple edges; diagnostics and source actions remain unique.
  const diagnosticById = new Map(diagnostics.map(value=>[value.id,value]));
  return {taskId,nodes:[...nodes.values()].sort((a,b)=>compare(a.id,b.id)).map(value=>({...value,sourceEventIds:sorted(value.sourceEventIds)})),edges,diagnostics:[...diagnosticById.values()].sort((a,b)=>compare(a.id,b.id)),eventIds:events.map(event=>event.eventId)};
}
