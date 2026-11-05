# Agent Work Ledger

Inspect source-linked task relations, attempts and checks locally. Saved registered projects and whole-task sessions open by default from the local SQLite ledger: one automatic snapshot read on open/reload, then explicit Refresh for later reports. No account, application login or AI service is required.

Follow [local install and reporting](docs/local-service.md): install in a private virtual environment, then run `python -m agent_work_ledger serve --data-dir /private/awl-data --port 8785`. Open `http://127.0.0.1:8785/`. Register a project/session and report selected metadata through the three MCP tools at `/mcp`, using the official SDK or pinned Inspector with URL-only connection. The guide includes a safe synthetic multi-reporter journey, identical retries, stop/restart and recovery.

The service trusts processes/users able to connect to this machine’s loopback listener. It does not authenticate producers or isolate OS users/projects. Exact Host/present-Origin checks, no CORS and binding only127.0.0.1 constrain this local capability; they do not supply identity. No remote/public listener or deployment is supported. Future private SSH-tunnel operation requires separate validation; SSH administration alone would not protect a public HTTP port.

Select saved project and whole-task session **names**, then inspect graph cards by pointer or Enter. Close/Return preserves the selected context and viewport. All records, entities/relations and diagnostics expose exact supporting producer JSON and separate original ledger receipts, including cross-task contradiction sources. Failed QA targets its explicit attempt; a later revision/recheck never inherits acceptance. Missing/conflicting evidence stays unknown or ambiguous. Producer reports and receipt acceptance do not certify truth, review independence or completion.

Open `/` directly for saved work. Open `/demo` directly for the existing ten synthetic workflow events, loaded automatically through the strict byte parser into current-tab memory. Reloading `/demo` loads those same producer events with new current-tab receipts. Demo performs no ledger snapshot/health/MCP requests or durable writes; it never substitutes for saved history. The app has no top product header, mode chooser, Diagnostics menu, cross-mode link or routine success banner. Project/session names and Refresh remain in the saved view. Graph evidence diagnostics and exact sources remain inspectable in both views. Saved events and original `mcp` receipts persist in SQLite. No file importer, sample download, Task ID search, credential prompt or browser persistence. Empty saved history stays empty; failed reads retain prior accepted graph/source marked stale. Demo fetch/parse failure explicitly asks for reload, without a durable fallback.

Only selected structured diagnostic metadata belongs here: no prompts, transcripts or secrets. Reporting is opt-in and never collects conversations automatically. Raw v1 MCP envelopes retain [strict limits and identity](docs/event-contract.md), [parser API/goldens](docs/import-api.md), [source-linked graph contract](docs/graph-api.md), and [durable service contract](docs/ledger-api.md). The low-level byte parser remains validation infrastructure for MCP/Example, not a file-import UI.

The pure importer/projector and durable core are dependency-free. The UI bundles locked MIT React Flow, Dagre, React and React DOM locally; no CDN assets or AI analysis. See [notices](web/graph-ui/THIRD-PARTY-LICENSES.txt). Build with Node23.7/npm10.9.2:

```sh
npm ci --prefix graph-ui --ignore-scripts
npm run build --prefix graph-ui
```

[Installed process/browser checks](tests/service/README.md) document current tests and retired file-UI cases. [Core checks](tests/core/README.md) cover strict bytes, immutable registrations, SQLite ownership/atomic receipts/recovery, crash and capacity limits. [Architecture](docs/architecture.md) distinguishes implemented source and evidence from independent acceptance. DAM-31 waiting summaries, DAM-39 remote validation, DAM-40 day browsing, costs and factory-specific integration are outside this local result. MIT licensed; no PyPI publication is implied.
