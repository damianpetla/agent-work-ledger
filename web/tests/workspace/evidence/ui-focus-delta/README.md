# Legacy driver focus synchronization

Developer · base `22c26e095679b3436b6647b6b4be299f808f78d4`. Independent QA reproduced two failures in the legacy runner on Chromium headless shell: `selectFile()` schedules initial source-heading focus; the next scenario could focus timeline button 2 before that handoff completed, so its physical Tab reached the wrong control. This was driver synchronization, not a product keyboard defect.

The sole code delta waits for observable `document.activeElement.id === "source-title"` immediately before setting `.source-button[1].focus()`. Existing CDP Tab/Enter actions and all assertions remain unchanged. QA supplied this exact wait after its isolated observer passed. Historical 22c author results/source hashes remain untouched; independent QA owns its two original failure logs.

Executed once after the agreed fix, exit 0:

```sh
AWL_TEST_ORIGIN=http://127.0.0.1:8787 AWL_TEST_CHROMIUM=/Users/loop/Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell AWL_TEST_OUTPUT=/tmp/awl-d36-ui-sync-headless node web/tests/ui/check.mjs
```

**14/14 UI PASS**, including actual integrated **168/168 importer PASS**. Tab reaches demo:03, Enter focuses inspector and Return restores demo:03. `results.txt` and `driver-hashes.json` identify this delta. Syntax and diff checks pass.

App, UI source, generated bundles, importer, projector, fixtures and dependencies are byte-unchanged from 22c. No 27/6/10 regression set or npm build was repeated because those inputs are unchanged. Dedicated test server 8787 stopped after this run; preview 8786 and QA's 8788 were not touched. New containing commit requires independent impact assessment; no PR/push/merge/tracker operation was performed.

Configured Sol/medium; runtime identity, tokens and task cost unavailable. Next owner: Director and independent Reviewer/QA.
