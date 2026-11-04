# Agent Work Ledger

Inspect source-linked task relations, attempts and checks locally, without an account or AI service. The ordinary application opens D with an explicitly synthetic example accepted through the real v1 byte importer. Independent review, integrated QA and user evaluation remain separate acceptance gates. There is no live agent connection, backend or durable history.

## Run locally

Requires CPython **3.12** and desktop Chromium. Serve only public assets:

```sh
python3.12 -m http.server 8774 --bind 127.0.0.1 --directory web
```

Open [Agent Work Ledger](http://127.0.0.1:8774/). Stop the dedicated server with **Ctrl-C**. Choose a free port if 8774 is already in use. Do not serve the repository root or open the app as `file://`. This loopback server is for local inspection, not production hosting. Viewing committed assets needs no npm installation or build. Author environment: Python 3.12.0, Chromium 156.0.8078.4, macOS 26.6.2 arm64; other targets are unverified.

## Try the working graph

1. **Example** starts with [ten invented workflow records](web/examples/synthetic-workflow.json), fetched locally as bytes and validated by the ordinary importer. Find separate attempts `example:v1` and `example:v2`, failed QA targeting only v1, the explicit v1→v2 revision, and passed QA targeting only v2. Handoffs end at named actors; QA is not connected to a later revision by guesswork. The final report requests user review, without asserting acceptance.
2. Click card text or padding. Check cards open their accepted producer JSON and separate **current-tab ledger receipt**. An actor/run/attempt supported by several events first shows projected facts and **all named supporting records**; select the source you want. Projections are not exact producer JSON. Open, Close and Return keep graph x/y/zoom unchanged. Return restores the invoking control's focus. Keyboard users can Tab to native buttons and press Enter.
3. Use explicit pan, Zoom in/out and Fit to explore. Arrow keys pan a focused canvas. The graph is read-only. A new task/workspace receives one measured initial orientation; long content or other topologies may require panning. Cards wrap and grow rather than shrinking their text. No universal graph-routing or mobile/accessibility certification is claimed.
4. **Other evidence** exposes runtime and other reports; **All records** is the complete occurrence-ordered timeline; **Entities and relations** includes context, internal and disconnected entities and every literal relation. Diagnostics expose unresolved, invalid, ambiguous and cyclic references with their exact sources. Advice is not assignment. A check applies only to its named attempt; a later attempt inherits no pass.
5. Choose **Imported files** and open [the independent six-record example](web/examples/synthetic-timeline.json) through the native file chooser. It produces a different graph and two actual task IDs, including `demo:other-task`. This workspace starts empty and later file imports accumulate there. Repeating the same file gives 0 new / 6 duplicate events and preserves first receipts. Malformed, conflicting and unreadable files preserve the prior imported graph/source. The built-in Example stays separate and retains its current-tab receipts when reopened.
6. Inspect runtime reports: configured settings are separate from reported runtime verification, and unknown remains unknown. Receipt confirms local acceptance only, never producer truth, independence or completion. Reload resets imported data and recreates the example with new current-tab receipts; keep original files for reconstruction. Startup fetch/validation failure shows an actionable error and leaves manual import available, rather than displaying a fallback graph.

V1 has task IDs but no registered project, session, day or work-title fields. The task directory uses actual accepted IDs. Familiar names inside synthetic records are labels only. There is no inferred owner/waiting summary, cost calculation, real producer, collector, project history or factory integration.

## Input and privacy

Files are UTF-8 v1 JSON envelopes limited to **1 MiB (1,048,576 encoded bytes)** and **1,000 event occurrences per import**. The unchanged [event contract](docs/event-contract.md) and [import API](docs/import-api.md) define identity, strict decoding, atomic validation, duplicate/conflict handling, ordering and receipts. Event content is a producer declaration. The [graph API](docs/graph-api.md) defines explicit evidence relations and diagnostics.

Data stays in browser memory. No localStorage, IndexedDB, outgoing remote runtime requests or AI analysis is used. Only structured diagnostic metadata belongs here: do not import transcripts, prompts, secrets or private conversation content.

## Development and checks

The pure importer/projector remain dependency-free. The selected D UI uses locally bundled MIT React Flow, Dagre, React and React DOM, with locked dependencies and [third-party notices](web/graph-ui/THIRD-PARTY-LICENSES.txt). No Pro examples or CDN assets are used. Rebuild with Node 23.7.0 / npm 10.9.2 (observed):

```sh
npm ci --prefix graph-ui --ignore-scripts
npm run build --prefix graph-ui
node web/tests/graph/check.mjs
node web/tests/workspace/check.mjs
```

Open [browser importer checks](http://127.0.0.1:8774/tests/import/) using the same server. Optional Node/CDP runners use an explicitly selected isolated Chromium executable, never the user's private browser:

```sh
AWL_TEST_ORIGIN=http://127.0.0.1:8774 AWL_TEST_CHROMIUM=/path/to/isolated/chromium AWL_TEST_OUTPUT=/tmp/awl-ui node web/tests/ui/check.mjs
AWL_TEST_ORIGIN=http://127.0.0.1:8774 AWL_TEST_CHROMIUM=/path/to/isolated/chromium AWL_TEST_OUTPUT=/tmp/awl-graph node web/tests/workspace/browser.mjs
```

[Working-D author evidence](web/tests/workspace/evidence.md) records versions, actual checks, first failures, bounds, screenshots, build hashes and limitations. These author results do not replace independent review/QA or the user trial. [Product brief](docs/product-brief.md) and [technical plan](docs/technical-plan.md) describe current scope and deferred results.

Licensed under [MIT](LICENSE).
