"""Single-owner durable v1 ledger. All public operations serialize on one connection."""
from contextlib import contextmanager
import datetime
import fcntl
import os
from pathlib import Path
import sqlite3
import threading
import uuid

from .validation import (LedgerError, dump, exact, fail, identifier, normalize_string,
                         parse, text, valid_timestamp, validate)


SCHEMA = '''
CREATE TABLE projects (id TEXT PRIMARY KEY, record TEXT NOT NULL);
CREATE TABLE sessions (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
 task_id TEXT NOT NULL UNIQUE, record TEXT NOT NULL);
CREATE TABLE events (id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id),
 producer TEXT NOT NULL, receipt TEXT NOT NULL);
PRAGMA user_version = 1;
'''
RECOVERY = 'Storage is unavailable. Preserve the original files; restore a checked separate backup or correct permissions, then reopen Ledger.'


def success(data):
    return {'serviceVersion': 1, 'ok': True, 'data': data}


def storage_error(error):
    if isinstance(error, sqlite3.OperationalError) and getattr(error, 'sqlite_errorcode', 0) & 255 in (sqlite3.SQLITE_BUSY, sqlite3.SQLITE_LOCKED):
        return LedgerError('busy', 'Storage is busy. Release the other transaction and retry unchanged input.')
    return LedgerError('storage_unavailable', RECOVERY)


class Ledger:
    def __init__(self, data_dir, *, now=None, receipt_id=None, fault=None):
        self._connection = None
        self._lock_file = None
        self._mutex = threading.RLock()
        self._closed = True
        self._now = now or (lambda: datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z'))
        self._receipt_id = receipt_id or (lambda: str(uuid.uuid4()))
        self._fault = fault
        try:
            self.data_dir = Path(data_dir).resolve()
            self.data_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
            os.chmod(self.data_dir, 0o700)
            lock_path = self.data_dir / '.ledger.lock'
            fd = os.open(lock_path, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
            self._lock_file = os.fdopen(fd, 'a+b')
            try:
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                raise LedgerError('busy', 'This ledger is already owned. Close the other Ledger or stop its process, then reopen.') from None
            path = self.data_dir / 'ledger.sqlite3'
            existed = path.exists()
            if path.is_symlink():
                raise LedgerError('storage_unavailable', RECOVERY)
            # Create with private permissions before SQLite opens it (no permissive umask window).
            if not existed:
                created = os.open(path, os.O_CREAT | os.O_EXCL | os.O_RDWR, 0o600)
                os.close(created)
            os.chmod(path, 0o600)
            self._connection = sqlite3.connect(path, timeout=5, isolation_level=None, check_same_thread=False)
            self._connection.execute('PRAGMA foreign_keys = ON')
            self._connection.execute('PRAGMA synchronous = FULL')
            version = self._connection.execute('PRAGMA user_version').fetchone()[0]
            if not existed:
                self._connection.executescript('BEGIN IMMEDIATE;\n' + SCHEMA + '\nCOMMIT;')
            elif version != 1:
                raise LedgerError('unsupported_version', 'Unsupported storage version. Preserve this database and reopen with a compatible version; do not reset it.', field='storageVersion')
            if self._connection.execute('PRAGMA journal_mode').fetchone()[0] != 'delete':
                raise LedgerError('storage_unavailable', RECOVERY)
            self._closed = False
            with self._transaction():
                if self._connection.execute('PRAGMA integrity_check').fetchall() != [('ok',)]:
                    raise LedgerError('storage_unavailable', RECOVERY)
                if self._connection.execute('PRAGMA foreign_key_check').fetchone():
                    raise LedgerError('storage_unavailable', RECOVERY)
                self._read_snapshot()
        except BaseException as error:
            try:
                self.close()
            except Exception:
                pass
            if isinstance(error, (sqlite3.Error, OSError, ValueError, TypeError)):
                raise storage_error(error) from None
            raise

    def __enter__(self):
        self._ensure_open()
        return self

    def __exit__(self, *_):
        self.close()
        return False

    def close(self):
        with self._mutex:
            self._closed = True
            error = None
            try:
                if self._connection is not None:
                    try:
                        self._connection.rollback()
                    finally:
                        self._connection.close()
            except (sqlite3.Error, OSError) as exc:
                error = storage_error(exc)
            finally:
                self._connection = None
                if self._lock_file is not None:
                    try:
                        self._lock_file.close()  # descriptor close releases flock, including partial startup
                    except OSError as exc:
                        error = storage_error(exc)
                    finally:
                        self._lock_file = None
            if error:
                raise error
        return None

    def _ensure_open(self):
        if self._closed:
            raise LedgerError('storage_unavailable', 'Ledger is closed. Reopen by constructing a new Ledger with the same data directory.')

    @contextmanager
    def _transaction(self, write=False):
        with self._mutex:
            self._ensure_open()
            try:
                self._connection.execute('BEGIN IMMEDIATE' if write else 'BEGIN')
                yield
                self._connection.commit()
            except BaseException as error:
                try:
                    self._connection.rollback()
                except sqlite3.Error:
                    pass
                if isinstance(error, (sqlite3.Error, OSError)):
                    raise storage_error(error) from None
                raise

    def _metadata(self):
        try:
            timestamp, receipt = self._now(), self._receipt_id()
            if not valid_timestamp(timestamp) or not self._valid_receipt_id(receipt):
                raise ValueError()
            return timestamp, receipt
        except Exception:
            raise LedgerError('receipt_error', 'Provide a valid UTC clock and nonempty ASCII receipt IDs up to 128 characters; retry unchanged input.') from None

    @staticmethod
    def _valid_receipt_id(value):
        return isinstance(value, str) and 1 <= len(value) <= 128 and value.isascii()

    def register_project(self, projectId, name):
        with self._transaction(True):
            identifier(projectId, 'projectId')
            text(name, 'name')
            return self._register('projects', {'projectId': projectId, 'name': normalize_string(name)})

    def register_session(self, sessionId, projectId, taskId, title):
        with self._transaction(True):
            for key, value in [('sessionId', sessionId), ('projectId', projectId), ('taskId', taskId)]:
                identifier(value, key)
            text(title, 'title')
            if not self._connection.execute('SELECT 1 FROM projects WHERE id=?', (projectId,)).fetchone():
                raise LedgerError('project_not_found', 'Register the explicit project first.', field='projectId')
            return self._register('sessions', {'sessionId': sessionId, 'projectId': projectId, 'taskId': taskId, 'title': normalize_string(title)})

    def _register(self, table, declared):
        kind = 'project' if table == 'projects' else 'session'
        identity = declared[kind + 'Id']
        row = self._connection.execute(f'SELECT record FROM {table} WHERE id=?', (identity,)).fetchone()
        if row:
            record = parse(row[0])
            if any(record[key] != value for key, value in declared.items()):
                raise LedgerError('registration_conflict', 'Reuse the original immutable registration or choose new identities.')
            return success({kind: record, 'duplicate': True})
        if table == 'sessions' and self._connection.execute('SELECT 1 FROM sessions WHERE task_id=?', (declared['taskId'],)).fetchone():
            raise LedgerError('registration_conflict', 'This task already belongs to a session. Reuse its original session.', field='taskId')
        if self._connection.execute(f'SELECT count(*) FROM {table}').fetchone()[0] >= 1000:
            raise LedgerError('storage_limit', 'Registration capacity reached. Use a separate ledger for genuinely new work.')
        timestamp, receipt = self._metadata()
        record = dict(declared, registeredAt=timestamp, registrationReceiptId=receipt)
        if table == 'projects':
            self._connection.execute('INSERT INTO projects VALUES (?,?)', (identity, dump(record)))
        else:
            self._connection.execute('INSERT INTO sessions VALUES (?,?,?,?)', (identity, declared['projectId'], declared['taskId'], dump(record)))
        return success({kind: record, 'duplicate': False})

    def append_bytes(self, sessionId, rawBytes, channel='mcp'):
        self._ensure_open()
        if not isinstance(rawBytes, bytes):
            fail('invalid_input')
        if len(rawBytes) > 1048576:
            fail('input_limit')
        if rawBytes.startswith(b'\xef\xbb\xbf'):
            fail('leading_bom')
        try:
            raw = rawBytes.decode('utf-8', 'strict')
        except UnicodeDecodeError:
            fail('invalid_utf8')
        return self.append_events(sessionId, raw, channel)

    def append_events(self, sessionId, envelopeJson, channel='mcp'):
        with self._transaction(True):
            identifier(sessionId, 'sessionId')
            if channel != 'mcp':
                fail(field='channel')
            row = self._connection.execute('SELECT task_id FROM sessions WHERE id=?', (sessionId,)).fetchone()
            if row is None:
                raise LedgerError('session_not_found', 'Register the explicit whole-task session before appending.', field='sessionId')
            incoming = validate(parse(envelopeJson))
            accepted, duplicates, new = [], [], {}
            # Full validation above precedes all identity checks and receipt callbacks.
            for index, event in enumerate(incoming):
                if event['taskId'] != row[0]:
                    raise LedgerError('session_task_mismatch', 'Partition by the exact registered task and submit to its original session.', eventIndex=index, field='taskId')
                identity = event['eventId']
                old = new.get(identity)
                if old is None:
                    stored = self._connection.execute('SELECT producer FROM events WHERE id=?', (identity,)).fetchone()
                    old = parse(stored[0]) if stored else None
                if old is not None:
                    if old != event:
                        raise LedgerError('event_id_conflict', 'This ID already has different content; use a new event ID for a correction.', eventIndex=index, field='eventId', eventId=identity)
                    duplicates.append(identity)
                else:
                    new[identity] = event
                    accepted.append(identity)
            count, size = self._connection.execute('SELECT count(*), coalesce(sum(length(CAST(producer AS BLOB))),0) FROM events').fetchone()
            encoded = {key: dump(value) for key, value in new.items()}
            if count + len(new) > 10000 or size + sum(len(value.encode('utf-8')) for value in encoded.values()) > 8 * 1024 * 1024:
                raise LedgerError('storage_limit', 'Event capacity reached. Preserve history and split genuinely new work into a separate ledger.')
            if new:
                timestamp, receipt_id = self._metadata()
                for identity, producer in encoded.items():
                    receipt = {'eventId': identity, 'receivedAt': timestamp, 'receiptId': receipt_id, 'channel': 'mcp'}
                    self._connection.execute('INSERT INTO events VALUES (?,?,?,?)', (identity, sessionId, producer, dump(receipt)))
                if self._fault:
                    self._fault('before_commit')
                self._connection.commit()
                if self._fault:
                    self._fault('after_commit')
            else:
                # A batch response is not an event receipt; duplicate retries allocate no stored metadata.
                receipt_id = str(uuid.uuid4())
            return success({'receiptId': receipt_id, 'acceptedEventIds': accepted, 'duplicateEventIds': duplicates})

    def snapshot(self):
        with self._transaction():
            return success(self._read_snapshot())

    def _read_snapshot(self):
        try:
            projects, sessions, events, receipts = [], [], [], []
            project_ids, task_sessions, session_ids, event_ids = set(), {}, set(), set()
            for identity, raw in self._connection.execute('SELECT id,record FROM projects ORDER BY id'):
                record = parse(raw)
                exact(record, ['projectId', 'name', 'registeredAt', 'registrationReceiptId'])
                identifier(record['projectId'], 'projectId')
                text(record['name'], 'name')
                self._check_metadata(record)
                if record['projectId'] != identity or identity in project_ids:
                    raise ValueError()
                project_ids.add(identity)
                projects.append(record)
            for identity, project, task, raw in self._connection.execute('SELECT id,project_id,task_id,record FROM sessions ORDER BY id'):
                record = parse(raw)
                exact(record, ['sessionId', 'projectId', 'taskId', 'title', 'registeredAt', 'registrationReceiptId'])
                for key in ['sessionId', 'projectId', 'taskId']:
                    identifier(record[key], key)
                text(record['title'], 'title')
                self._check_metadata(record)
                if (identity, project, task) != (record['sessionId'], record['projectId'], record['taskId']) or project not in project_ids or task in task_sessions or identity in session_ids:
                    raise ValueError()
                session_ids.add(identity)
                task_sessions[task] = identity
                sessions.append(record)
            size = 0
            for identity, session, raw, receipt_raw in self._connection.execute('SELECT id,session_id,producer,receipt FROM events'):
                event, receipt = parse(raw), parse(receipt_raw)
                validate({'formatVersion': 1, 'events': [event]})
                exact(receipt, ['eventId', 'receivedAt', 'receiptId', 'channel'])
                if (identity in event_ids or identity != event['eventId'] or task_sessions.get(event['taskId']) != session
                        or receipt['eventId'] != identity or receipt['channel'] != 'mcp'
                        or not valid_timestamp(receipt['receivedAt']) or not self._valid_receipt_id(receipt['receiptId'])):
                    raise ValueError()
                event_ids.add(identity)
                size += len(raw.encode('utf-8'))
                events.append(event)
                receipts.append(receipt)
            if len(projects) > 1000 or len(sessions) > 1000 or len(events) > 10000 or size > 8 * 1024 * 1024:
                raise ValueError()
            paired = sorted(zip(events, receipts), key=lambda pair: (pair[0]['occurredAt'] is None, pair[0]['occurredAt'] or '', pair[0]['eventId']))
            result = {'formatVersion': 1, 'projects': projects, 'sessions': sessions,
                      'events': [p[0] for p in paired], 'receipts': [p[1] for p in paired]}
            if len(dump(success(result)).encode('utf-8')) > 32 * 1024 * 1024:
                raise ValueError()
            return result
        except (LedgerError, ValueError, TypeError, KeyError, UnicodeError):
            raise LedgerError('storage_unavailable', RECOVERY) from None

    def _check_metadata(self, record):
        if not valid_timestamp(record['registeredAt']) or not self._valid_receipt_id(record['registrationReceiptId']):
            raise ValueError()
