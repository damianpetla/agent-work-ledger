import json
from pathlib import Path
import tempfile
import unittest
from agent_work_ledger.ledger import Ledger

class RegistrationTest(unittest.TestCase):
    def test_project_has_server_receipt(self):
        with tempfile.TemporaryDirectory() as directory:
            ledger = Ledger(directory, now=lambda: '2026-11-04T10:00:00.000Z', receipt_id=lambda: 'receipt:1')
            self.assertEqual(ledger.register_project('p', 'Project'), {
                'serviceVersion': 1, 'ok': True, 'data': {'duplicate': False, 'project': {
                    'projectId': 'p', 'name': 'Project', 'registeredAt': '2026-11-04T10:00:00.000Z',
                    'registrationReceiptId': 'receipt:1'}}})
            ledger.close()

import hashlib
import os
import sqlite3
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from agent_work_ledger.ledger import LedgerError

ROOT = Path(__file__).resolve().parents[2]
FIXTURES = ROOT / 'web/tests/import'
STAMP = '2026-11-04T10:00:00.000Z'

def event(identity='e', task='t'):
    return {'eventId': identity, 'taskId': task, 'actorId': 'actor', 'actorLabel': None,
            'roleLabel': None, 'runId': 'run', 'attemptId': 'attempt', 'kind': 'completion',
            'occurredAt': None, 'source': {'producerId': 'test', 'label': 'Synthetic', 'synthetic': True},
            'data': {'summary': 'Done'}}

def envelope(*events):
    return json.dumps({'formatVersion': 1, 'events': events}, ensure_ascii=True)


class CoreTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.directory = Path(self.temp.name) / 'data'
        self.ledger = Ledger(self.directory, now=lambda: STAMP, receipt_id=lambda: 'first')
        self.ledger.register_project('p', 'Project')
        self.ledger.register_session('s', 'p', 't', 'Task')

    def tearDown(self):
        self.ledger.close()
        self.temp.cleanup()

    def error(self, code, operation):
        with self.assertRaises(LedgerError) as caught:
            operation()
        self.assertEqual(caught.exception.code, code)
        self.assertEqual(set(caught.exception.as_result()['error']), {'code', 'message', 'eventIndex', 'field', 'eventId'})
        return caught.exception

    def state(self):
        return self.ledger.snapshot()['data']

    def reopen(self, **kwargs):
        self.ledger.close()
        self.ledger = Ledger(self.directory, **kwargs)

    def worker(self, mode, raw=None):
        return subprocess.run([sys.executable, str(ROOT / 'tests/core/worker.py'), mode, str(self.directory)],
                              input=raw, text=True, capture_output=True, timeout=15, env=dict(os.environ, PYTHONPATH=str(ROOT)))

    def test_original_registration_and_receipts_survive_reopen(self):
        first = self.state()
        result = self.ledger.append_events('s', envelope(event(), event()))['data']
        self.assertEqual(result, {'receiptId': 'first', 'acceptedEventIds': ['e'], 'duplicateEventIds': ['e']})
        committed = self.state()
        self.reopen(now=lambda: '2027-01-01T00:00:00.000Z', receipt_id=lambda: 'later')
        self.assertEqual(self.ledger.register_project('p', 'Project')['data']['project'], first['projects'][0])
        self.assertEqual(self.ledger.register_session('s', 'p', 't', 'Task')['data']['session'], first['sessions'][0])
        self.assertEqual(self.ledger.append_events('s', envelope(event()))['data']['duplicateEventIds'], ['e'])
        self.assertEqual(self.state(), committed)
        self.assertEqual(committed['receipts'], [{'eventId': 'e', 'receivedAt': STAMP, 'receiptId': 'first', 'channel': 'mcp'}])

    def test_immutable_binding_and_explicit_distinct_ids(self):
        self.error('registration_conflict', lambda: self.ledger.register_project('p', 'Changed'))
        self.error('registration_conflict', lambda: self.ledger.register_session('new', 'p', 't', 'Task'))
        self.error('registration_conflict', lambda: self.ledger.register_session('s', 'p', 'new', 'Task'))
        self.error('project_not_found', lambda: self.ledger.register_session('new', 'absent', 'new', 'Task'))
        self.error('session_not_found', lambda: self.ledger.append_events('absent', envelope(event())))
        self.assertEqual(self.state()['sessions'][0]['taskId'], 't')

    def test_historic_and_within_batch_conflicts_are_atomic(self):
        self.ledger.append_events('s', envelope(event()))
        original = self.state()
        changed = event(); changed['data']['summary'] = 'Changed'
        error = self.error('event_id_conflict', lambda: self.ledger.append_events('s', envelope(event('new'), changed)))
        self.assertEqual((error.eventIndex, error.field, error.eventId), (1, 'eventId', 'e'))
        fresh = event('fresh'); changed['eventId'] = 'fresh'
        self.error('event_id_conflict', lambda: self.ledger.append_events('s', envelope(fresh, changed)))
        self.reopen()
        self.assertEqual(self.state(), original)

    def test_task_mismatch_and_validation_precede_mutation(self):
        original = self.state()
        self.error('session_task_mismatch', lambda: self.ledger.append_events('s', envelope(event(), event('bad', 'other'))))
        broken = event('bad'); del broken['actorLabel']
        self.error('invalid_schema', lambda: self.ledger.append_events('s', envelope(event(), broken)))
        self.assertEqual(self.state(), original)

    def test_strict_raw_boundary(self):
        cases = [('invalid_json', 'bad' + '[' * 100),
                 ('duplicate_key', '{"events":[],"events":NaN}'), ('invalid_input', {}), ('leading_bom', '\ufeff{}'), ('duplicate_key', '{"formatVersion":1,"format\\u0056ersion":1,"events":[]}'),
                 ('invalid_json', '{"formatVersion":1e999,"events":[]}'), ('invalid_json', '{"formatVersion":NaN,"events":[]}'),
                 ('invalid_json', '{"formatVersion":01,"events":[]}'), ('unsupported_version', '{"formatVersion":true,"events":[]}'),
                 ('unsupported_version', '{"formatVersion":2,"events":[]}'), ('invalid_schema', '[' * 66 + ']' * 66)]
        for code, raw in cases:
            with self.subTest(code=code, raw=raw):
                self.error(code, lambda: self.ledger.append_events('s', raw))
        self.error('invalid_utf8', lambda: self.ledger.append_bytes('s', b'\xed\xa0\x80'))
        self.error('leading_bom', lambda: self.ledger.append_bytes('s', b'\xef\xbb\xbf{}'))
        self.error('invalid_input', lambda: self.ledger.append_bytes('s', 'text'))
        self.error('input_limit', lambda: self.ledger.append_bytes('s', b' ' * 1048577))
        self.assertEqual(self.state()['events'], [])

    def test_size_and_occurrence_limits(self):
        empty = '{"formatVersion":1,"events":[]}'
        self.ledger.append_bytes('s', (empty + ' ' * (1048576 - len(empty))).encode())
        self.error('input_limit', lambda: self.ledger.append_events('s', empty + ' ' * (1048577 - len(empty))))
        result = self.ledger.append_events('s', envelope(*([event()] * 1000)))['data']
        self.assertEqual(len(result['duplicateEventIds']), 999)
        self.error('event_limit', lambda: self.ledger.append_events('s', envelope(*([event()] * 1001))))

    def test_schema_boundaries(self):
        variants = [('source.synthetic', 'yes'), ('occurredAt', '2026-02-30T10:00:00.000Z'), ('actorId', 'ä'),
                    ('actorLabel', ''), ('actorLabel', 'x' * 501), ('runId', None), ('attemptId', None),
                    ('data.summary', None), ('source.extra', 'unknown')]
        for path, value in variants:
            bad = event()
            target = bad
            keys = path.split('.')
            for key in keys[:-1]: target = target[key]
            target[keys[-1]] = value
            with self.subTest(path=path):
                error = self.error('invalid_schema', lambda: self.ledger.append_events('s', envelope(bad)))
                self.assertEqual(error.eventIndex, 0)
        self.error('invalid_schema', lambda: self.ledger.append_events('s', envelope(event()), channel='file'))

    def test_unicode_shared_fixtures_and_structural_equality(self):
        raw = (FIXTURES / 'unicode.json').read_bytes()
        self.ledger.append_bytes('s', raw)
        first = self.state()
        self.reopen()
        literal = json.loads(raw)
        self.ledger.append_events('s', json.dumps(literal, ensure_ascii=False))
        self.assertEqual(self.state(), first)
        self.assertEqual(first['events'][2]['actorLabel'], '😀' * 500)
        self.assertEqual(first['events'][0]['data']['summary'], '\ud800')
        self.assertEqual(first['events'][1]['data']['summary'], '\udc00')

    def test_shared_browser_golden_files(self):
        expected = json.loads((FIXTURES / 'expected.json').read_text())
        self.ledger.register_session('demo', 'p', 'demo:launch', 'Demo')
        raw = (FIXTURES / 'out-of-order.json').read_bytes()
        result = self.ledger.append_bytes('demo', raw)['data']
        self.assertEqual(len(result['acceptedEventIds']), expected['outOfOrder']['acceptedCount'])
        self.assertEqual([e['eventId'] for e in self.state()['events']], expected['outOfOrder']['timeline'])
        before = self.state()
        error = self.error('event_id_conflict', lambda: self.ledger.append_bytes('demo', (FIXTURES / 'conflict.json').read_bytes()))
        self.assertEqual((error.eventIndex, error.field, error.eventId), (1, 'eventId', 'demo:01'))
        self.error('invalid_json', lambda: self.ledger.append_bytes('demo', (FIXTURES / 'malformed.json').read_bytes()))
        self.assertEqual(self.state(), before)
        # Fixture contains two tasks: explicitly partition with no task reassignment.
        all_kinds = json.loads((FIXTURES / 'all-kinds.json').read_text())['events']
        self.ledger.close()
        other = Path(self.temp.name) / 'golden'
        with Ledger(other) as ledger:
            ledger.register_project('p', 'Project')
            for task in ['demo:launch', 'demo:other-task']:
                ledger.register_session(task, 'p', task, 'Task')
                ledger.append_events(task, envelope(*(e for e in all_kinds if e['taskId'] == task)))
            self.assertEqual(len(ledger.snapshot()['data']['events']), expected['allKinds']['acceptedCount'])

    def test_lifecycle_and_same_process_canonical_ownership(self):
        self.error('busy', lambda: Ledger(self.directory / '..' / 'data'))
        link = Path(self.temp.name) / 'alias'; link.symlink_to(self.directory)
        self.error('busy', lambda: Ledger(link))
        self.ledger.close(); self.assertIsNone(self.ledger.close())
        for operation in [self.ledger.snapshot, lambda: self.ledger.register_project('x', 'X'), lambda: self.ledger.append_events('s', '{}')]:
            self.error('storage_unavailable', operation)
        with Ledger(link) as ledger:
            self.assertIs(ledger.__enter__(), ledger)
            self.assertEqual(ledger.snapshot()['data']['projects'][0]['projectId'], 'p')

    def test_process_owner_release_on_close_and_crash(self):
        self.ledger.append_events('s', envelope(event()))
        original = self.state(); self.ledger.close()
        for crash in [False, True]:
            worker = subprocess.Popen([sys.executable, str(ROOT / 'tests/core/worker.py'), 'hold', str(self.directory)],
                                      stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
                                      env=dict(os.environ, PYTHONPATH=str(ROOT)))
            try:
                self.assertEqual(worker.stdout.readline().strip(), 'ready')
                competing = self.worker('open')
                self.assertEqual(competing.returncode, 2)
                self.assertEqual(json.loads(competing.stdout)['error']['code'], 'busy')
                if crash: worker.kill()
                else: worker.stdin.write('\n'); worker.stdin.flush()
                worker.communicate(timeout=10)
                self.assertEqual(worker.returncode, -9 if crash else 0)
                self.reopen()
                self.assertEqual(self.state(), original)
                self.ledger.close()
            finally:
                if worker.poll() is None: worker.kill(); worker.communicate()

    def test_real_crash_before_and_after_commit_recovery(self):
        self.ledger.append_events('s', envelope(event('seed')))
        seeded = self.state()
        self.ledger.close()
        before = self.worker('before_commit', envelope(event('new:1'), event('new:2')))
        self.assertEqual(before.returncode, 73, before.stderr)
        self.reopen(); self.assertEqual(self.state(), seeded); self.ledger.close()
        after = self.worker('after_commit', envelope(event('new:1'), event('new:2')))
        self.assertEqual(after.returncode, 73, after.stderr)
        self.reopen(); committed = self.state()
        result = self.ledger.append_events('s', envelope(event('new:1'), event('new:2')))['data']
        self.assertEqual(result['acceptedEventIds'], [])
        self.assertEqual(result['duplicateEventIds'], ['new:1', 'new:2'])
        self.assertEqual(self.state(), committed)

    def test_fault_exceptions_rollback_or_preserve_committed(self):
        for point in ['before_commit', 'after_commit']:
            def fault(actual):
                if actual == point: raise RuntimeError('synthetic')
            self.reopen(fault=fault)
            with self.assertRaises(RuntimeError): self.ledger.append_events('s', envelope(event(point)))
            self.reopen()
            self.assertEqual([e['eventId'] for e in self.state()['events']], [] if point == 'before_commit' else ['after_commit'])

    def test_receipt_failure_creates_nothing(self):
        for clock, receipt in [(lambda: 'bad', lambda: 'r'), (lambda: STAMP, lambda: 'ä'), (lambda: STAMP, lambda: '')]:
            self.reopen(now=clock, receipt_id=receipt)
            self.error('receipt_error', lambda: self.ledger.append_events('s', envelope(event())))
            self.error('receipt_error', lambda: self.ledger.register_project('new', 'New'))
            self.assertEqual(self.state()['events'], [])
            self.assertEqual(len(self.state()['projects']), 1)

    def test_real_sqlite_busy_is_bounded_and_rolls_back(self):
        external = sqlite3.connect(self.directory / 'ledger.sqlite3', isolation_level=None)
        external.execute('BEGIN IMMEDIATE')
        started = time.monotonic()
        try:
            self.error('busy', lambda: self.ledger.append_events('s', envelope(event())))
            self.assertLess(time.monotonic() - started, 5.5)
        finally:
            external.rollback(); external.close()
        self.assertEqual(self.state()['events'], [])
        self.ledger.append_events('s', envelope(event()))

    def test_real_file_size_failure_preserves_history(self):
        self.ledger.append_events('s', envelope(event()))
        original = self.state(); self.ledger.close()
        events = []
        for i in range(100):
            large = event(f'disk:{i}'); large['data']['summary'] = 'x' * 500; events.append(large)
        worker = self.worker('disk', envelope(*events))
        self.assertEqual(worker.returncode, 0, worker.stderr)
        self.assertEqual(worker.stdout.strip(), 'storage_unavailable')
        self.reopen(); self.assertEqual(self.state(), original)

    def test_corrupt_newer_and_inconsistent_storage_preserves_file(self):
        self.ledger.append_events('s', envelope(event()))
        self.ledger.close()
        source = (self.directory / 'ledger.sqlite3').read_bytes()
        for mode in ['corrupt', 'newer', 'receipt', 'binding']:
            destination = Path(self.temp.name) / mode; destination.mkdir()
            database = destination / 'ledger.sqlite3'; database.write_bytes(source)
            if mode == 'corrupt': database.write_bytes(b'not sqlite')
            else:
                connection = sqlite3.connect(database)
                if mode == 'newer': connection.execute('PRAGMA user_version=9')
                elif mode == 'receipt': connection.execute("UPDATE events SET receipt='{}'")
                else: connection.execute("UPDATE sessions SET task_id='wrong'")
                connection.commit(); connection.close()
            before = hashlib.sha256(database.read_bytes()).hexdigest()
            for _ in range(2):  # failed startup releases ownership
                error = self.error('unsupported_version' if mode == 'newer' else 'storage_unavailable', lambda: Ledger(destination))
                if mode == 'newer': self.assertEqual(error.field, 'storageVersion')
                self.assertEqual(hashlib.sha256(database.read_bytes()).hexdigest(), before)

    def test_permissions_global_order_and_detached_results(self):
        self.assertEqual(self.directory.stat().st_mode & 0o777, 0o700)
        self.assertEqual((self.directory / 'ledger.sqlite3').stat().st_mode & 0o777, 0o600)
        self.ledger.register_project('a', 'First'); self.ledger.register_session('a', 'a', 'other', 'Other')
        earlier = event('z', 'other'); earlier['occurredAt'] = STAMP
        self.ledger.append_events('s', envelope(event('b'), event('a')))
        self.ledger.append_events('a', envelope(earlier))
        state = self.state()
        self.assertEqual([e['eventId'] for e in state['events']], ['z', 'a', 'b'])
        self.assertEqual([r['eventId'] for r in state['receipts']], ['z', 'a', 'b'])
        self.assertEqual([p['projectId'] for p in state['projects']], ['a', 'p'])
        state['events'][0]['data']['summary'] = 'caller mutation'
        self.assertEqual(self.state()['events'][0]['data']['summary'], 'Done')

    def test_threads_share_one_serialized_ledger(self):
        with ThreadPoolExecutor(max_workers=4) as pool:
            outcomes = list(pool.map(lambda _: self.ledger.append_events('s', envelope(event()))['data'], range(8)))
        self.assertEqual(sum(len(r['acceptedEventIds']) for r in outcomes), 1)
        self.assertEqual(sum(len(r['duplicateEventIds']) for r in outcomes), 7)

    def test_capacity_registrations_and_ten_thousand_events(self):
        for i in range(999):
            self.ledger.register_project(f'p:{i:04}', 'Project')
            self.ledger.register_session(f's:{i:04}', 'p', f't:{i:04}', 'Task')
        self.error('storage_limit', lambda: self.ledger.register_project('overflow', 'Overflow'))
        self.error('storage_limit', lambda: self.ledger.register_session('overflow', 'p', 'overflow', 'Overflow'))
        self.assertTrue(self.ledger.register_project('p', 'Project')['data']['duplicate'])
        self.assertTrue(self.ledger.register_session('s', 'p', 't', 'Task')['data']['duplicate'])
        for batch in range(10):
            self.ledger.append_events('s', envelope(*(event(f'count:{batch * 1000 + i:05}') for i in range(1000))))
        self.assertEqual(len(self.state()['events']), 10000)
        self.error('storage_limit', lambda: self.ledger.append_events('s', envelope(event('extra'))))
        self.assertEqual(self.ledger.append_events('s', envelope(event('count:00000')))['data']['duplicateEventIds'], ['count:00000'])
        self.reopen(); self.assertEqual(len(self.state()['events']), 10000)

    def test_exact_eight_mib_stored_ascii_bytes_and_duplicate_retry(self):
        target = 8 * 1024 * 1024
        encoded_size = lambda value: len(json.dumps(value, ensure_ascii=True, separators=(',', ':')).encode('utf-8'))
        values = []
        total = 0
        for i in range(10000):
            value = event(f'bytes:{i:05}')
            value['data']['summary'] = '\ud800' * 500
            size = encoded_size(value)
            if total + size > target - 1000:
                break
            values.append(value); total += size
        # The final event can represent any remaining byte count using three text
        # fields: six bytes per escaped surrogate plus one byte per ASCII char.
        final = event('bytes:final')
        final['actorLabel'] = ''
        final['roleLabel'] = ''
        final['data']['summary'] = ''
        budget = target - total - encoded_size(final)
        quotient, remainder = divmod(budget, 6)
        final['data']['summary'] = '\ud800' * quotient
        final['actorLabel'] = 'x' * remainder
        if remainder == 0:
            final['data']['summary'] = '\ud800' * (quotient - 1)
            final['actorLabel'] = 'x' * 6
        self.assertGreater(len(final['data']['summary']), 500)
        final['roleLabel'] = final['data']['summary'][500:]
        final['data']['summary'] = final['data']['summary'][:500]
        self.assertLessEqual(len(final['roleLabel']), 500)
        self.assertLessEqual(len(final['data']['summary']), 500)
        self.assertGreater(len(final['actorLabel']), 0)
        values.append(final)
        self.assertEqual(sum(map(encoded_size, values)), target)
        for offset in range(0, len(values), 100):
            self.ledger.append_events('s', envelope(*values[offset:offset + 100]))
        before = self.state()
        self.error('storage_limit', lambda: self.ledger.append_events('s', envelope(values[0], event('overflow'))))
        self.assertEqual(self.ledger.append_events('s', envelope(values[0]))['data']['duplicateEventIds'], ['bytes:00000'])
        self.reopen(); self.assertEqual(self.state(), before)

    def test_snapshot_consistency_during_supported_concurrency(self):
        def append(i):
            self.ledger.append_events('s', envelope(event(f'concurrent:{i:03}')))
        with ThreadPoolExecutor(max_workers=4) as pool:
            jobs = [pool.submit(append, i) for i in range(50)]
            for _ in range(30):
                state = self.state()
                self.assertEqual([e['eventId'] for e in state['events']], [r['eventId'] for r in state['receipts']])
                self.assertEqual(len(state['sessions']), 1)
            for job in jobs: job.result()
        self.assertEqual(len(self.state()['events']), 50)

    def test_synthetic_multitask_golden_preserves_exact_sources(self):
        incoming = json.loads((ROOT / 'web/examples/synthetic-timeline.json').read_text())['events']
        expected = json.loads((FIXTURES / 'expected.json').read_text())['synthetic']
        for task in expected['tasks']:
            self.ledger.register_session(task, 'p', task, 'Synthetic task')
            self.ledger.append_events(task, envelope(*(e for e in incoming if e['taskId'] == task)))
        state = self.state()
        self.assertEqual(len(state['events']), expected['acceptedCount'])
        self.assertEqual([e['eventId'] for e in state['events'] if e['taskId'] == 'demo:launch'], expected['launchTimeline'])
        runtime = next(e for e in state['events'] if e['eventId'] == expected['runtimeEventId'])
        self.assertEqual(runtime['data']['configured']['model'], expected['runtimeConfiguredModel'])
        self.assertIsNone(runtime['data']['verified']['model'])
        self.assertEqual({e['eventId']: e for e in state['events']}, {e['eventId']: e for e in incoming})

    def test_context_exception_and_retry_after_live_rollback(self):
        self.ledger.close()
        with self.assertRaisesRegex(RuntimeError, 'caller'):
            with Ledger(self.directory) as ledger:
                ledger.append_events('s', envelope(event('seed')))
                raise RuntimeError('caller')
        armed = [True]
        def fault(point):
            if point == 'before_commit' and armed[0]:
                armed[0] = False
                raise RuntimeError('precommit')
        self.reopen(fault=fault)
        with self.assertRaisesRegex(RuntimeError, 'precommit'):
            self.ledger.append_events('s', envelope(event()))
        self.assertEqual([e['eventId'] for e in self.state()['events']], ['seed'])
        self.assertEqual(self.ledger.append_events('s', envelope(event()))['data']['acceptedEventIds'], ['e'])

    def test_unicode_decoded_key_and_depth_boundaries(self):
        self.error('duplicate_key', lambda: self.ledger.append_events('s', '{"😀":1,"\\ud83d\\ude00":2}'))
        value = event(); value['actorLabel'] = '😀' * 501
        self.error('invalid_schema', lambda: self.ledger.append_events('s', envelope(value)))
        for count, field in [(63, 'extra'), (64, None)]:
            raw = '{"formatVersion":1,"events":[],"extra":' + '[' * count + '0' + ']' * count + '}'
            error = self.error('invalid_schema', lambda: self.ledger.append_events('s', raw))
            self.assertEqual(error.field, field)
        for stamp in ['0000-02-29T00:00:00.000Z', '2024-02-29T23:59:59.999Z']:
            value = event(stamp.replace(':', '-')); value['occurredAt'] = stamp
            self.ledger.append_events('s', envelope(value))

    def test_registration_scalar_boundaries(self):
        self.ledger.register_project('a' * 128, '😀' * 500)
        for identity in ['', 'a' * 129, None, False, 'a b', 'é']:
            self.error('invalid_schema', lambda: self.ledger.register_project(identity, 'Name'))
        for name in ['', 3, '😀' * 501]:
            self.error('invalid_schema', lambda: self.ledger.register_project('invalid', name))
