# Local MCP setup and support contract

**Tech Lead · gpt-6.1-sol · medium (configured)**

This page freezes dependencies and the public delivery interface for DAM-32. **The Ledger service/package commands below are a required implementation target and are not yet implemented at this contract revision.** Current ordinary D remains available through README's static-server instructions. Dependency probes do not establish that the product works.

## Exact verified dependency baseline

On 2026-11-04, public PyPI resolution and actual isolated installation selected:

| Component | Version / scope |
| --- | --- |
| CPython | 3.12.0 (actual probe runtime); initial product support is 3.12 on macOS arm64, with this patch validated |
| SQLite | 3.42.0, bundled with that Python |
| Official Python SDK / types | `mcp==2.3.0`, `mcp-types==2.3.0` |
| ASGI | `starlette==1.10.0`, `uvicorn==0.54.0` |
| Client HTTP | `httpx2==2.16.0` |
| Reference real CLI | `@modelcontextprotocol/inspector==2.13.0` |
| Node / npm probe runtime | 23.7.0 / 10.9.2; Inspector package requires Node >=22.19.0 |
| MCP wire | SDK client negotiated `2026-07-28`; Inspector called the same server with `--protocol-era modern` |

[requirements.in](../requirements.in) names direct dependencies; [requirements.lock](../requirements.lock) pins the full resolved Python closure. [Client manifest](../tools/mcp-client/package.json) and [npm lock](../tools/mcp-client/package-lock.json) pin Inspector and transitive artifacts. These support independent compatibility checks; they do not replace the existing graph-ui lock. The Python lock is exact version resolution, not a hash-based/supply-chain audit or cross-platform support claim. Change dependencies only with resolved install/check and affected MCP/UI tests. Public sources: [PyPI exact MCP2.3.0](https://pypi.org/project/mcp/2.3.0/), [SDK](https://py.sdk.modelcontextprotocol.io/), [running/ASGI](https://py.sdk.modelcontextprotocol.io/run/), [Inspector](https://modelcontextprotocol.io/docs/2026-07-28/tools/inspector), [current protocol transport](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http). Package metadata and actual install take priority over a generic docs site's different minimum Python summary. No global Python/Node install is needed or authorized by this document.

Runnable now, from repository root, to reproduce dependency setup in user-chosen isolated directories:

```sh
python3.12 -m venv /tmp/awl-dependency-check
/tmp/awl-dependency-check/bin/python -m pip install -r requirements.lock
/tmp/awl-dependency-check/bin/python -m pip check
npm ci --prefix tools/mcp-client --ignore-scripts --no-audit --no-fund
tools/mcp-client/node_modules/.bin/mcp-inspector --cli --version
```

Do not reuse somebody else's environment/data/service port. Package/network downloads occur during setup, never ordinary runtime event inspection. A developer must add product packaging with all required bundled public web assets and exact runtime dependency declaration aligned to the lock. Supported clean-install command will be `python -m pip install --no-deps .` after installing the lock inside the chosen venv; update this page with actual install/build evidence and commands when it exists. No PyPI publication is required for the local source installation.

## Required standalone launch and data interface (not yet implemented)

The implementation must expose this generic module CLI, without hardcoded user paths or Studio configuration:

```sh
/path/to/awl-venv/bin/python -m agent_work_ledger serve --data-dir /path/to/private/awl-data --token-file /path/to/private/awl-token --port 8785
```

Use an available dedicated port. CLI accepts only `127.0.0.1` for DAM-32; creates/validates a 0700 data directory and 0600 `ledger.sqlite3`; rejects competing database ownership through the core Ledger constructor. The service constructs one Ledger at startup and drains requests/closes it on shutdown; independent DAM-37 ownership QA uses that same public lifecycle without starting ASGI. A token file must contain a locally generated secret with at least 32 bytes entropy, permission 0600, outside served/versioned directories. Do not put the credential on the service command line or in its URL. A safe local generation command is:

```sh
python3.12 - <<'PY'
import os, secrets
from pathlib import Path
p = Path('/tmp/awl-local-token')  # choose a private destination; never overwrite another token
fd = os.open(p, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(fd, 'w') as f:
    f.write(secrets.token_urlsafe(32) + '\n')
PY
```

Open `http://127.0.0.1:8785/`, choose the durable workspace and explicitly enter the token locally. Token stays in page memory. Public assets never contain accepted history or credentials. Service reads require it. Select a registered project/session and explicitly Refresh; reload requires token re-entry but accepted history survives. Example/import files are distinct ephemeral diagnostic workspaces; they never silently become durable. Stop the **dedicated** service with Ctrl-C; restart using the same data/token paths. Copy a stopped database for backup, keeping its original intact; do not copy a running database without SQLite backup API/WAL handling. Unknown/corrupt/newer-version storage fails safely with actionable guidance, never resets to empty. A missing/failed response is unconfirmed: preserve exact IDs/content for retry, not a new attempt/session.

## Public reporting and real clients

Follow [service contract](ledger-api.md): register the project, then one whole-task session with explicit separate sessionId and taskId, then append raw v1 JSON text. Multiple agents report their own actor/run/attempt IDs inside that same registered session. Emit explicit delegation/handoff, block/resolution and review/QA targeted to an exact attempt; a new revision does not inherit earlier pass evidence. Keep configured settings, reported-tool verification and unknown separate. Metadata only; no prompts/transcripts/secrets, automatic reporting or fetched evidence references. Reporting guidance is generic product documentation; no Studio activation is required.

Pinned Inspector CLI is an independently implemented real MCP client, suitable for manual/scripted safe reporting without an AI subscription. The expected operator entry point is:

```sh
tools/mcp-client/node_modules/.bin/mcp-inspector --cli --config /path/to/private/awl-inspector.json --server awl --protocol-era modern --method tools/list --format json
```

A private Inspector config names `mcpServers.awl` with `type: "streamable-http"`, `url: "http://127.0.0.1:8785/mcp"`, and `headers.Authorization: "Bearer <locally supplied secret>"`; keep file 0600 outside the repo. This exact config shape was accepted by pinned Inspector2.13.0 during the synthetic probe. Developer must document a safe generator reading the existing token file rather than asking the user to paste it into a command or commit it. Use an isolated `MCP_CLIENT_CONFIG_PATH` when testing. Do not set `MCP_CATALOG_PATH` with `--config`: the pinned client treats catalog and config as mutually exclusive. Ad-hoc runs without `--config` may use an isolated `MCP_CATALOG_PATH`. Leave the user's installed client settings untouched. Explicit reporting uses the same entry point with `--method tools/call --tool-name register_project` (or register_session/append_events) and `--tool-args-json` for exact argument objects. The raw envelope goes in `envelopeJson` string; do not lose duplicate-key validation through a parsed event object. A local generated args file/helper is preferable to shell-escaping JSON; publish it with the implementation and verify it with real Inspector. Never put a real token in args/output. Tool descriptions/schema guide reporting; they do not prove any autonomous agent used the tools.

The official Python SDK client must also run in a **separate process** over real HTTP, not `Client(serverObject)` or an in-process mock. Use `Client(streamable_http_client(url, http_client=authenticated_httpx2_client))`; auth belongs on the supplied `httpx2.AsyncClient`. Verify named structured tool results and error flags, not merely transport connection. Registration/append domain failures arrive as `isError:true` with the versioned error envelope over a successful MCP protocol response (HTTP 200 in JSON response mode); authentication/Host/Origin/outer-body rejection is a separate HTTP transport failure. The only data HTTP routes are read-only snapshot and health; no HTTP registration/append endpoint or conflict-status mapping is implied. Run automated SDK integration plus Inspector and ordinary D inspection in DAM-32 independent QA. Neither client is a claimed automated agent-host integration, and no paid inference is required. More agent hosts require their own tested support entry later.

## Evidence targets

Developer must supply runnable Python core/wire test command, clean package install evidence, a safe synthetic report command/client helper, and actual stop/restart/response-loss scenarios. Independent DAM-37 QA precedes consumer integration; independent DAM-32 QA follows the full public path and then user acceptance. Existing graph/import/workspace/browser regressions remain required for changed consumers, using isolated Chromium and temporary output. A dependency echo probe is the only MCP runtime evidence at this documentation commit; registration, database recovery, security matrix, durable snapshot/UI, product package and user trial remain **not run**. See [architecture](architecture.md) for the source/implemented/verified distinction. Self-hosted TLS/proxy packaging and actual VPS rollout are separate DAM-39 work; no Studio integration or day UI here.
