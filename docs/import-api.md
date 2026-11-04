# Browser file import API

The dependency-free ES module at `web/import/index.js` implements the file-import portion of [event contract v1](event-contract.md). It has no persistence, network calls, UI or derived graph/state. Reloading the caller clears its in-memory snapshot. The full timeline application is a separate delivery.

## Public exports

```js
import {emptySnapshot, importBytes, importText, taskIds, timeline}
  from './import/index.js';

let snapshot = emptySnapshot();
const result = importBytes(snapshot, new Uint8Array(await file.arrayBuffer()), {
  now: () => new Date().toISOString(),
  receiptId: () => crypto.randomUUID()
});
if (result.ok) snapshot = result.snapshot;
// On error retain snapshot and display result.error as text.
const tasks = taskIds(snapshot);
const rows = timeline(snapshot, tasks[0]);
```

For user-selected files use `arrayBuffer()` and `importBytes`; `File.text()` replaces invalid UTF-8 and cannot establish strict byte validation. `importText(snapshot, rawText, dependencies)` is also available for already-decoded raw JSON strings whose byte decoding is the caller's responsibility. Parsed objects are rejected. Both paths reject a leading BOM explicitly. Size means UTF-8 encoded input bytes, at most 1,048,576 including whitespace. An input batch has at most 1,000 event occurrences, including duplicates. Session history can grow across valid batches; these are per-input limits.

`previousSnapshot` must be `emptySnapshot()` or a prior successful result from this module. Snapshots are not a storage/hydration format. No caller edits, untrusted snapshots or HTTP import are supported. Events, receipts and their nested contents are frozen. No caller-owned event object is accepted at the raw boundary. The module never mutates previous snapshots.

`dependencies.now()` returns a valid contract UTC timestamp; it is called once when the validated batch contains new events. `dependencies.receiptId(eventId)` returns a nonempty opaque string, once per newly accepted event in first-appearance order. The caller supplies its ID uniqueness policy (for example `crypto.randomUUID`). Equal duplicates and rejected input do not allocate event receipts. Dependencies can be omitted for an empty or entirely duplicate batch. A dependency failure returns `receipt_error` without publishing any replacement snapshot; callback side effects themselves cannot be rolled back, so use pure/local clock and ID generators. Successful batches give all new events the same local acceptance time.

## Results and snapshot

```js
// Success
{
  ok: true,
  snapshot: {
    events: [/* exact parsed producer events, canonical timeline order */],
    receipts: [/* one receipt per event, in the corresponding event order */]
  },
  acceptedEventIds: ['producer:new'],
  duplicateEventIds: ['producer:existing'],
  acceptedCount: 1,
  duplicateCount: 1
}
// Error; there is deliberately no snapshot property
{
  ok: false,
  error: {
    code: 'event_id_conflict',
    message: 'This ID already has different content; use a new event ID for a correction.',
    eventIndex: 1,          // zero-based incoming event index, otherwise null
    field: 'eventId',      // path relative to event or envelope, otherwise null
    eventId: 'producer:existing' // only for an identity conflict
  }
}
```

Each receipt is `{eventId, receivedAt, receiptId, channel: 'file'}`. A receipt confirms ledger acceptance only. It is separate from producer content, excluded from equality and retained unchanged on later retries. `acceptedEventIds` contains unique new IDs in incoming first-appearance order. `duplicateEventIds` lists every equal repeated occurrence in incoming order, including repeats of an event first accepted earlier in the same batch. Thus the two counts sum to the incoming event count. An all-duplicate import remains successful.

All events are validated before identity checking and receipt creation. Structurally equal objects ignore key order and JSON whitespace; strings remain exact, nullable fields must be present and arrays retain order. Conflicts within a batch or with history reject the full batch. No events or receipts from that batch become visible. Missing references and cycles are retained; relation diagnostics and ownership inference belong to a later result.

`taskIds(snapshot)` returns a new array of distinct task IDs sorted in ASCII order. `timeline(snapshot, taskId)` returns a new array of `{event, receipt}` rows for that exact task, or an empty array for an unknown task. Row objects/arrays can be rearranged by the caller; referenced event and receipt objects remain frozen. Known `occurredAt` sorts ascending, then event ID in ASCII order; null occurrence times follow, sorted by ID. Receipt time never fills an unknown occurrence time. Snapshot events follow the same global order. Use `row.event.eventId` to link the timeline to the exact `row.event` source, retaining all source/runtime fields. No model, confidence, owner, resolved state or completion is inferred. Render all strings with text APIs; configured values and reported tool verification remain producer assertions.

## Errors

| Code | Action |
| --- | --- |
| `invalid_input` | Pass a string to `importText` or a `Uint8Array` to `importBytes`. |
| `input_limit`, `event_limit` | Split into batches within 1 MiB and 1,000 occurrences. |
| `invalid_utf8` | Save valid UTF-8; do not decode with replacement first. |
| `leading_bom` | Save UTF-8 without a leading BOM. |
| `invalid_json`, `duplicate_key` | Correct JSON syntax or remove repeated object members, including escaped-equivalent keys. |
| `unsupported_version` | Use formatVersion 1; no migration is performed. |
| `invalid_schema` | Correct the named field against the exact v1 contract. Human text is 1–500 Unicode code points. |
| `event_id_conflict` | Keep the original event and use a new ID for changed content. |
| `receipt_error` | Correct the injected clock/receipt generator, then retry unchanged input. |

Parse errors include `location: {offset, line, column}` when available: offset is zero-based UTF-16 code units, line/column are one-based (column also counts UTF-16 code units). BOM/byte errors have no decoded location. All errors include nullable `eventIndex` and `field`; parser/depth errors have no event index. Schema errors use field paths such as `source.synthetic` and `data.verified.model`. Unknown fields use their containing path and a bounded identifier name, or `[unknown field]` for unsafe/unbounded names. Messages do not echo raw input. A parser nesting guard of 64 levels rejects malformed/schema-incompatible nesting before stack exhaustion; all valid v1 objects are far shallower.

## Fixtures and module checks

`web/examples/synthetic-timeline.json` is a synthetic, ordinary v1 file: select `demo:launch` to see assignment/delegation, consultation, a reported block and configured model with unknown runtime model. `demo:other-task` demonstrates task filtering. Events arrive out of order intentionally; this is no live producer connection.

`web/tests/import/expected.json` states independently authored expected counts/order/error details for that file and the golden `out-of-order.json`, `conflict.json` (after synthetic import), `malformed.json` and `all-kinds.json`. The latter includes all ten kinds and a reported tool-verification example. Fixture files are plain input and expected data, usable by a future receiver implementation without importing JavaScript logic.

From the repository root, with CPython 3.12 installed:

```sh
python3.12 -m http.server 8773 --bind 127.0.0.1 --directory web
```

Open `http://127.0.0.1:8773/tests/import/` in an isolated desktop Chromium. The page runs ES-module checks and prints named results plus `TOTAL / PASS / FAIL / SKIP`. It is a test harness, not the timeline product UI. Stop the dedicated server with Ctrl-C. Serve only `web`, never the repository root. No installation, package manager, framework, bundler or CDN is required. See [author evidence](../web/tests/import/evidence.md) for exact observed versions, commands and limitations. Independent source review and integrated application QA/user evaluation remain separate gates.

## Durable adapter (DAM-38)

The existing snapshot API remains trusted only for its own successful outputs. The new `acceptDurableSnapshot(rawBytes)` export is specified in [service contract v1](ledger-api.md#storage-and-safe-hydration); it must validate raw server responses and registrations/events/first receipt correspondence before publishing a compatible frozen snapshot. It must not cast arbitrary objects, call file import to generate replacement receipts or alter existing file semantics. The implementation is in `web/import/durable.js`; `node web/tests/durable/check.mjs` covers raw/global-map/receipt rejection and shared Unicode parity. Installed ordinary-D runtime checks are documented in `tests/service/README.md`.
