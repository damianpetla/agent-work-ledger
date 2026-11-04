# DAM-35 author evidence

Developer `/root/developer_dam35_projection`, 2026-11-04. Author checks only; independent source review, DAM-36 integration, DAM-30 integrated QA and actual user evaluation remain separate. No UI, importer, schema, dependency, build asset or example input was changed.

Base `b6b9d7bcc0ee7121db2e8fb2760aa9357ee661ca`, initially clean exclusive branch `feature/DAM-35-evidence-relations`. The enclosing commit freezes this candidate. API: [graph-api.md](../../../docs/graph-api.md). The changed brief/technical-plan sections record the authorized minimum projection under amended DAM-30 and residual waiting/owner scope in DAM-31.

## Target and commands

Observed: Node **23.7.0**, npm **10.9.2** (unused for installation/build), CPython **3.12.0**, Chromium/Chrome for Testing **156.0.8078.4**, macOS **26.6.2** build **25G83**, **arm64**. No installation, new dependency or external service.

From the repository root:

```sh
node web/tests/graph/check.mjs
node --check web/graph/project.js
node --check web/tests/graph/check.mjs
git diff --check
```

Final host public-API result: **TOTAL 27 PASS 27 FAIL 0 SKIP 0**, exit **0**, recorded in [results.txt](results.txt). Fixtures are synthetic declarations created by tests and accepted through actual `importBytes`; the clock/receipt sources are deterministic injected dependencies. No internals, role taxonomy or hardcoded graph fixture are mocked. Assertions use literal independently authored edge/source examples, plus invariants for immutability and equivalent accepted sets.

The unchanged browser importer regression used this dedicated server (port checked unused before launch):

```sh
/Library/Frameworks/Python.framework/Versions/3.12/bin/python3.12 -m http.server 8784 --bind 127.0.0.1 --directory web
/Users/loop/Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell --headless --no-sandbox --disable-gpu --user-data-dir=/tmp/dam35-chromium-profile --dump-dom --timeout=15000 --virtual-time-budget=10000 http://127.0.0.1:8784/tests/import/ > /tmp/dam35-import-dom.html 2> /tmp/dam35-import-chromium.stderr
```

Initial sandbox server launch exited **1**, `PermissionError: [Errno 1] Operation not permitted`; approved retry ran the identical own-loopback command. Chromium executed once and exited **0**. A Python HTMLParser extracted `pre#results` and asserted the completed line **TOTAL 168 PASS 168 FAIL 0 SKIP 0**, exit **0**; a browser CLI exit alone is not a test verdict. The server was stopped with Ctrl-C and Chromium exited after dump-dom. User previews and private Chrome were not touched.

## Actual development attempts

| Attempt | Observed public-API result | Total/pass/fail/skip |
| --- | --- | --- |
| 1 RED | Assignment returned no explicit participant/run/attempt relations instead of the three literal expected edges | 1/0/1/0 |
| 1 GREEN | Explicit assignment participant, assigned run and initial attempt sources | 1/1/0/0 |
| 2 RED | No parent-run, advice, handoff actor, check-target or revision edges | 2/1/1/0 |
| 2 GREEN | Explicit relations, failed check and separate revised passed check; no inherited outcome | 2/2/0/0 |
| 3 RED | Missing/wrong-kind/cross-task/conflicting QA targets incorrectly remained valid | 7/2/5/0 |
| 3 GREEN | Reference placeholders, exact origin sources and validity diagnostics | 7/7/0/0 |
| 4 RED | Scoped block-resolution relation absent; cycle diagnostic absent | 10/8/2/0 |
| 4 GREEN | Exact block scope and bounded informational cycle diagnostics; wrong-run revision already passed | 10/10/0/0 |
| Boundary expansion | Tests authored **after** implementation: empty, single, arbitrary typed IDs, branches/disconnected, runtime/completion, reporter labels, permutations/ties/nulls/retry, immutability, both check kinds, parent errors, all source/endpoints and programmer misuse | 25/25/0/0 |
| 5 RED | Wrong-kind actor participant/attempt references and exact cross-task conflict provenance missing | 27/25/2/0 |
| 5 GREEN | Typed reference detection and exact conflicting-event source IDs | 27/27/0/0 |

These are five observed semantic RED→GREEN cycles, with explicitly identified post-implementation checks, not an all-tests-first claim. Before first RED an obsolete `--experimental-default-type=module` Node flag failed setup (`bad option`); removed it and used ordinary `node` throughout. That setup failure is excluded from TDD evidence. Node runner itself returns exit 1 on any named test failure; early shell log-display commands returned the final `cat` status, so named totals are the evidence for those early runs. The fifth RED was directly observed with exit 1; final GREEN exit 0. No unexplained retry, flake, skipped or disabled test.

Internal durable logs retain every RED/GREEN and importer DOM/result under Studio's local report directory `agent-work-ledger/dam35`; they are not product runtime inputs. Complete new source/tests/API docs and the bounded documentation diff were reviewed. Links were checked as existing local targets. No manifest or configured build/lint command exists for this pure module; syntax checking is the applicable static check. Full UI tests were not run because no UI bytes changed; they remain DAM-36/parent controls. No claim of graph rendering, pointer/focus/viewport correctness, collision-free layout, live reporting, waiting/owner computation, persistence or performance certification.

## Executed source hashes

```text
fd39941c9082ae745ab692c6c327ee0bd5268eb839dd14c55425abf70741b969  web/graph/project.js
319fc0c4edd59e6c8a06c37baab9903ee4a916141163aad2abc892e46d0d6e76  web/tests/graph/check.mjs
55091dd7aac6832f1e420a6dbec74655af3b6dd2c464d09c7befe783aac30c4e  docs/graph-api.md
```

## Retro and metrics

Applied supplied retro guidance, recommendations only (no instruction edits):

1. Keep source lookup against the full accepted snapshot in the consumer. Evidence: cross-task identity conflict diagnostics need both exact records; verify every diagnostic action opens its named original event and separate receipt.
2. Preserve a deterministic executable module check in later automation. Evidence: this repository has no configured CI/lint guardrail; the public Node runner already fails with exit 1, so future CI should run it and the existing browser regression rather than invent another test system.
3. Retain completed-result inspection for headless browser checks. Evidence: Chromium dump-dom exits 0 independently of assertion verdict; verify automation requires the final total and zero failures.

Configured model/effort: **gpt-6.1-sol / medium**, source Director brief. Verified agent runtime identity/effort, tokens, total task latency, credits and task cost: **unavailable** (no task-scoped telemetry). Tool subprocess versions are observed environment evidence, not agent runtime identity. Director owns independent review and integration; DAM-36 waits for accepted DAM-35.
