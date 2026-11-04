# Shared durable core checks

Use CPython 3.12 from the repository root. This core has no third-party dependencies and no ASGI prerequisite:

```sh
python3.12 -m unittest discover -s tests/core -v
python3.12 -m unittest discover -s tests/core -k real_crash -v
python3.12 -m unittest discover -s tests/core -k process_owner -v
python3.12 -m unittest discover -s tests/core -k real_sqlite_busy -v
python3.12 -m unittest discover -s tests/core -k real_file_size_failure -v
python3.12 -m unittest discover -s tests/core -k capacity -v
python3.12 -m unittest discover -s tests/core -k exact_eight -v
```

Every test uses its own temporary directory; ordinary writes and observations go through `Ledger`. The worker script is a test helper only. The tests invoke it using the current interpreter with an explicit source-root `PYTHONPATH`.

- Ownership workers print `ready`, then wait on stdin. The parent observes the ready line, verifies a second process fails `busy`, closes stdin or kills only its own worker, waits for actual exit, and reopens the unchanged history. No sleep synchronization.
- Crash workers invoke `os._exit(73)` directly at `before_commit`/`after_commit`; the parent waits for that exit, reopens through the facade, observes prior/committed history and retries the exact same IDs. The test seeds prior history and submits two events atomically. These are real process interruptions, separate from the exception-path tests.
- Busy uses an external SQLite `BEGIN IMMEDIATE` on the test database; Ledger must return `busy` after its configured five-second timeout and recover after rollback. The elapsed assertion allows 0.5 seconds for scheduling overhead.
- Write failure uses only a child-process `RLIMIT_FSIZE` at the fixture's current database size, with `SIGXFSZ` ignored in that child. A larger append encounters a real SQLite file write failure. It cannot fill the host disk or alter parent limits. Reopen compares the exact earlier snapshot. This recipe is supported on the tested macOS/POSIX target, not Windows.
- Negative storage tests copy a stopped valid database, alter only each private copy (invalid bytes, newer storage version, malformed receipt, wrong task binding), hash it before/after failed constructors and retry construction to detect leaked ownership. SQL is solely a negative-fixture/lock mechanism; it never manufactures accepted history.
- Capacity populates 1000 projects/sessions and 10000 events through public calls. The separate 8 MiB test computes compact ASCII-escaped JSON sizes independently with stdlib `json.dumps`, fills the last event with surrogate/ASCII text to reach exactly 8388608 bytes, then checks mixed new/duplicate overflow, duplicate-only retry and restart. No limits are monkeypatched.
- Snapshots are read during serialized concurrent public calls, with matching complete event/receipt identities. All tasks are retained in the global snapshot. The facade returns detached values; caller mutations cannot change durable history.

Browser parity uses unchanged importer code and the existing browser harness at `/tests/import/`. `unicode.json` is shared raw input containing paired escapes, lone high/low escapes and 500 non-BMP code points. Browser tests retry with literal non-BMP JSON, check 501 rejection and decoded Unicode-key collisions. Python consumes the same file and the existing golden `expected.json`, all-kinds, out-of-order, malformed, conflict and synthetic-timeline fixtures; multi-task fixtures are explicitly partitioned without changing any producer fields.

Serve only `web` on a dedicated available loopback port, then open the harness in isolated Chromium; never reuse an existing preview or private browser profile. The page prints named checks and TOTAL/PASS/FAIL/SKIP. An optional reproducible headless capture with a **new, dedicated** profile is:

```sh
python3.12 -m http.server 18937 --bind 127.0.0.1 --directory web
/path/to/isolated/chromium --headless --no-sandbox --disable-gpu --user-data-dir=/tmp/awl-core-qa-profile --dump-dom --virtual-time-budget=5000 http://127.0.0.1:18937/tests/import/
```

Stop only your dedicated server. The headless command's exit code alone is insufficient: inspect the page's FAIL count. Graph/workspace pure regressions remain `node web/tests/graph/check.mjs` and `node web/tests/workspace/check.mjs`. No graph/UI source or bundle changes belong to this core slice, so graph rebuilding and ordinary product UI/MCP installation checks belong to DAM-38/32 integration.

# Consumer interface and lifecycle

```python
from agent_work_ledger.ledger import Ledger, LedgerError

with Ledger(private_data_directory) as ledger:
    try:
        result = ledger.register_project('synthetic:p', 'Synthetic project')
        ledger.register_session('synthetic:s', 'synthetic:p', 'synthetic:t', 'Synthetic task')
        # ledger.append_events('synthetic:s', raw_json_text)
        snapshot_result = ledger.snapshot()
    except LedgerError as error:
        error_result = error.as_result()
```

Public successful operations already return `{serviceVersion:1,ok:true,data:...}`. `LedgerError` exposes `code`, `message`, nullable `eventIndex`, `field`, `eventId`, and `as_result()` returns the single versioned failure envelope. The transport must translate this once; do not repeat validation/equality or access SQLite directly. Constructor/close are lifecycle calls, not result envelopes. An already closed instance cannot reopen; construct another instance. Context exit preserves the caller's exception. One instance serializes concurrent calls with a reentrant thread lock and holds an OS `flock` until close/process exit.

Storage uses SQLite version1, foreign keys, synchronous FULL and DELETE rollback journaling. WAL-mode files fail startup rather than receiving untested WAL recovery. Copy backups only after the dedicated owner has closed. Keep the original database intact; restore/check a separate copy. No migration, repair/reset, backup command, service, CLI, packaging or transport is implemented by this slice. DAM-38 packages these source modules and consumes one facade instance for its entire application lifetime.

The default clock is UTC milliseconds; default IDs are UUIDs. Test-only `now`, `receipt_id`, `fault` dependencies must never be exposed through the production transport/configuration. Capacity is 1000 projects, 1000 sessions, 10000 events and 8 MiB compact ASCII-escaped producer JSON; 32 MiB serialized read guard. Valid records within these bounds cannot naturally reach the read guard; the guard is defensive, not a demonstrated large-response service benchmark. Only local macOS arm64/POSIX with CPython3.12 is currently exercised; no network filesystem, multi-process concurrent writer, Windows or deployment support is asserted.
