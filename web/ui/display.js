// Presentation grouping only: no new relations, ownership or outcome projection.
export function displayGraph(graph){
 const byId=new Map(graph.nodes.map(n=>[n.id,n]));
 const endpoints=new Set(graph.edges.flatMap(e=>[e.source,e.target]));
 const otherEvidence=graph.nodes.filter(n=>n.kind==='event'&&!['qa','review'].includes(n.facts.eventKind)&&!endpoints.has(n.id));
 const hidden=new Set(otherEvidence.map(n=>n.id));
 function actorLabel(id){const a=byId.get(JSON.stringify(['actor',id]));const labels=[...new Set(a?.facts.labels.map(l=>l.actorLabel).filter(Boolean)||[])];return labels.length===1?labels[0]:id}
 const nodes=graph.nodes.filter(n=>!hidden.has(n.id)).map(n=>{
  let title=n.label,context=n.kind,summary='',tone='';
  if(n.kind==='actor'){title=actorLabel(n.facts.actorId);context=n.facts.actorId;summary=n.facts.labels.length?'Declared participant':'Label unrecorded'}
  if(n.kind==='run'){title='Run '+n.facts.runId;context=n.facts.bindingStatus==='ambiguous'?'Ambiguous binding':'Run context';summary=n.facts.assignedActorIds.length?n.facts.assignedActorIds.map(actorLabel).join(' / '):'Assigned actor unrecorded'}
  if(n.kind==='attempt'){title='Attempt '+n.facts.attemptId;context=n.facts.bindingStatus==='ambiguous'?'Ambiguous binding':'Run '+n.facts.runIds.join(' / ');summary=n.sourceEventIds.length+' source records'}
  if(n.kind==='event'){const f=n.facts;context='Reported by '+actorLabel(f.reporterActorId);title=['qa','review'].includes(f.eventKind)?f.eventKind.toUpperCase()+' · target '+f.data.targetAttemptId:f.eventKind+' · '+n.sourceEventIds[0];summary=f.data.outcome?f.data.outcome+' reported — '+f.data.summary:(f.data.reason||f.data.summary||'Explicit event reference');tone=f.data.outcome==='failed'?'failed':f.data.outcome==='passed'?'passed':''}
  if(n.kind==='reference'){context=n.facts.referenceKind;title=(n.facts.code==='missing_reference'?'Unresolved':n.facts.code==='conflicting_binding'?'Ambiguous':'Invalid')+' · '+n.facts.referenceId;summary=n.facts.code;tone='warning'}
  return {id:n.id,data:{entity:n,kind:n.kind,title,context,summary,tone,sources:n.sourceEventIds}};
 });
 return {nodes,edges:graph.edges,otherEvidence};
}
