# Event contract v1

**Tech Lead · gpt-6.1-sol · medium (configured)**

The browser file importer implements these producer-event rules. Durable receipt implementation follows the separately versioned [ledger service contract](ledger-api.md); this document does not establish that service exists. [Product terms](product-brief.md#terminology) remain canonical. No provider, role vocabulary, tracker or orchestrator is required.

## Envelope and identity

The file format is UTF-8 JSON (strict decoding rejects invalid UTF-8 bytes; a leading BOM is explicitly rejected with guidance to save UTF-8 without BOM). The import boundary accepts raw bytes or raw JSON text, never an already-parsed object. The envelope is: `{ "formatVersion": 1, "events": [...] }`. One file may contain several tasks; the viewer selects one task. Limits: 1 MiB encoded input, 1,000 events per import or receipt batch. No JSON duplicate object keys, non-finite numbers or unknown fields are accepted. Version other than 1 is an explicit unsupported-version error. V1 changes that alter meaning require a new formatVersion; do not silently migrate. No historical migration is promised in this release.

Every event has the following exact fields; nullable fields must be present with null when unknown. Additional fields are rejected.

| Field | Contract |
| --- | --- |
| `eventId` | Stable globally unique opaque ID chosen once by the producer, including its namespace; retry preserves it. |
| `taskId` | Stable task ID, never inferred from title. |
| `actorId` | Actor making the report; not necessarily the person doing the work. |
| `actorLabel`, `roleLabel` | Nullable display text; arbitrary producer-declared labels, never access grants. Actor IDs determine identity even when labels change. |
| `runId`, `attemptId` | Nullable execution and revision IDs. An attempt requires a run. |
| `kind` | One of the kinds below. |
| `occurredAt` | Producer-reported UTC timestamp `YYYY-MM-DDTHH:mm:ss.sssZ`, valid calendar date, or null. |
| `source` | Object `{producerId, label, synthetic}`; IDs obey ID rules, label is display text, synthetic is boolean. A claim, not authenticated identity. |
| `data` | Kind-specific object below. |

IDs are ASCII strings of 1–128 characters from `[A-Za-z0-9._:-]`, case sensitive. Human labels, summaries and reasons are plain text, 1–500 Unicode code points. Render as text, never HTML. Event IDs are ledger-wide; task, actor and run IDs use producer namespaces too. A run belongs to one task and one assigned actor when known; an attempt belongs to one run. Conflicting bindings remain visible as correlation diagnostics, not silently repaired. Missing references are accepted as unresolved evidence to permit out-of-order delivery.

## Kinds and payloads

All listed payload fields are required, including nullable ones. There are no implicit status transitions.

| Kind | Exact `data` fields and meaning |
| --- | --- |
| `assignment` | `fromActorId`, `toActorId`, `parentRunId` (nullable). Envelope runId and attemptId required: identify the assigned execution/initial attempt. Explicit work assignment; parentRunId links delegation when known. |
| `consultation` | `toActorId`, `question` (brief metadata only). Run/attempt optional; no ownership transfer. |
| `block` | `reason`, `nextActorId` (nullable). Envelope runId/attemptId required. Event ID identifies this particular open block. |
| `resolution` | `blockEventId`. Envelope runId/attemptId required; resolves only that referenced block on the same task/run/attempt. |
| `handoff` | `toActorId`, `reason`. Envelope runId/attemptId required. Explicit next actor assertion for this run/attempt; not a new run assignment. |
| `revision` | `previousAttemptId`, `reason`. Envelope runId/attemptId required; attemptId is the new revision. Previous attempt must differ. |
| `review`, `qa` | `targetAttemptId`, `outcome` (`passed`, `failed`, `unknown`), `summary`. Envelope runId required; evidence applies only to targetAttemptId. |
| `completion` | `summary`. Envelope runId/attemptId required; reported completion only. |
| `runtime` | `configured`, `verified`, `verification`. Envelope runId required. See provenance rules. |

Fields named `...ActorId`, `...RunId`, `...AttemptId`, `...EventId` follow ID rules. `runtime.configured` and `runtime.verified` each contain exactly `{model, effort}`, each value null or display text. `verification` is null when verified values are all null; otherwise `{method: "tool", verifierActorId, evidenceRef, summary}` is required. evidenceRef is a short opaque reference, not a transcript or fetched URL. A tool verification is still a producer-supplied assertion about evidence; display it as “reported tool verification” with its basis. The viewer does not certify its independence or truth. General reports are labelled “producer declaration”. Local receipt is separately labelled “ledger receipt”; no numeric confidence score is generated. Multiple conflicting runtime reports are shown separately, never collapsed into a verified current model. Missing information is “unknown”.

## Import, equality and ordering

Validate the complete envelope and every event before mutation. Duplicate keys and malformed JSON report a location where available. Semantic errors identify event index, field path, code and a short remediation, without dumping raw input. Any invalid event, unsupported version or conflicting event ID rejects the entire batch; existing history is unchanged. Do not reject missing references or graph cycles as malformed input: those are evidence diagnostics. A resolution pointing to the wrong task/kind is an invalid relation diagnostic; it cannot resolve a block. A revision self-reference is a schema error.

Same eventId plus structurally equal parsed event content is idempotent, even if JSON object keys or whitespace differ. Arrays retain order; all strings compare exactly; no trimming, case conversion or null/absent normalization. Compare all producer fields, excluding locally generated receipt metadata. Same ID/different content is `event_id_conflict`; report its index/ID, never overwrite. Check duplicates within the incoming batch and against stored events. Equality must work identically in browser and receiver, backed by shared golden fixtures rather than a speculative cross-language hash protocol.

On success, each newly accepted event gets local metadata `{receivedAt, receiptId, channel}`. `receivedAt` uses the same UTC format but is local acceptance time; `channel` is `file` for browser imports or `mcp` for the planned durable service. Receipt metadata is separate from producer formatVersion 1; [service contract v1](ledger-api.md) defines durable metadata. First successful receipt metadata survives retries. Show imported time for file input and received time for durable MCP. Duplicate attempts return duplicate counts/IDs without replacing first receipt time. Rejected batches create no event receipts. Receipt proves acceptance by this ledger only.

Timeline sort: known occurredAt ascending, then eventId ASCII ascending; unknown occurredAt entries follow known ones, sorted by eventId. This order is stable across import permutations. Receipt time is shown separately and is never substituted for occurredAt. Sort order is a presentation convention, not a causal or clock-correctness guarantee.

## Received-record projection (second result)

Project all events for the selected task without contacting actors. Graph nodes are actors, runs and attempts with labelled event relations; every edge and summary statement links to source event IDs. Distinguish assignment and consultation visually and textually. Missing targets produce labelled unresolved references. Cyclic delegation can be legitimate and must remain navigable; no role policing or cycle-based prohibition. Invalid relation targets are diagnostics, not hidden or followed as valid edges.

For each run/attempt, open blocks are block events minus valid same-task resolutions. A report for another attempt cannot close them. Keep all simultaneously open reasons. Next actor candidates are explicit handoff targets and open-block nextActorId values for that attempt; contradictory candidates yield “ambiguous” and source links. No candidate yields “unknown”. Do not infer an actor from role, last activity, consultation, timestamps or silence. Conflicting handoffs remain ambiguous because v1 has no supersession mechanism. Task-level summary lists each run/attempt rather than inventing a single owner across parallel runs.

Review/QA nodes attach only to their target attempts; a revision never inherits a passed outcome. Do not aggregate self-reported passes into a task certification. Unknown reference, conflicting binding and missing runtime evidence remain visible. All summaries state “based on received records”; no heartbeat, live health, stalled-time or actual-completion inference.

## Durable project/session receipt interface

[DAM-32 service contract v1](ledger-api.md) replaces the former unimplemented plain HTTP producer plan. Explicit project/session registration accompanies unchanged formatVersion 1 events. Session IDs, task IDs and MCP protocol sessions are distinct. The trusted loopback-only local MCP service calls one shared durable core; the ordinary D UI reads its committed events and original receipts through the same-origin API without application authentication. A successful receipt proves ledger acceptance only.

The core validates raw envelope bytes/text, not already-parsed events. The strict decoding, all-or-nothing validation, structural equality, limits, ledger-wide IDs, duplicate occurrence counts and stable event ordering above remain binding. Unsupported producer versions are rejected, never silently migrated. The strict raw parser remains validation infrastructure for the ephemeral synthetic Example; no file-import UI/workspace remains and no project/session is invented for legacy input.

No standalone HTTP producer or direct POST /v1/events endpoint is required. Existing durable history and first receipts must be preserved. Storage schema/recovery, exact tools/read routes, safe snapshot hydration, error mapping and local request controls have their sole durable definition in [ledger-api.md](ledger-api.md). Public install/runtime support and actual probe limitations are in [local-service.md](local-service.md).
