import {emptySnapshot, importBytes, taskIds, timeline} from './import/index.js';

const $ = selector => document.querySelector(selector);
const fileInput = $('#event-file');
let snapshot = emptySnapshot();
let selectedTask = null;
let selectedEvent = null;
let busy = false;

// Producer strings enter the document only through textContent.
function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
const known = value => value === null ? 'unknown' : value;
const timestamp = value => value === null ? 'unknown' : value.replace('T',' ').replace('Z',' UTC');
const kindLabels = {assignment:'Assignment / delegation',consultation:'Consultation',block:'Reported block',resolution:'Reported resolution',handoff:'Handoff',revision:'Revision',review:'Reported review',qa:'Reported QA',completion:'Reported completion',runtime:'Runtime report'};
function heading(event) {
  const data = event.data;
  switch (event.kind) {
    case 'assignment': return `${data.fromActorId} → ${data.toActorId}`;
    case 'consultation': return `Consultation to ${data.toActorId}`;
    case 'block': return 'Block reported for this attempt';
    case 'resolution': return `Resolution references ${data.blockEventId}`;
    case 'handoff': return `Handoff to ${data.toActorId}`;
    case 'revision': return `${data.previousAttemptId} → ${event.attemptId}`;
    case 'review': case 'qa': return `${data.targetAttemptId}: reported ${data.outcome}`;
    case 'completion': return 'Completion reported for this attempt';
    case 'runtime': return 'Configured and reported runtime';
  }
}
function summary(event) {
  if (event.kind === 'assignment') return `Explicit work assignment · Parent run: ${known(event.data.parentRunId)}`;
  if (event.kind === 'runtime') return `Configured: ${known(event.data.configured.model)} · ${known(event.data.configured.effort)}\nVerified runtime model: ${known(event.data.verified.model)} · effort: ${known(event.data.verified.effort)}`;
  if (event.kind === 'consultation') return `${event.data.question}\nConsultation does not transfer responsibility.`;
  return event.data.reason ?? event.data.summary ?? `Referenced block: ${event.data.blockEventId}`;
}
function facts(entries) {
  const dl = element('dl',undefined,'facts');
  for (const [label,value] of entries) dl.append(element('dt',label),element('dd',known(value)));
  return dl;
}
function section(title, entries, note) {
  const node = element('section',undefined,'source-section');
  node.append(element('h3',title),facts(entries));
  if (note) node.append(element('p',note,'source-note'));
  return node;
}
function inspect(eventId, moveFocus = false) {
  const row = timeline(snapshot,selectedTask).find(row=>row.event.eventId === eventId);
  if (!row) return;
  selectedEvent = eventId;
  for (const button of document.querySelectorAll('.source-button')) {
    const selected = button.dataset.eventId === eventId;
    button.setAttribute('aria-pressed',String(selected));
    button.closest('li').classList.toggle('selected',selected);
  }
  const {event,receipt} = row;
  const content = $('#source-content');
  content.replaceChildren(element('p',event.eventId,'source-id'),element('p',`${kindLabels[event.kind]} · Producer declaration`,'provenance'));
  content.append(section('Source & correlation',[
    ['Source',event.source.label],['Producer',event.source.producerId],['Synthetic',event.source.synthetic ? 'Yes · synthetic example' : 'No · producer-reported'],
    ['Reporting actor',event.actorId],['Actor label',event.actorLabel],['Role label',event.roleLabel],['Task',event.taskId],['Run',event.runId],['Attempt',event.attemptId],['Occurred',timestamp(event.occurredAt)]
  ],'Source identity, labels and occurrence time are producer declarations.'));
  if (event.kind === 'runtime') {
    const {configured,verified,verification} = event.data;
    content.append(section('Configured (producer declaration)',[['Model',configured.model],['Effort',configured.effort]]));
    content.append(section('Verified runtime (reported)',[['Model',verified.model],['Effort',verified.effort]],verification ? 'Reported tool verification; the ledger does not certify its truth or independence.' : 'unknown · No reported tool verification basis.'));
    if (verification) content.append(section('Reported tool verification', [['Method',verification.method],['Verifier actor',verification.verifierActorId],['Evidence ref',verification.evidenceRef],['Summary',verification.summary]]));
  }
  content.append(section('Ledger receipt', [['Imported',timestamp(receipt.receivedAt)],['Receipt ID',receipt.receiptId],['Channel',receipt.channel]],'Confirms acceptance into this tab only. It does not verify the report, review quality or completion.'));
  for (const [title,value] of [['Exact producer event',event],['Separate ledger receipt',receipt]]) {
    const details = element('details',undefined,'raw-record');
    if (title === 'Exact producer event') details.open = true;
    details.append(element('summary',title),element('pre',JSON.stringify(value,null,2)));
    content.append(details);
  }
  const back = element('button','Return to selected event','return-button');back.type='button';
  back.addEventListener('click',()=>[...document.querySelectorAll('.source-button')].find(button=>button.dataset.eventId === selectedEvent)?.focus());
  content.append(back);
  if (moveFocus) $('#source-title').focus();
}
function render() {
  const ids = taskIds(snapshot);
  if (!ids.includes(selectedTask)) selectedTask = ids[0] ?? null;
  $('#task-count').textContent = String(ids.length);
  const tasks = $('#tasks');tasks.replaceChildren();
  if (!ids.length) tasks.append(element('p','Tasks appear after import.','muted'));
  for (const id of ids) {
    const rows = timeline(snapshot,id);
    const button = element('button',undefined,'task-button');button.type='button';button.dataset.taskId=id;
    button.setAttribute('aria-pressed',String(id === selectedTask));
    button.append(element('strong',id),element('small',`${rows.length} ${rows.length === 1 ? 'event' : 'events'}`));
    button.addEventListener('click',()=>{selectedTask=id;selectedEvent=null;render();[...tasks.querySelectorAll('button')].find(button=>button.dataset.taskId === id)?.focus();});
    tasks.append(button);
  }
  const rows = timeline(snapshot,selectedTask);
  $('#timeline-heading').textContent = selectedTask ?? 'Choose a file to begin';
  $('#event-count').textContent = `${rows.length} ${rows.length === 1 ? 'event' : 'events'}`;
  $('#empty-state').hidden = rows.length > 0;
  const list = $('#timeline');list.replaceChildren();list.hidden = !rows.length;
  for (const {event,receipt} of rows) {
    const card = element('li',undefined,'event-card');
    const top = element('div',undefined,'event-top');
    top.append(element('span',kindLabels[event.kind],`kind ${event.kind}`),element('span',event.source.synthetic ? 'SYNTHETIC' : 'DECLARED','badge'));
    const meta = element('div',undefined,'event-meta');
    meta.append(element('span',`Actor ${event.actorId}`),element('span',`Run ${known(event.runId)}`),element('span',`Attempt ${known(event.attemptId)}`));
    const times = element('div',undefined,'event-times');
    times.append(element('span',`Occurred · ${timestamp(event.occurredAt)}`),element('span',`Imported · ${timestamp(receipt.receivedAt)}`));
    const button = element('button','Inspect source →','source-button');button.type='button';button.dataset.eventId=event.eventId;
    button.setAttribute('aria-label',`Inspect source for ${event.eventId}`);button.setAttribute('aria-controls','source-content');
    button.addEventListener('click',()=>inspect(event.eventId,true));
    card.append(top,element('h3',heading(event)),element('p',summary(event),'event-summary'),meta,times,button);
    list.append(card);
  }
  if (rows.length) inspect(rows.some(row=>row.event.eventId === selectedEvent) ? selectedEvent : rows[0].event.eventId);
  else {selectedEvent=null;$('#source-content').replaceChildren(element('p','Select an event’s “Inspect source” button to see its exact producer record and separate ledger receipt.','muted'));}
}
function showError(error) {
  const location = [error.eventIndex === null ? null : `event ${error.eventIndex + 1}`,error.field,error.location ? `line ${error.location.line}, column ${error.location.column}` : null].filter(Boolean).join(' · ');
  const box = $('#import-error');box.textContent=`Import rejected · ${error.code}${location ? ` · ${location}` : ''}\n${error.message}\nYour previous workspace is unchanged.`;box.hidden=false;
  $('#import-status').textContent = 'Import failed. Existing tasks, events and receipts are preserved.';
}
fileInput.addEventListener('change',async()=>{
  const file = fileInput.files?.[0];
  if (!file || busy) return;
  busy=true;fileInput.disabled=true;$('#import-error').hidden=true;
  $('#import-status').textContent='Reading and validating the selected file…';
  try {
    if (file.size > 1048576) {showError({code:'input_limit',message:'Split the UTF-8 file into inputs of at most 1 MiB.',eventIndex:null,field:null});return;}
    const bytes = new Uint8Array(await file.arrayBuffer());
    const result = importBytes(snapshot,bytes,{now:()=>new Date().toISOString(),receiptId:()=>crypto.randomUUID()});
    if (!result.ok) {showError(result.error);return;}
    snapshot=result.snapshot;
    render();
    $('#import-status').textContent=`Import complete · ${result.acceptedCount} new, ${result.duplicateCount} duplicate events. ${snapshot.events.length} events in this tab. First receipts retained.`;
  } catch {
    showError({code:'file_read_error',message:'Could not read this file. Choose an accessible local JSON file and try again.',eventIndex:null,field:null});
  } finally {busy=false;fileInput.disabled=false;fileInput.value='';}
});
render();
