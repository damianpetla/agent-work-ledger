# Local MCP installation and reporting

DAM-38 implements this local source installation, official-SDK MCP service and ordinary D durable workspace. Supported author target: CPython **3.12.0**, SQLite **3.42.0**, macOS **26.6.2 arm64**, Chromium **156.0.8078.4**. Other platforms, remote hosting, OAuth/hosted-agent integrations and VPS deployment are unverified/outside DAM-32. Independent integrated QA and user acceptance remain separate from author checks.

## Install in an isolated environment

From the source checkout, with CPython 3.12 and Node >=22.19.0 available:

```sh
python3.12 -m venv /tmp/awl-venv
/tmp/awl-venv/bin/python -m pip install -r requirements.lock
/tmp/awl-venv/bin/python -m pip install --no-deps .
/tmp/awl-venv/bin/python -m pip check
npm ci --prefix tools/mcp-client --ignore-scripts --no-audit --no-fund
tools/mcp-client/node_modules/.bin/mcp-inspector --cli --version
```

Choose your own unused private paths; `/tmp` is disposable. Product source installation builds a wheel with eight fixed public assets. It is not editable and needs no checkout at runtime. Pinned build tools are setuptools 84.2.1/wheel 0.48.0 in `pyproject.toml`; pip's isolated build may download them during setup. Offline preparation may install those exact tools in the chosen venv then use `--no-build-isolation`. Runtime performs no package/CDN download or paid inference. `requirements.in`, lock and project direct pins agree: mcp 2.3.0, starlette 1.10.0, uvicorn 0.54.0, httpx2 2.16.0. Inspector 2.13.0 is the pinned independent reference client. Locks pin versions, not a security audit or universal compatibility guarantee. [SDK](https://py.sdk.modelcontextprotocol.io/), [Inspector](https://modelcontextprotocol.io/docs/2026-07-28/tools/inspector) and [transport](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http) are primary references.

Run subsequent commands from a directory **outside the checkout** so Python cannot shadow the installed package with source. Use full paths to the chosen interpreter and Inspector executable.

## Private setup, start, inspect and stop

```sh
cd /tmp
/tmp/awl-venv/bin/python -m agent_work_ledger init-token --output /tmp/awl-private/token
/tmp/awl-venv/bin/python -m agent_work_ledger inspector-config --token-file /tmp/awl-private/token --port 8785 --output /tmp/awl-private/inspector.json
/tmp/awl-venv/bin/python -m agent_work_ledger serve --data-dir /tmp/awl-private/data --token-file /tmp/awl-private/token --port 8785
```

Use a dedicated available port. Serve binds only 127.0.0.1, one worker, no reload/proxy-header trust. Token generation uses 32 random bytes; token/config files are 0600 and helpers refuse to overwrite existing files. Keep these files outside public/versioned directories; never put tokens in URLs, shell arguments, committed examples or logs. Service validates token file ownership/mode/shape and the core owns a 0700 data directory / 0600 ledger.sqlite3. No user/client global settings are changed.

Open [ordinary D](http://127.0.0.1:8785/), choose **Durable ledger**, enter the token from your local private token file, and press **Refresh**. Select the explicit registered project and whole-task session. Token remains in page memory only and must be entered again after reload. Refresh performs one authenticated same-origin read; it does not report events or poll. A stale/unavailable/error response retains the last accepted graph/source/receipts. Example and Imported files remain separate browser-memory diagnostics. Durable sources show **Received** and original `mcp` receipts; acceptance does not verify a producer's report or a QA outcome.

Stop only this dedicated foreground service with **Ctrl-C**. Restart with the same serve command/data/token paths; registrations/events/first receipts survive. A second owner of the same data directory fails startup. `GET /v1/health` and `GET /v1/snapshot` require Authorization and return no-store versioned envelopes. Registration and append are MCP-only; there is no HTTP write route. Unknown/corrupt/newer storage fails readiness with recovery guidance, never empty-success. Copy backups only after this owner has stopped; preserve a failed original and check a separate restored copy. No migration/reset/repair command exists.

## Connect and explicitly report synthetic metadata

Prepare a private safe sample journey (12 primary records plus one distinct second-project task, deliberately `qa32:*`, not the built-in Example):

```sh
/tmp/awl-venv/bin/python -m agent_work_ledger.report prepare-example --output-dir /tmp/awl-private/journey
/tmp/awl-venv/bin/python -m agent_work_ledger.report sdk --token-file /tmp/awl-private/token --port 8785
/tmp/awl-venv/bin/python -m agent_work_ledger.report inspector --executable /absolute/checkout/tools/mcp-client/node_modules/.bin/mcp-inspector --config /tmp/awl-private/inspector.json --state-dir /tmp/awl-private/inspector-state
```

Discovery must show exactly `register_project`, `register_session`, `append_events`. Both real clients use Streamable HTTP exact `/mcp`; tested negotiated protocol 2026-07-28. Helpers isolate `MCP_CLIENT_CONFIG_PATH` and remove `MCP_CATALOG_PATH` for config mode. Do not combine Inspector `--config` and a catalog; do not reuse personal client settings. The helper reads the private token file/config; credentials never appear on its command line.

Report/retry the entire sample explicitly with one command (SDK and Inspector run as separate processes; credentials remain in private files):

```sh
/tmp/awl-venv/bin/python -m agent_work_ledger.report journey --args-dir /tmp/awl-private/journey --token-file /tmp/awl-private/token --port 8785 --inspector-executable /absolute/checkout/tools/mcp-client/node_modules/.bin/mcp-inspector --inspector-config /tmp/awl-private/inspector.json --state-dir /tmp/awl-private/inspector-state
```

To inspect each step individually, use the SDK helper for each row below (substitute its tool and args-file), then use the Inspector helper for the indicated second part:

```sh
/tmp/awl-venv/bin/python -m agent_work_ledger.report sdk --token-file /tmp/awl-private/token --port 8785 --tool register_project --args-file /tmp/awl-private/journey/project-a.args.json
```

| Client | Tool | File in the journey directory |
| --- | --- | --- |
| SDK | register_project | project-a.args.json |
| SDK | register_project | project-b.args.json |
| SDK | register_session | session-a.args.json |
| SDK | register_session | session-b.args.json |
| SDK | append_events | journey-sdk.args.json |
| Inspector | append_events | journey-inspector.args.json |
| SDK | append_events | second.args.json |

```sh
/tmp/awl-venv/bin/python -m agent_work_ledger.report inspector --executable /absolute/checkout/tools/mcp-client/node_modules/.bin/mcp-inspector --config /tmp/awl-private/inspector.json --state-dir /tmp/awl-private/inspector-state --tool append_events --args-file /tmp/awl-private/journey/journey-inspector.args.json
```

These are independent client processes reporting to the **same explicit whole-task session**, with distinct producer actors/runs/attempts. Synthetic QA failed on v1, explicit revision creates v2, and only the named v2 recheck passes. Block/resolution share exact task/run/attempt. Final handoff requests user review; it records no user acceptance. Select project A/session A in D and Refresh to inspect 12 original sources and receipts; project B/session B has one separate record. `expected.json` gives fixture IDs/counts, never fabricated receipts.

Repeat either append command unchanged: zero new records, duplicate IDs, first receipts retained. Reconnect/restart uses the original session and task. A missing response is **unconfirmed**: preserve exact IDs/content and retry; do not create a new session/attempt to retry delivery. `--discard-response` on the SDK test helper deliberately discards an actual committed response for this demonstration; it is not a production service fault switch. Domain failures return MCP `isError:true` plus matching structured/text versioned error over HTTP 200; wrong tools/typed arguments are protocol errors. Authentication/Host/Origin/body-limit failures are separate HTTP transport rejections.

For your own v1 raw file, explicitly register its existing task ID and use:

```sh
/tmp/awl-venv/bin/python -m agent_work_ledger append-args --session-id producer:session --envelope-file /private/selected-events.json --output /tmp/awl-private/selected.args.json
```

Then pass that args file to append_events. This helper preserves the raw inner JSON, including duplicate keys for the core to reject. Mixed-task files must be explicitly partitioned by exact task ID; no event project/session fields are invented. Metadata only: no conversations, prompts, transcripts or secrets; no automatic collection, agent orchestration or evidence fetching. A preconfigured bearer protects one owner's ledger, not project-level tenant authorization or authenticated producer labels.

## Author checks and limits

[Service harness](../tests/service/README.md) supplies installed-process SDK/Inspector/HTTP security/restart tests and ordinary-D browser controls. [Core tests](../tests/core/README.md) retain the independently checked persistence facade. `node web/tests/durable/check.mjs` exercises strict raw hydration, malicious global metadata/receipt maps, Unicode and bounded capacity. Existing importer 170, graph 27, workspace 6 and UI/workspace Chromium regressions remain required for changed consumers. Package tests launch outside checkout without PYTHONPATH; no source fallback is supported. Test pages are source-only and are not publicly served by the installed product.

Capacity: 1000 projects, 1000 sessions, 10000 events, 8 MiB compact ASCII-escaped producer JSON and 32 MiB snapshot read bound; per-input 1 MiB/1000 occurrences, outer MCP 4 MiB even without Content-Length. Local DELETE journaling only; no network filesystem/multiworker/Windows/hosted-agent compatibility claim. Self-hosted TLS/proxy packaging and VPS access are separate DAM-39. Rich day browsing is DAM-40; Studio integration remains excluded. Source architecture retains the old FigJam quota limitation; author runtime evidence does not update that board or accept DAM-32.
