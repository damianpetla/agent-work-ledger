import assert from 'node:assert/strict';
import {importBytes, emptySnapshot} from '../../import/index.js';
import {projectTask} from '../../graph/project.js';
const results = [];
function test(name, run) {
  try { run(); results.push(`PASS ${name}`); }
  catch (error) { results.push(`FAIL ${name}: ${error.message}`); process.exitCode = 1; }
}
function event(eventId, kind, data, extra = {}) {
  return {eventId, taskId:'t', actorId:'reporter', actorLabel:'Reporter', roleLabel:'Coordinator', runId:'r', attemptId:'a', kind, occurredAt:null, source:{producerId:'test',label:'Synthetic test',synthetic:true},data,...extra};
}
function snapshot(events) {
  const imported = importBytes(emptySnapshot(), new TextEncoder().encode(JSON.stringify({formatVersion:1, events})), {now:()=> '2026-11-04T00:00:00.000Z',receiptId:id=>'receipt:'+id});
  assert.equal(imported.ok,true,JSON.stringify(imported.error));
  return imported.snapshot;
}
const assignment = event('assign','assignment',{fromActorId:'sender',toActorId:'worker',parentRunId:null});
const relations = graph => graph.edges.map(({kind,source,target,sourceEventIds,validity})=>({kind,source,target,sourceEventIds,validity}));
test('assignment links explicit participants and assigned execution, not reporter ownership',()=>{
  const graph = projectTask(snapshot([assignment]),'t');
  assert.deepEqual(relations(graph),[
    {kind:'assignment',source:'["actor","sender"]',target:'["actor","worker"]',sourceEventIds:['assign'],validity:'valid'},
    {kind:'assigned-run',source:'["actor","worker"]',target:'["run","r"]',sourceEventIds:['assign'],validity:'valid'},
    {kind:'assigned-attempt',source:'["run","r"]',target:'["attempt","a"]',sourceEventIds:['assign'],validity:'valid'}
  ]);
  assert.deepEqual(graph.nodes.find(node=>node.id==='["actor","worker"]').facts,{actorId:'worker',labels:[]});
  assert.deepEqual(graph.eventIds,['assign']);
});
test('parent run, advice, actor handoff, revision and checks express only explicit relations',()=>{
  const graph = projectTask(snapshot([
    event('parent','assignment',{fromActorId:'sender',toActorId:'lead',parentRunId:null},{runId:'p',attemptId:'pa'}),
    {...assignment,data:{...assignment.data,parentRunId:'p'}},
    event('advice','consultation',{toActorId:'advisor',question:'Advice only'},{runId:null,attemptId:null}),
    event('handoff','handoff',{toActorId:'checker',reason:'Inspect work'}),
    event('fail','qa',{targetAttemptId:'a',outcome:'failed',summary:'Fix needed'},{runId:'check',attemptId:null}),
    event('rev','revision',{previousAttemptId:'a',reason:'New try'},{attemptId:'a2'}),
    event('pass','qa',{targetAttemptId:'a2',outcome:'passed',summary:'Rechecked'},{runId:'check',attemptId:null})
  ]),'t');
  const extra = relations(graph).filter(edge=>!['assignment','assigned-run','assigned-attempt'].includes(edge.kind));
  assert.deepEqual(extra,[
    {kind:'consultation',source:'["actor","reporter"]',target:'["actor","advisor"]',sourceEventIds:['advice'],validity:'valid'},
    {kind:'parent-run',source:'["run","p"]',target:'["run","r"]',sourceEventIds:['assign'],validity:'valid'},
    {kind:'qa',source:'["event","fail"]',target:'["attempt","a"]',sourceEventIds:['fail'],validity:'valid'},
    {kind:'handoff',source:'["attempt","a"]',target:'["actor","checker"]',sourceEventIds:['handoff'],validity:'valid'},
    {kind:'qa',source:'["event","pass"]',target:'["attempt","a2"]',sourceEventIds:['pass'],validity:'valid'},
    {kind:'revision',source:'["attempt","a"]',target:'["attempt","a2"]',sourceEventIds:['rev'],validity:'valid'}
  ]);
  assert.equal(graph.nodes.find(node=>node.id==='["event","fail"]').facts.data.outcome,'failed');
  assert.equal(graph.nodes.find(node=>node.id==='["event","pass"]').facts.data.outcome,'passed');
  assert.equal(Object.hasOwn(graph.nodes.find(node=>node.id==='["attempt","a2"]').facts,'outcome'),false);
  assert.deepEqual(graph.diagnostics,[]);
});

for (const [name,target,other,code,validity] of [
  ['missing','absent',[], 'missing_reference','unresolved'],
  ['wrong kind','assign',[], 'wrong_kind','invalid'],
  ['cross task','foreign',[event('foreign-event','completion',{summary:'Elsewhere'},{taskId:'other',runId:'foreign-run',attemptId:'foreign'})], 'cross_task','invalid'],
  ['conflicting attempt','a',[event('binding','completion',{summary:'Conflicting run'},{runId:'other-run'})], 'conflicting_binding','ambiguous'],
  ['conflicting run actor','a',[event('binding','assignment',{fromActorId:'sender',toActorId:'other-worker',parentRunId:null})], 'conflicting_binding','ambiguous']
]) test(`QA ${name} target is diagnostic, never a valid check link`,()=>{
  const graph = projectTask(snapshot([assignment,...other,event('q','qa',{targetAttemptId:target,outcome:'passed',summary:'Only a report'},{runId:'checker',attemptId:null})]),'t');
  const relation = graph.edges.find(edge=>edge.kind==='qa');
  assert.equal(relation.validity,validity);
  assert.equal(relation.target,'["reference","q","data.targetAttemptId"]');
  assert.ok(graph.diagnostics.some(item=>item.code===code && item.sourceEventIds.includes('q')));
  assert.equal(graph.nodes.find(node=>node.id===relation.target).facts.referenceId,target);
});

test('resolution links only the exact block with matching task/run/attempt scope',()=>{
  const block = event('block','block',{reason:'Await input',nextActorId:'supplier'});
  for (const [target,extra,code] of [
    ['block',[],null], ['absent',[],'missing_reference'], ['assign',[],'wrong_kind'],
    ['foreign-block',[event('foreign-block','block',{reason:'Other task',nextActorId:null},{taskId:'other'})],'cross_task'],
    ['other-block',[event('other-block','block',{reason:'Other attempt',nextActorId:null},{attemptId:'other-a'})],'wrong_scope']
  ]) {
    const graph = projectTask(snapshot([assignment,block,...extra,event('resolve','resolution',{blockEventId:target})]),'t');
    const link = graph.edges.find(edge=>edge.kind==='resolution');
    assert.equal(link.source,'["event","resolve"]');
    assert.deepEqual(link.sourceEventIds,['resolve']);
    assert.equal(link.validity,code===null?'valid':code==='missing_reference'?'unresolved':'invalid');
    if (code) assert.ok(graph.diagnostics.some(item=>item.code===code && item.sourceEventIds.includes('resolve')));
    else assert.equal(link.target,'["event","block"]');
    assert.equal(graph.nodes.some(node=>Object.hasOwn(node.facts,'openBlocks')),false);
  }
});
test('revision cannot follow a previous attempt from another run',()=>{
  const graph = projectTask(snapshot([assignment,event('revision','revision',{previousAttemptId:'a',reason:'Wrong run'},{runId:'second',attemptId:'b'})]),'t');
  assert.equal(graph.edges.find(edge=>edge.kind==='revision').validity,'invalid');
  assert.ok(graph.diagnostics.some(item=>item.code==='wrong_run'));
});
test('cycles remain navigable and explicitly diagnostic',()=>{
  const graph = projectTask(snapshot([
    {...assignment,data:{...assignment.data,parentRunId:'p'}},
    event('parent','assignment',{fromActorId:'sender',toActorId:'worker',parentRunId:'r'},{runId:'p',attemptId:'pa'})
  ]),'t');
  assert.deepEqual(graph.edges.filter(edge=>edge.kind==='parent-run').map(edge=>[edge.source,edge.target,edge.validity]),[
    ['["run","p"]','["run","r"]','valid'], ['["run","r"]','["run","p"]','valid']
  ]);
  assert.ok(graph.diagnostics.some(item=>item.code==='cycle' && item.sourceEventIds.includes('assign') && item.sourceEventIds.includes('parent')));
});

test('unknown and empty tasks have no fabricated nodes',()=>{
  assert.deepEqual(projectTask(emptySnapshot(),'unknown'),{taskId:'unknown',nodes:[],edges:[],diagnostics:[],eventIds:[]});
  assert.deepEqual(projectTask(snapshot([assignment]),'unknown'),{taskId:'unknown',nodes:[],edges:[],diagnostics:[],eventIds:[]});
});
test('single context-free advice record is source-complete without invented run',()=>{
  const graph = projectTask(snapshot([event('single','consultation',{toActorId:'reporter',question:'Self advice'},{runId:null,attemptId:null,actorLabel:null,roleLabel:null})]),'t');
  assert.deepEqual(graph.nodes.map(node=>node.id),['["actor","reporter"]','["event","single"]']);
  assert.deepEqual(graph.eventIds,['single']);
  assert.deepEqual(graph.edges.map(edge=>[edge.kind,edge.source,edge.target]),[['consultation','["actor","reporter"]','["actor","reporter"]']]);
});
test('typed IDs preserve delimiter-bearing and overlapping actor/run/attempt identities',()=>{
  const graph = projectTask(snapshot([event('x','assignment',{fromActorId:'a:b',toActorId:'a',parentRunId:null},{runId:'a:b',attemptId:'a'}),event('y','completion',{summary:'Distinct'},{runId:'a',attemptId:'b:a',actorId:'b:a'})]),'t');
  for (const expected of ['["actor","a:b"]','["actor","a"]','["actor","b:a"]','["run","a:b"]','["run","a"]','["attempt","a"]','["attempt","b:a"]']) assert.ok(graph.nodes.some(node=>node.id===expected),expected);
  assert.equal(new Set(graph.nodes.map(node=>node.id)).size,graph.nodes.length);
  assert.equal(new Set(graph.edges.map(edge=>edge.id)).size,graph.edges.length);
});
test('branches and disconnected records retain all edges and exact separate sources',()=>{
  const graph = projectTask(snapshot([
    assignment,
    event('branch','assignment',{fromActorId:'sender',toActorId:'other',parentRunId:'r'},{runId:'s',attemptId:'b'}),
    event('branch2','assignment',{fromActorId:'sender',toActorId:'third',parentRunId:'r'},{runId:'u',attemptId:'c'}),
    event('island','completion',{summary:'Disconnected declaration'},{runId:'island',attemptId:'ia'})
  ]),'t');
  assert.deepEqual(graph.eventIds,['assign','branch','branch2','island']);
  assert.deepEqual(graph.edges.filter(edge=>edge.kind==='parent-run').map(edge=>[edge.source,edge.target,edge.sourceEventIds]),[
    ['["run","r"]','["run","s"]',['branch']],['["run","r"]','["run","u"]',['branch2']]
  ]);
  assert.equal(graph.edges.some(edge=>edge.target==='["run","island"]'),false);
  assert.deepEqual(graph.nodes.find(node=>node.id==='["event","island"]').sourceEventIds,['island']);
});
test('multiple runtime and completion reports stay separate producer facts',()=>{
  const configured = {model:'configured-model',effort:'medium'}, verified = {model:null,effort:null};
  const records = [event('runtime1','runtime',{configured,verified,verification:null},{attemptId:null}),event('runtime2','runtime',{configured:{model:'different',effort:null},verified,verification:null},{attemptId:null}),event('done','completion',{summary:'Reported completion'})];
  const graph = projectTask(snapshot(records),'t');
  assert.deepEqual(graph.eventIds,['done','runtime1','runtime2']);
  assert.deepEqual(graph.edges,[]);
  assert.equal(graph.nodes.find(node=>node.id==='["event","runtime1"]').facts.data.configured.model,'configured-model');
  assert.equal(graph.nodes.find(node=>node.id==='["event","runtime2"]').facts.data.configured.model,'different');
  assert.equal(graph.nodes.find(node=>node.id==='["event","done"]').facts.basis,'producer declaration');
});
test('reporter labels never leak to target; conflicting labels have separate event actions',()=>{
  const graph = projectTask(snapshot([assignment,event('label2','runtime',{configured:{model:null,effort:null},verified:{model:null,effort:null},verification:null},{actorLabel:'Alternate',roleLabel:'Arbitrary role',attemptId:null})]),'t');
  assert.deepEqual(graph.nodes.find(node=>node.id==='["actor","worker"]').facts.labels,[]);
  assert.deepEqual(graph.nodes.find(node=>node.id==='["actor","reporter"]').facts.labels,[{eventId:'assign',actorLabel:'Reporter',roleLabel:'Coordinator'},{eventId:'label2',actorLabel:'Alternate',roleLabel:'Arbitrary role'}]);
  assert.deepEqual(graph.nodes.find(node=>node.id==='["run","r"]').sourceEventIds,['assign','label2']);
});
test('projection is unchanged across import order, timestamp ties/nulls and duplicate receipts',()=>{
  const records = [assignment,event('z','completion',{summary:'Null time'}),event('b','consultation',{toActorId:'advisor',question:'Known time'},{occurredAt:'2026-11-04T01:00:00.000Z'}),event('c','handoff',{toActorId:'recipient',reason:'Known tie'},{occurredAt:'2026-11-04T01:00:00.000Z'})];
  const expected = projectTask(snapshot(records),'t');
  let accumulated = emptySnapshot();
  for (const record of [...records].reverse()) {
    const result = importBytes(accumulated,new TextEncoder().encode(JSON.stringify({formatVersion:1,events:[record]})),{now:()=> '2026-11-04T02:00:00.000Z',receiptId:id=>'other:'+id});
    assert.equal(result.ok,true); accumulated=result.snapshot;
  }
  assert.deepEqual(projectTask(accumulated,'t'),expected);
  const repeated = importBytes(accumulated,new TextEncoder().encode(JSON.stringify({formatVersion:1,events:records}))); assert.equal(repeated.acceptedCount,0);
  assert.deepEqual(projectTask(repeated.snapshot,'t'),expected);
  assert.deepEqual(expected.eventIds,['assign','b','c','z']);
});
test('accepted input remains deeply frozen and byte-equivalent after projection',()=>{
  const input = snapshot([assignment]); const before = JSON.stringify(input);
  const graph = projectTask(input,'t');
  graph.nodes[0].sourceEventIds.push('caller-only');
  assert.equal(JSON.stringify(input),before);
  assert.ok(Object.isFrozen(input.events[0].data));
  assert.deepEqual(projectTask(input,'t').nodes[0].sourceEventIds,['assign']);
});
for (const kind of ['review','qa']) test(`${kind} unknown outcome targets another run explicitly, no check-context target`,()=>{
  const graph = projectTask(snapshot([assignment,event('check',kind,{targetAttemptId:'a',outcome:'unknown',summary:'No result'},{runId:'review-run',attemptId:'review-attempt',actorId:'worker'})]),'t');
  assert.deepEqual(graph.edges.filter(edge=>edge.kind===kind).map(edge=>[edge.source,edge.target,edge.sourceEventIds,edge.validity]),[['["event","check"]','["attempt","a"]',['check'],'valid']]);
  assert.equal(graph.nodes.find(node=>node.id==='["event","check"]').facts.data.outcome,'unknown');
});
for (const [name,key,others,code] of [
  ['missing','missing',[],'missing_reference'], ['wrong kind','assign',[],'wrong_kind'],
  ['foreign','foreign-run',[event('foreign','completion',{summary:'Other task'},{taskId:'other',runId:'foreign-run',attemptId:'foreign-attempt'})],'cross_task']
]) test(`parent ${name} run never invents a valid endpoint`,()=>{
  const graph = projectTask(snapshot([{...assignment,data:{...assignment.data,parentRunId:key}},...others]),'t');
  const link = graph.edges.find(edge=>edge.kind==='parent-run');
  assert.notEqual(link.validity,'valid');
  assert.equal(link.source,'["reference","assign","data.parentRunId"]');
  assert.ok(graph.diagnostics.some(item=>item.code===code));
});
test('all edges have actual endpoints and every source action resolves to accepted JSON',()=>{
  const input = snapshot([assignment,event('q','qa',{targetAttemptId:'missing',outcome:'failed',summary:'Unknown target'},{attemptId:null})]);
  const graph = projectTask(input,'t'), ids = new Set(graph.nodes.map(node=>node.id));
  for (const edge of graph.edges) { assert.ok(ids.has(edge.source)); assert.ok(ids.has(edge.target)); }
  for (const item of [...graph.nodes,...graph.edges,...graph.diagnostics]) for (const source of item.sourceEventIds) assert.ok(input.events.some(event=>event.eventId===source));
  assert.deepEqual(graph.eventIds,['assign','q']);
});
test('programmer misuse is explicit TypeError, not a data diagnostic',()=>{
  assert.throws(()=>projectTask(null,'t'),TypeError);
  assert.throws(()=>projectTask(emptySnapshot(),null),TypeError);
});

test('wrong-kind references also recognize actor participants and run/attempt identities',()=>{
  const graph = projectTask(snapshot([assignment,event('q','qa',{targetAttemptId:'worker',outcome:'unknown',summary:'Actor is not attempt'},{attemptId:null}),event('res','resolution',{blockEventId:'a'})]),'t');
  assert.deepEqual(graph.diagnostics.filter(item=>item.sourceEventIds.includes('q') || item.sourceEventIds.includes('res')).map(item=>[item.referenceId,item.code]).sort(),[['a','wrong_kind'],['worker','wrong_kind']]);
});
test('cross-task reused execution IDs expose the exact conflicting source records',()=>{
  const graph = projectTask(snapshot([assignment,event('foreign','assignment',{fromActorId:'sender',toActorId:'other',parentRunId:null},{taskId:'other'})]),'t');
  const diagnostic = graph.diagnostics.find(item=>item.code==='conflicting_binding' && item.referenceKind==='run' && item.nodeIds.includes('["run","r"]'));
  assert.deepEqual(diagnostic.sourceEventIds,['assign','foreign']);
});
console.log(results.join('\n'));
console.log(`TOTAL ${results.length} PASS ${results.filter(line=>line.startsWith('PASS')).length} FAIL ${results.filter(line=>line.startsWith('FAIL')).length} SKIP 0`);
