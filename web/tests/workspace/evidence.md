# Working D author evidence — DAM-36

Developer `/root/developer_graph_library`, 2026-11-04. Base `ca5da07c88e529c591cbd0641460e71b63496485`, branch `feature/DAM-36-working-d-workspace`. The commit containing this document is the frozen review version; `evidence/source-hashes.json` records source/build hashes. This is an ordinary application over accepted v1 records, not a throwaway route. Independent Reviewer/QA and Director/user acceptance remain pending.

## Boundary and result

Startup locally fetches `examples/synthetic-workflow.json` as bytes, invokes unchanged `importBytes` with real clock/UUID dependencies, then consumes unchanged `projectTask`. Ten synthetic records produce 17 projected entities / 11 literal relations; D shows nine main/context entities, two attempts and two distinct check cards, with eight other-evidence records. The existing independent six-record file produces two tasks and a different five-entity/five-relation selected graph in a separate Imported files snapshot. No role names, example IDs, fake project/day/session registry, waiting/current-owner summary or fixture coordinates drive the consumer.

Presentation retains every endpoint and edge. A detected consistent revision path can be compactly arranged with checks beneath their literal targets, participant/context bands and subordinate run headers. Other shapes use deterministic Dagre, with source-complete timeline/entity/relation disclosures. No QA→revision relation is invented. Entity inspection exposes all supporting source IDs; exact JSON and actual receipts are looked up in the full accepted workspace, including cross-task diagnostic sources. Overlay inspection retains graph root/viewport identity. Opening, source selection, Close and Return preserve the full transform and restore the actual invoking button. Initial measured orientation happens once per new graph; source changes never Fit or recenter it.

## Checks actually run

Environment: macOS 26.6.2 (25G83) arm64; Python 3.12.0; Node v23.7.0 / npm 10.9.2; isolated Chromium 156.0.8078.4. Dedicated preview 127.0.0.1:8786 (kept for handoff), separate test service 8787. Existing 8774/8780/8781 were not navigated or reset. Browser profiles are temporary and removed by each runner.

| Check | Command / actual result |
| --- | --- |
| Accepted projection regression | `node web/tests/graph/check.mjs`: **27/27 PASS**, unchanged module. |
| Workspace/display/source tests | `node web/tests/workspace/check.mjs`: **6/6 PASS**, accepted-byte snapshots, separate caches/receipts, atomic error retention, literal display endpoints, cross-task lookup and disconnected/cyclic evidence. |
| Import + retained UI regression | `AWL_TEST_ORIGIN=http://127.0.0.1:8787 AWL_TEST_CHROMIUM='/Users/loop/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' AWL_TEST_OUTPUT=/tmp/awl-d36-ui-run3 node web/tests/ui/check.mjs`: **14/14 PASS**, including integrated browser **168/168 importer PASS**. Native file selection, duplicate receipts, malformed/conflict/UTF8/BOM/1MiB/1000/1001/oversize rollback, ordering, source/task identity, literal HTML, read lock/failure/reload coverage retained. Deliberate D startup is adapted by entering Imported files and explicitly opening the alternate timeline/source. |
| Graph/source integration | Same environment variables, `AWL_TEST_OUTPUT=/tmp/awl-d36-graph-run4 node web/tests/workspace/browser.mjs`: **10/10 groups PASS**, zero uncaught JS errors, remote asset requests or storage writes. Actual mouse move/press/release hits card title/padding at 1440/1280/777; exact QA/revision/runtime/edge-record identity and real receipts; stationary transforms after pan and changed zoom; keyboard/focus/Return; alternate input topology, cached Example receipts, failed-file graph/source retention; independent branch/cycle/disconnected/cross-task/long fixtures; actual intercepted HTTP503 and malformed-startup bytes show no graph and retain manual import. |
| Locked build | `npm ci --prefix graph-ui --ignore-scripts --cache /tmp/awl-graph-npm-cache --registry https://registry.npmjs.org --no-audit --no-fund`, `npm run build --prefix graph-ui`, `npm ls --prefix graph-ui --depth=0`: exit 0, 27 packages; all generated hashes match pre-install/build bytes. RF12.12.1, Dagre2.0.0, React/DOM19.3.1, esbuild0.25.12. Runtime package notices plus esbuild legal comments committed; no Pro code. |
| Source checks | `node --check web/app.js`, both browser runners, and `git diff --check`: exit 0. Importer, schema, projector and their contracts are byte-unchanged. |

Source and UI logic tests were developed in vertical slices: initial startup acceptance stub failed `false !== true`, then passed; separate file-import stub failed the same meaningful acceptance expectation, then passed; empty presentation mapping failed the required attempt-presence assertion, then passed. Three later module checks and browser integration checks were added after implementation; no claim that all checks were TDD. No new test framework was installed.

## Geometry and observed limits

`evidence/graph-geometry.json` contains actual text-Range/scroll bounds, path sampling and label-box checks. Sample startup: all nine cards and complete relation/label bounds orient at 92.5% at 1440; 15px titles render 13.875px, 13px supporting text 12.025px. Small context and edge labels use 13px too. Inspector overlay never resizes the canvas. Direct card text/padding hits and invariant source/Close/Return pass at 1280 and the 777px boundary too; narrower or larger graphs intentionally require pan.

No card text escapes and no tested edge/label crosses unrelated card text. Minimum measured edge/card separation: sample 19.81px, branch/cycle 24px, reference/conflict 24px. Minimum sample label/card separation 15.84px. Long-role, 128-character unbroken ID and 500-code-point summary produce natural maximum height 695px; at explicit 200% graph-text enlargement it grows to 2530px, with label/card clearance 16.67px. The test pans to the tall card's beginning and physically opens its full 500-character source, rather than clipping or shrinking it. This is graph text stress, not browser zoom or accessibility certification. General obstacle-free routing for arbitrary graphs, other browsers/mobile, real producer/storage/backend and independent acceptance are not claimed.

## First failures and corrections

The first vertical render exposed sparse Dagre layout and clipped initial relation bounds. Bounded Designer feedback was implemented through structure-based compact revision/check packing, measured initial orientation and deduplicated copy; Director reviewed the revised 1440 image as sufficient to proceed to technical gates. This was not a new set of variants.

Retained first failures are in `evidence/first-*.txt`. Legacy runner failures were (1) asserting focused heading before the scheduled focus handoff, fixed with an observable wait, and (2) task click plus old source click in one evaluation before React committed the new task, fixed by waiting for the named task before source activation. No old scenarios were deleted. The graph runner first had an escaped-regex error in its transform measurement. Its next run found a **real** 200% label/card collision: a fixed 64px outer gutter did not account for enlarged label width. The adapter now reserves measured half-label width plus 24px. The following run passed geometry but attempted to hit the top padding of a 2530px card after centering its middle; the driver now pans to the visible beginning. Final run passes. These failures are distinguished from product defects; no hidden clipping, auto-shrink or bypassed importer made a check pass.

Build sizes/hashes are in `evidence/bundle-sizes.json`: JS 491010 bytes / 158305 gzip; CSS 23704 / 4602 gzip. Current screenshots include default1440, physical-source1440/1280/777, branch/cycle and long200 pan. The earlier first-render images are retained as historical milestone evidence.

## Handoff and metrics

Preview: `http://127.0.0.1:8786/`, Developer session 13083, serving only this worktree's `web`. Director owns review/QA, integration and actual user trial; verify preview liveness after the agent ends and restart the same command if needed. The test server 8787 is stopped at handoff. No PR, push, merge, tracker, deploy or Studio instructions were changed.

Configured model/effort: gpt-6.1-sol / medium per brief. Runtime identity, tokens, task latency, credits and task cost: unavailable; no task-scoped telemetry source. No global balance used.

Retrospective candidates (no instruction edits): keep real pointer hits alongside keyboard checks (the prototype had missed hit testing); verify controlled stress inputs in source/geometry (the enlarged-label failure was real); orient from measured full bounds before judging a graph screenshot. These checks are now represented in this task's evidence rather than proposed as new Studio rules.
