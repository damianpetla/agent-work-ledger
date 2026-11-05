# Local installation and explicit MCP reporting

Use CPython3.12 on a local filesystem. The verified client/runtime pins are mcp2.3.0, Starlette1.10.0, Uvicorn0.54.0, httpx2 2.16.0, Inspector2.13.0; Node23.7/npm10.9.2 builds the bundled UI. Locks define the supported closure, not a security audit or other-platform guarantee.

## Install and start

Choose unused private paths and a dedicated available port; `/tmp` is disposable. From the checkout:

```sh
python3.12 -m venv /tmp/awl-venv
/tmp/awl-venv/bin/python -m pip install -r requirements.lock
/tmp/awl-venv/bin/python -m pip install .
npm ci --prefix tools/mcp-client --ignore-scripts --no-audit --no-fund
```

The non-editable package bundles seven fixed public assets; it needs no checkout at runtime. Build isolation uses pinned setuptools84.2.1/wheel0.48.0; offline installation may preinstall those tools and use `--no-build-isolation`. No global client configuration or runtime downloads are needed. Run outside checkout to avoid Python source shadowing:

```sh
cd /tmp
/tmp/awl-venv/bin/python -m agent_work_ledger serve --data-dir /tmp/awl-private/data --port 8785
```

Open `http://127.0.0.1:8785/`. Saved registered project/session names load with **one automatic snapshot read** on open/reload; use Refresh for later reports. No polling or login/token entry. Empty history is honestly empty. Disconnected/invalid reads retain previous graph/source/receipts marked stale. Expand closed **Diagnostics** and explicitly select **Example · synthetic** for separate ephemeral diagnostics. There is no file-import workspace/chooser/sample download/manual Task ID search. Durable history and original `mcp` receipts live in SQLite; Example remains in current-tab memory and clears on reload. No browser storage is used.

**Trusted local machine:** anyone able to connect to the loopback listener can read/report. No application authentication, authenticated producer identity, OS-user/project isolation or credential/config prerequisite exists. Serve binds exactly127.0.0.1, one worker, no remote bind/reloader/proxy trust or permissive CORS. Every request, including assets, requires exact configured Host; present Origin must equal `http://127.0.0.1:<port>`. Invalid/duplicate headers reaching ASGI return403; malformed HTTP framing is rejected natively before dispatch (duplicate Host:400). These checks do not authenticate local processes. No public HTTP deployment is supported. Future private SSH-tunnel operation is separate validation; SSH administration alone would not protect a publicly listening port.

Stop this foreground process with **Ctrl-C**. Restart with the same data directory and command. No database/schema migration is needed. Preserve existing data and first receipts; old token/config files are unused and must remain untouched. Data directory0700/database0600 and a lifetime exclusive owner lock remain mandatory. A second owner, corruption or unknown storage version fails readiness, never recreates a successful empty ledger. Back up only after stopping this owner (or via SQLite consistent backup); preserve failed originals and validate a separate restored copy. No reset/repair/migration command exists. GET `/v1/health` and `/v1/snapshot` use versioned no-store responses; writes are MCP-only.

## Connect, report and retry

Both real clients connect by URL only to exact `/mcp`, no Authorization/header configuration. Use a separate Inspector state directory so the helper never changes personal settings:

```sh
/tmp/awl-venv/bin/python -m agent_work_ledger.report sdk --port 8785
/tmp/awl-venv/bin/python -m agent_work_ledger.report inspector --executable /absolute/checkout/tools/mcp-client/node_modules/.bin/mcp-inspector --port 8785 --state-dir /tmp/awl-private/inspector-state
```

Discovery lists exactly `register_project`, `register_session`, `append_events`; verified negotiated protocol2026-07-28. Direct Inspector supports `--cli http://127.0.0.1:8785/mcp --transport http`; a generic connection config, if your client requires one, is `{"mcpServers":{"awl":{"type":"streamable-http","url":"http://127.0.0.1:8785/mcp"}}}` with no headers. The wrapper isolates both MCP_CLIENT_CONFIG_PATH and MCP_CATALOG_PATH and passes the URL directly. SDK uses `Client(streamable_http_client(url,http_client=httpx2.AsyncClient(trust_env=False)))` as an async context; no auth is needed.

Explicitly report the safe synthetic journey (two projects/sessions, two separate client processes reporting12 primary events plus one independent task):

```sh
/tmp/awl-venv/bin/python -m agent_work_ledger.report journey --args-dir /tmp/awl-private/journey --port 8785 --inspector-executable /absolute/checkout/tools/mcp-client/node_modules/.bin/mcp-inspector --state-dir /tmp/awl-private/inspector-state
```

The helper creates private argument files if that directory is absent; repeats reuse identical files/IDs/content, producing duplicates while preserving first receipts. It never reads chats or reports automatically. Refresh D, choose **Synthetic project A / Synthetic multi-reporter journey**. Failed QA targets v1; explicit revision creates v2; the named v2 recheck passes. Block/resolution retain exact task/run/attempt. A final handoff requests user review, never acceptance. Project B contains one independent report. `expected.json` lists IDs/counts, never fabricated receipts.

For selected individual reporting, first prepare argument files, then use the named tool:

```sh
/tmp/awl-venv/bin/python -m agent_work_ledger.report prepare-example --output-dir /tmp/awl-private/selected
/tmp/awl-venv/bin/python -m agent_work_ledger.report sdk --port 8785 --tool register_project --args-file /tmp/awl-private/selected/project-a.args.json
/tmp/awl-venv/bin/python -m agent_work_ledger.report sdk --port 8785 --tool register_session --args-file /tmp/awl-private/selected/session-a.args.json
/tmp/awl-venv/bin/python -m agent_work_ledger.report sdk --port 8785 --tool append_events --args-file /tmp/awl-private/selected/journey-sdk.args.json
/tmp/awl-venv/bin/python -m agent_work_ledger.report inspector --executable /absolute/checkout/tools/mcp-client/node_modules/.bin/mcp-inspector --port 8785 --state-dir /tmp/awl-private/inspector-state --tool append_events --args-file /tmp/awl-private/selected/journey-inspector.args.json
```

For your own selected raw v1 envelope, explicitly register its existing task identity and preserve its JSON text:

```sh
/tmp/awl-venv/bin/python -m agent_work_ledger append-args --session-id producer:session --envelope-file /private/selected-events.json --output /tmp/awl-private/selected.args.json
```

Pass this args file to append_events. This reporting helper is not an application file importer: it preserves inner duplicate keys/raw bytes for strict core rejection. Mixed-task input must be explicitly partitioned; no project/session inference. Missing response means unconfirmed: retry identical session/event IDs/content, never invent another attempt for transport retry. SDK `--discard-response` deliberately discards an actual committed response for testing this case. Domain errors use matching versioned structured/text results with isError:true over HTTP200; invalid typed tool arguments are protocol errors, Host/Origin/body bounds are HTTP rejections. Receipt confirms acceptance only, not producer truth or QA independence. Metadata only: no prompts/transcripts/secrets, automatic collection or evidence fetching.

## Checks and limits

[Installed service/browser commands](../tests/service/README.md) distinguish real wire checks and instrumented negative hydration fixtures. [Core facade tests](../tests/core/README.md) retain persistence/strict parser/crash/capacity checks. The source-only v1 parser and golden fixtures remain validation infrastructure, without UI file import. Old14 file-UI and10 file-workspace browser cases are retired; current installed durable checks cover source/pointer/focus/viewport/long text and the new defaults. Package runtime never falls back to checkout assets/test pages.

Limits remain1000projects/1000sessions/10000events/8MiB compact ASCII-escaped producer JSON; 32MiB snapshot hydration, 1MiB/1000occurrences inner envelope and4MiB outer MCP body even chunked. Local DELETE-journal SQLite only, no network-filesystem/multiworker/Windows or hosted-agent guarantee. No PyPI publish, VPS/public hosting, rich day UI, costs or factory integration. [Architecture](architecture.md) preserves the historical FigJam quota fallback. Author checks and exact-version independent review/QA/user acceptance are separate evidence.
