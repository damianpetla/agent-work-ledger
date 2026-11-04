# Received-record graph API

`web/graph/project.js` exports one dependency-free ES-module function:

```js
import {projectTask} from './graph/project.js';
const graph = projectTask(acceptedSnapshot, selectedTaskId);
// {taskId, nodes, edges, diagnostics, eventIds}
```

Pass `emptySnapshot()` or a successful snapshot from the [import API](import-api.md), plus an exact task ID string. Parsed producer envelopes, caller-edited snapshots and snapshot hydration are unsupported. Detectably invalid argument shapes throw `TypeError`; arbitrary unsupported objects have no validation guarantee. Missing, invalid, cyclic and conflicting **accepted evidence** never throws or rejects an import. An unknown task returns `{taskId, nodes:[], edges:[], diagnostics:[], eventIds:[]}`.

The function does not mutate input or use DOM, layout, framework, network, storage or clock. Equivalent accepted event sets produce deeply equal output regardless of receipt values, import order, object-key order or occurrence-time ties/nulls. Arrays of nodes/diagnostics sort by ASCII ID; edges sort by originating event ID then the fixed relation order below. `eventIds` is the complete selected-task source index in ASCII event-ID order, **not timeline order**. Use the import API's `timeline` for occurrence-time ordering.

## Records and identities

All IDs are opaque JSON-serialized **typed tuples**, not strings assembled with delimiters. Treat them as strings when storing selection. Examples: `["actor","p:actor"]`, `["run","p:run"]`, `["attempt","p:attempt"]`, `["event","p:event"]`. Labels never determine identity. Reference IDs are `["reference",eventId,field]`; edge IDs are `["edge",eventId,kind,source,target]`. They are stable under equivalent accepted sets. New evidence may change validity or add/remove a reference placeholder.

Every node has `{id, kind, label, facts, sourceEventIds}`. `label` is a truthful kind plus ID (or diagnostic code plus reference), never a generated work title. Render all strings as text. `sourceEventIds` is sorted and unique; present separate named source actions for every ID. There is no primary/canonical producer JSON for an entity supported by multiple events.

| Node kind | `facts` |
| --- | --- |
| `actor` | `{actorId, labels:[{eventId,actorLabel,roleLabel}]}`. Labels belong **only** to events whose envelope actorId is this actor; all declarations, including contradictions, remain separate. A participant with no own report has no label. |
| `run` | `{runId, assignedActorIds, bindingStatus}`. Assigned actors come only from explicit assignment `toActorId`, never the envelope reporter. Empty means unrecorded; multiple means ambiguous. |
| `attempt` | `{attemptId, runIds, bindingStatus}`. Never contains an inherited outcome. |
| `event` | `{eventKind, reporterActorId, runId, attemptId, data, basis:'producer declaration'}`. One evidence node for **every** selected event, including runtime/completion/block and records with no edge. `data` retains the event's exact kind-specific facts; this is a projection, not the exact producer envelope. The accepted frozen data object is shared read-only. Runtime configured/verified/verification remain distinct declarations, including reported tool basis. |
| `reference` | `{referenceKind, referenceId, code}`. An unresolved/invalid/ambiguous endpoint; never a fabricated execution. |

`bindingStatus` is `consistent` or `ambiguous`. Consistency means no received contradiction, not verification. Run task conflicts or several assigned actors are ambiguous; attempt task/run conflicts and ambiguity of its bound run are ambiguous. Reporter identity never binds execution ownership. IDs shared across kinds remain distinct; when the required kind is absent but that ID names another known identity, the reference is wrong-kind. Merely mentioning an unknown target does not create its run/attempt.

## Explicit relations

Every edge is `{id, kind, source, target, sourceEventIds:[originEventId], validity}`. Endpoints always name output nodes. `validity` is `valid`, `unresolved`, `invalid` or `ambiguous`. **Follow only valid edges as relations**. Other edges terminate at reference nodes (possibly on either end); expose their diagnostics and sources rather than presenting them as established links.

| Origin | Edge kind / direction, in emission order |
| --- | --- |
| assignment | `assignment`: from actor → to actor; `assigned-run`: to actor → assigned run; `assigned-attempt`: run → initial attempt; optional `parent-run`: explicit parent run → assigned run. Parent link never picks a parent attempt. Participant assignment stays explicit even if its execution binding is ambiguous. |
| consultation | `consultation`: envelope attempt, otherwise run, otherwise reporting actor → named toActorId. Advice only; no assignment. |
| handoff | `handoff`: envelope attempt → named toActorId. Never points to a later run/attempt. |
| revision | `revision`: explicit previous attempt → envelope new attempt, requiring consistent bindings to the stated run. |
| review / qa | `review` / `qa`: this event evidence node → data.targetAttemptId. Envelope run/attempt is check context; target may be in a different run. Outcome is on this event only. |
| resolution | `resolution`: this event evidence node → exact block event, only if task, run and attempt match and bindings are consistent. |

Block `reason`/`nextActorId` remain event facts. No open-block count, owner, next-actor, waiting or task certification is computed. Runtime and completion add no relation. No QA→revision edge arises from adjacency or time. A passed earlier check never migrates to a new attempt. Missing actor labels are not filled from a reporter's role.

For example an accepted assignment `eventId:'assign'`, from `sender` to `worker`, `runId:'r'`, `attemptId:'a'` has these edges (IDs omitted here only for readability):

```js
[
  {kind:'assignment', source:'["actor","sender"]', target:'["actor","worker"]', sourceEventIds:['assign'], validity:'valid'},
  {kind:'assigned-run', source:'["actor","worker"]', target:'["run","r"]', sourceEventIds:['assign'], validity:'valid'},
  {kind:'assigned-attempt', source:'["run","r"]', target:'["attempt","a"]', sourceEventIds:['assign'], validity:'valid'}
]
```

## Diagnostics and source inspection

Diagnostics have `{id, code, referenceKind, referenceId, nodeIds, sourceEventIds}`. Codes: `missing_reference` (unresolved), `wrong_kind`, `cross_task`, `wrong_run`, `wrong_scope` (invalid), `conflicting_binding` (ambiguous), and `cycle` (informational, edges remain valid). Cross-task IDs never become valid links. Resolution targets must specifically be block events. Conflicts are retained, never resolved by newest record. Every ambiguous entity has a diagnostic; additional origin-specific diagnostics explain rejected relations. Explicit directed cycles are detected with bounded visited traversal; there is no cycle prohibition, causal-chain selection or general layout engine.

Resolve **all source actions against the accepted snapshot's full eventId map**, and show the matching separate receipt from that map. The projection never creates receipts. Most sources belong to the selected task; a binding-conflict diagnostic can also name an accepted event from another task to expose the exact contradiction. It does not add that task's nodes or events to the selected task index. `eventIds` plus event evidence nodes retain every selected record, including disconnected records. Diagnostics and projections are not exact producer JSON; the inspector must display the original accepted event.

## Checks and boundary

From repository root, Node 23.7.0 (observed host target):

```sh
node web/tests/graph/check.mjs
```

No dependency installation or browser is needed for these pure public-API tests. They create accepted snapshots through real `importBytes` using public synthetic metadata and deterministic clock/receipt dependencies, not hand-built graph fixtures. [Author evidence](../web/tests/graph/evidence.md) records actual counts/RED→GREEN and the separate unchanged browser importer regression. DAM-35 supplies this module only; DAM-36 consumes the accepted module in the ordinary D application. Independent source review precedes integration; DAM-30 retains integrated QA and user evaluation. Derived waiting/next-actor aggregation remains residual DAM-31. No schema/importer/UI change is included here.
