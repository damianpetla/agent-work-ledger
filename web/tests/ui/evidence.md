# DAM-34 author evidence

Developer execution `/root/developer_import`, 2026-11-04. Base `d48dd103b2d89c9182408ac8016176928e7176ce`, clean initial `feature/DAM-34-local-timeline` worktree. The enclosing commit is the frozen candidate; executed source hashes below identify its precommit runtime files. Accepted DAM-33 importer/API/fixtures/tests are unchanged (empty Git diff against base for those paths). Director owns independent source review, integration and parent QA/user gates. No merge or self-acceptance by this author.

## Environment and reproduction

Observed: CPython **3.12.0**, Chromium/Chrome for Testing **156.0.8078.4**, Node **v23.7.0**, macOS **26.6.2** build **25G83**, **arm64**. No installation, external packages or account required. Node is optional author-test tooling, not an application dependency.

Actual server command from the repository root, approved isolated loopback serving only public assets:

```sh
/Library/Frameworks/Python.framework/Versions/3.12/bin/python3.12 -m http.server 8774 --bind 127.0.0.1 --directory web
```

App URL **http://127.0.0.1:8774/**; module checks **http://127.0.0.1:8774/tests/import/**. The service is stopped with Ctrl-C on handoff. No private user Chrome or unrelated service was used.

Exact final automated author command:

```sh
AWL_TEST_CHROMIUM=/Users/loop/Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell AWL_TEST_OUTPUT=/tmp/awl-dam34-run5 node web/tests/ui/check.mjs
```

The runner uses built-in Node WebSocket/CDP and a fresh temporary Chromium profile, removed after the run. Native DOM file input selection reads real fixture files from disk through the ordinary application File API (`arrayBuffer` → accepted `importBytes`); it does not replace the importer or inject a snapshot. It does not manually operate the OS file-picker dialog. Source navigation uses native Tab/Enter events; task and return-button actions use actual DOM button clicks. Test-only read delay/failure is injected at File.arrayBuffer to exercise the read lock/error recovery, with original native reads preserved/restored. There is no dependency installation or persistent browser automation service.

## Actual attempts and failures

| Attempt / output directory | Result | Cause / subsequent action |
| --- | --- | --- |
| 1 `/tmp/awl-dam34-run1` | 2 passed, 1 failed, remaining 9 not run; exit 1 | Keyboard assertion expected inspector focus, actual active element ID empty. |
| 2 `/tmp/awl-dam34-run2` | 2 passed, 1 failed, remaining 9 not run; exit 1 | Activating the target via Page.bringToFront did not resolve the keyboard failure. |
| 3 `/tmp/awl-dam34-run3` | 2 passed, 1 failed, remaining 9 not run; exit 1 | Probe showed source button demo:03 still focused, selected source demo:01 unchanged, zero JS exceptions. The Enter event had not activated the button. |
| 4 `/tmp/awl-dam34-run4` | 12 passed, 0 failed, 0 skipped; exit 0 | Correcting CDP keyDown to include Enter text/unmodifiedText CR triggered the native button action. No product keyboard fix was needed. Full app checks and 168 importer checks passed. |
| 5 `/tmp/awl-dam34-run5` | 12 passed, 0 failed, 0 skipped; exit 0 | Final affected rerun after explicit native Tab assertion and precise “Consultation to …” wording; source reporter is not inferred as the actor doing the work. Same scenario count. |

Each failure directory retains failure.txt with the observed assertion/stack. Final artifacts are [results.txt](results.txt), [timeline.png](timeline.png) and `/tmp/awl-dam34-run5/requests.json`. The committed screenshot is synthetic and was visually inspected: desktop timeline/task/source columns, all five demo:launch events, separate occurrence/import times, unknown runtime and readable source/receipt details. No private event content appears. The first screenshot from attempt 4 was also inspected before final wording refinement. UI checks were written after the first implementation; no UI TDD red→green claim is made. Failures above were test-driver errors, not evidence of a product keyboard defect.

## Verified behavior

1. Empty session and visible memory/reconstruction boundary; synthetic download URL available with no auto-import.
2. Ordinary selected file yields 6 events/2 tasks; selected task has literal expected order demo:01…05. Assignment from/to, distinct consultation, block reason, run/attempt references and synthetic/provenance labels visible. Occurred/imported times separate; null occurrence stays unknown.
3. Native Tab/Enter selects a source, moves focus to inspector, reveals exact parsed event plus separate receipt and preserves unknown runtime. Return action restores selected event focus.
4. Re-selecting identical file reports 0 new/6 duplicates and retains original receipt metadata and selected source.
5. Malformed, conflicting and invalid UTF-8 files return actionable errors and leave timeline/source unchanged.
6. Switching task filters both timeline and source; no source leaks from the prior task.
7. All-kinds fixture preserves multiple runtime reports separately, including reported tool basis and its opaque evidence reference; no truth/independence certification.
8. HTML-like actor labels/reasons display literally; no injected elements/script execution.
9. Delayed actual file read disables input; injected read error preserves state, restores input and permits retry. Product also guards reentrant changes while busy.
10. Reload clears the workspace; ordinary reimport reconstructs it.
11. During ordinary app viewing, captured page requests were local origin/data only and Runtime.exceptionThrown remained empty. No remote dependency or evidence fetch.
12. Accepted module page completed **TOTAL 168 PASS 168 FAIL 0 SKIP 0** through the integrated server.

`git diff --check` and local relative documentation/module/fixture links passed. All new source and docs/diffs were read. There was no existing build/lint/CI command to run; no tooling dependency was introduced. No runtime backend/graph/current-owner/live-producer/MCP/AI work was done. Independent source review, parent integrated QA, actual OS file-dialog exploratory testing, screen-reader evaluation and actual user trial remain separate and **not run by this author**. Author checks are not independent acceptance.

## SHA-256 executed source and artifacts

```text
f354be1b189f6216cba40d4c414f3cb8a0583e71e0e2f6a963f4ebcd585e6b18  web/index.html
7f923e459fa2c8593f1e4c6d757e0475da0e039c74a8bb5a71a34f52c7178256  web/app.js
72ac0da62010b6080e0905e60cb6d8b049324b5d83f1dac27d32072f2ce0eda9  web/styles.css
a4a5937204dce04fb5946ee4362308df9c8b9320cc6fff37e59a6c158df350f3  web/tests/ui/check.mjs
f70cb3ffaa90df800499f9d1ba1da062b3fed6b21f32a32e2dcfe64e8f4a23c6  web/tests/ui/results.txt
8799f12b564fcfc8d8a4510ca3e1f23ec745466a79161b89b6def320ce3cc56d  web/tests/ui/timeline.png
```

## Retro and metrics

Recommendations only; no process edits:

1. Preserve full native keyboard parameters in future CDP checks. Evidence: three reproducible runner failures disappeared after Enter text CR was supplied; verify Tab/Enter again if the driver changes.
2. Keep producer reporter distinct from performer in future copy. Evidence: consultation payload names a target only; verify future views do not infer the requester/performer from actorId.
3. Keep local app and module verdicts separate. Evidence: 12 application scenarios and 168 importer checks exercise different boundaries; verify parent QA follows ordinary file selection rather than treating module PASS as user acceptance.

Configured model/effort **gpt-6.1-sol / medium**, from Director brief. Agent runtime model/effort, tokens, total task latency, credits and task cost **unavailable**. Subprocess versions do not establish agent runtime telemetry.
