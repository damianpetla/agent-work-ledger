# DAM-33 author evidence

Developer execution `/root/developer_import`, 2026-11-04. Self-checks only; no independent acceptance, application UI, graph, backend or real producer is claimed.

Base: `a0103e9debddc8731342ec6ef265095968150a14`, initially clean `feature/DAM-33-atomic-import`. The enclosing commit freezes the candidate. Code/test/fixture hashes below identify the executed source before commit. Stable consumer API: `web/import/index.js`, documented at `docs/import-api.md`.

## Environment and exact reproduction

Observed commands `python3.12 --version`, cached browser `--version`, `sw_vers`, `uname -m`: CPython **3.12.0**, Chromium/Chrome for Testing **156.0.8078.4**, macOS **26.6.2** build **25G83**, **arm64**. No installations or dependencies. Use the full observed interpreter path if `python3.12` is not on PATH.

From the repository root, the actual dedicated public-asset server command was:

```sh
/Library/Frameworks/Python.framework/Versions/3.12/bin/python3.12 -m http.server 8773 --bind 127.0.0.1 --directory web
```

Initial sandbox invocation failed with `PermissionError: [Errno 1] Operation not permitted` binding loopback (exit 1); approved escalation started the same command successfully. Test URL: `http://127.0.0.1:8773/tests/import/`. No other server/profile was used. Server is stopped on handoff using Ctrl-C.

Actual final browser command (isolated cached headless process, no user Chrome):

```sh
/Users/loop/Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell --headless --no-sandbox --disable-gpu --dump-dom --timeout=15000 --virtual-time-budget=10000 http://127.0.0.1:8773/tests/import/ > /tmp/dam33-final-dom.html 2> /tmp/dam33-chromium.stderr
```

The first ten tracer invocations used `--timeout=10000` without `--virtual-time-budget`; the expanded runs used the final command above. Every browser command exited 0, **including deliberate red tests**: dump-dom exit status is not the test verdict. Chromium printed macOS CVDisplayLink diagnostics; the module page still completed and fetched all fixtures. Final DOM result was independently extracted using Python's `html.parser.HTMLParser`, asserted to end with `TOTAL 168 PASS 168 FAIL 0 SKIP 0` (exit 0), and saved as [results.txt](results.txt) with trailing line whitespace removed. For manual reproduction, inspect the named results and TOTAL in the page. A missing/unfinished report is a failure, never a pass.

## Actual attempts, including failures

| Browser run | Slice and observation | Total / pass / fail / skip |
| --- | --- | --- |
| 1 | Valid-event tracer red: `expected success, got not_implemented` | 1 / 0 / 1 / 0 |
| 2 | Valid-event acceptance and injected separate receipt green | 1 / 1 / 0 / 0 |
| 3 | Nested escaped-equivalent duplicate key red: `expected duplicate_key` | 2 / 1 / 1 / 0 |
| 4 | Strict raw parser green | 2 / 2 / 0 / 0 |
| 5 | Atomic/idempotence tracer red: `must not create receipt` on retry | 3 / 2 / 1 / 0 |
| 6 | Conflict rollback and original receipt preservation green | 3 / 3 / 0 / 0 |
| 7 | Invalid-calendar tracer red: `actionable calendar rejection` | 4 / 3 / 1 / 0 |
| 8 | Full schema validation and calendar tracer green | 4 / 4 / 0 / 0 |
| 9 | Byte-input tracer red: `api.importBytes is not a function` | 5 / 4 / 1 / 0 |
| 10 | Strict UTF-8 and explicit BOM rejection green | 5 / 5 / 0 / 0 |
| 11 | Expanded contract/golden regressions, first execution | 166 / 166 / 0 / 0 |
| 12 | Structured unknown-field path clarification and affected assertions | 166 / 166 / 0 / 0 |
| 13 | Final gap checks: complete object permutation/whitespace/escapes and kind-specific nullable attempts | 168 / 168 / 0 / 0 |

The first five tracers have observed red→green evidence. Additional full-schema/golden/limit tests were authored **after implementation**; no claim of all-tests-first development. The byte tracer proves missing API behavior, not an observed pre-fix decoder accepting bad bytes. No unexplained rerun, flaky test, skipped or disabled case occurred.

Final coverage crosses the public import/task/timeline seams in real Chromium: raw syntax/duplicate keys (nested/escaped), exact required/nullable fields and all ten kinds, runtime provenance, strict UTF-8/BOM, 500-code-point text and 128-character ASCII IDs, real calendar validation, 1 MiB inclusive boundary, 1,000 duplicate/unique events and 1,001 rejection, full batch rollback, stored/within-batch duplicates/conflicts, structural equality, first receipt retention, ASCII tie ordering/null-last and shuffled separate imports. Golden expected values are literal records independent of the import implementation. Synthetic fixtures use source.synthetic true and contain no private recordings.

Initial staged `git diff --check` flagged one trailing space in the empty-text test name inside the generated result log; trimmed report line endings and reran successfully. `git diff --check` passed. Full source, fixtures, API documentation and final diff were read; relative documentation/module/fixture links checked locally. No manifest/build/lint/CI command existed at the base; none is invented or newly installed. No application file selection/source UI, accessibility QA, reload behavior, network-request audit or user trial has been run: those remain DAM-34 author checks and DAM-30 independent integrated QA/user acceptance. Independent source review of this exact candidate is required before DAM-34 consumption/integration. Director owns integration; this author does not merge or self-accept.

## SHA-256 executed files

```text
7fcf5c6c121ad7a47670242c19731e30a33644293346a9b2cd9ff2cf1ec6ae9f  web/examples/synthetic-timeline.json
2eb9adce49fd71d411ac50b8d976330af6759f0fe1874fb40c7cd058f1ac546d  web/import/index.js
d67b227be90edc8d5793f34d2c38dcdf4e7a1e998b5471f001642a7f79f29926  web/import/parse.js
28197b1da9311ccbaecbea903b154a76956303197101c1b4c3c4a1d99c8d71b0  web/import/schema.js
7c60f09240de3bcb6391b1e67f15beffe23714f0a2a307336a204e1d9505799f  web/tests/import/all-kinds.json
1fb0c723ee874fa62a346fbbd26128f219c6773cef316032d712d022f30a9720  web/tests/import/conflict.json
76e141040f93f2879f4069c4ac9528188da4b5f076fe6f9075ce35542b6fe3c9  web/tests/import/expected.json
76740cdc2effd83c50714cf63e23612e547afbf217670dd0eced9fc7a4bfe979  web/tests/import/index.html
8823d3907f48b7eb561c63f795daaab02fa6627e8907ff2082ca3445d0869205  web/tests/import/malformed.json
895cac5f73c01b64315d9ce1f96d123ebc9d938dd0a4ab03d72582607af1067a  web/tests/import/out-of-order.json
a02ec1eb3177efddcd017513e7907cce71e7489eea4593a0aa74b181252b115a  web/tests/import/results.txt
9f8f8c66b68181be77a30cc404f4484d0bdfc02e86d6cbf32073b764a4ebd85c  web/tests/import/tests.js
```

## Retro and metrics

Recommendations only; no process edits:

1. Preserve the byte boundary in the future UI. Evidence: only `arrayBuffer` plus strict decoding can reject malformed UTF-8; verify the consumer invokes `importBytes`, not `File.text`.
2. Keep the fixture expectations independent. Evidence: golden ordering/error/count data is a plain JSON artifact; verify a future receiver runs these same files without deriving expected outputs from its own importer.
3. Retain explicit result-count inspection in headless checks. Evidence: deliberate failures still returned Chromium CLI exit 0; verify automation requires a completed zero-failure report.

Configured model/effort: **gpt-6.1-sol / medium** (Director brief). Verified agent runtime model/effort, tokens, total task latency, credits and cost: **unavailable**. Browser/interpreter subprocess versions do not establish agent runtime telemetry. No estimate or global balance substituted.
