# DAM-30 UI boundary author evidence

Developer execution on `feature/DAM-30-ui-boundaries`, base `8ca0f467fd0a7ba783515b6c94d0987badc721d7`. The worktree was clean at start. Scope is limited to `web/tests/ui/check.mjs` and this evidence file; application files and importer implementation are unchanged. The tested input seam is the ordinary visible file input in isolated Chromium, backed by the local static web server. No CUA, dependency installation, or product behavior change was used. Independent review, independent QA of this candidate, manual OS picker exploration, and user evaluation remain separate gates.

## Environment and final author command

Observed: Node **v23.7.0**, CPython **3.12.0**, Google Chrome for Testing headless shell **156.0.8078.4**, macOS **26.6.2** build **25G83**, **arm64**. The runner requires Node's built-in WebSocket and the explicitly selected cached Chromium binary.

Dedicated static server, serving only `web` on the assigned isolated port:

```sh
/Library/Frameworks/Python.framework/Versions/3.12/bin/python3.12 -m http.server 8776 --bind 127.0.0.1 --directory web
```

Final command, with optional observation-mode self-check against the repository's existing synthetic example:

```sh
AWL_TEST_ORIGIN=http://127.0.0.1:8776 \
AWL_TEST_CHROMIUM=/Users/loop/Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell \
AWL_TEST_OUTPUT=/tmp/awl-dam30-ui-boundaries-run6 \
AWL_TEST_EXTRA_FILE=/Users/loop/Studio/.local/worktrees/agent-work-ledger-dam30-qa-gaps/web/examples/synthetic-timeline.json \
node web/tests/ui/check.mjs
```

Result: **TOTAL 14 PASS 14 FAIL 0 SKIP 0**, exit 0. The existing importer page completed **TOTAL 168 PASS 168 FAIL 0 SKIP 0** in the same isolated Chromium session. The final standard result is in `/tmp/awl-dam30-ui-boundaries-run6/results.txt`. The optional `AWL_TEST_EXTRA_FILE` observation is deliberately not included in the 14-scenario test verdict and adds no fixture-specific expected values.

## Added boundary scenarios

1. Builds 1,000 unique valid synthetic consultation events in reverse ID order, pads the file with JSON whitespace to exactly **1,048,576 UTF-8 bytes**, imports through the ordinary input, selects the new task, and checks the independent expected ascending ID sequence plus `1000 new, 0 duplicate` and `1000 events`.
2. From that accepted snapshot, selects a 1,001-event file, a **1,048,577-byte** file, and a leading-BOM file. It checks `event_limit`, `input_limit`, and `leading_bom` errors respectively, the visible unchanged-workspace message, and exact unchanged timeline and source-inspector text after each rejection.
3. Imports tied timestamps, an earlier timestamp, and two null timestamps in shuffled order. The expected source IDs are the literal contract order `order:early`, `order:tie:a`, `order:tie:z`, `order:null:a`, `order:null:z`; each ordinary source button is activated and its selected event ID and exact producer JSON are checked against that literal expected ID.

The optional observer opens a fresh page, reads the supplied path through the ordinary native DOM file input, and writes `observations.json` plus one screenshot per visible event under the selected output directory. It records page/body text, import status, task IDs, selected task, ordered timeline event IDs, the selected event's exact producer JSON and separate receipt after each source-button click, page exceptions, requests during the page load/import, a `globalThis.qaInjected` sentinel, and `img`/`script` descendants in the timeline/source content. It makes no expected-value assertion for this optional file. The self-check used the existing six-event, two-task public example: the selected `demo:launch` timeline contained five events. Results observed: five exact event/source/receipt correspondences, six same-origin asset requests only, no page exceptions, no `img`/`script` descendants, and `qaInjected: null`. This does not substitute for independent QA's separate one-task/five-event fixture or for manual file-picker use.

## Attempts and reruns

| Attempt | Output / result | Finding and follow-up |
| --- | --- | --- |
| 1 | `/tmp/awl-dam30-ui-boundaries-run1`; exit 1 before browser navigation | Chromium did not expose its CDP endpoint in the default sandbox. Re-ran through the authorized isolated process path. |
| 2 | `/tmp/awl-dam30-ui-boundaries-run2`; 5 scenarios passed, then exit 1 | New test expected 1,000 visible events while the previously selected task still showed 5. Made the scenario select `boundary:task` explicitly. |
| 3 | `/tmp/awl-dam30-ui-boundaries-run3`; 5 scenarios passed, then exit 1 | Test-driver JavaScript selector had a quoting syntax error. Replaced it with a `dataset.taskId` lookup. |
| 4 | `/tmp/awl-dam30-ui-boundaries-run4`; 7 scenarios passed, then exit 1 | Both new boundary scenarios passed. The pre-existing task-switch scenario assumed the synthetic example remained loaded; made it establish its own initial state. |
| 5 | `/tmp/awl-dam30-ui-boundaries-run5`; **14/14 UI**, importer **168/168** | Passed before the optional observer was added. |
| 6 | `/tmp/awl-dam30-ui-boundaries-run6`; **14/14 UI**, importer **168/168** | Final run after moving observer capture start before page navigation; includes a successful observation-mode self-check on the public synthetic example. |

No application defect was observed. Attempts 2–4 were test-driver/orchestration defects and their first failures are preserved in each output directory's `failure.txt`. `git diff --check` passed after the final edit. There is no separate build/lint command in this repository, and none was added.

## Version and artifact hashes

The evaluated product baseline remains `8ca0f467fd0a7ba783515b6c94d0987badc721d7`; its application files were not modified. Before commit, the final authored test runner hash was:

```text
a249e3e50712f9c98416468ce022c106443892e6634a1b83425d4392659ce350  web/tests/ui/check.mjs
```

Observation artifacts are local to `/tmp/awl-dam30-ui-boundaries-run6/`: `results.txt`, `observations.json`, `requests.json`, and `extra-event-01.png` through `extra-event-05.png`. They use only the public synthetic example and are not committed. The runner hash plus base SHA identify the precommit tested version; the commit hash will identify the frozen delivery.

## Status and metrics

Configured model/effort: **gpt-6-luna / medium**, as specified by the Director brief. Agent runtime model/effort, tokens, total task latency, credits, and task cost: **unavailable**. Chromium, Node, and Python versions are observed subprocess/runtime versions, not agent telemetry.
