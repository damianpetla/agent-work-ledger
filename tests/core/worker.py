"""Isolated process boundary exercises; stdout is a line-based rendezvous."""
import json
import os
from pathlib import Path
import resource
import signal
import sys

from agent_work_ledger.ledger import Ledger, LedgerError

mode, directory = sys.argv[1:3]
try:
    if mode == 'hold':
        with Ledger(directory) as ledger:
            print('ready', flush=True)
            sys.stdin.readline()
    elif mode in ['before_commit', 'after_commit']:
        def fault(point):
            if point == mode:
                os._exit(73)
        with Ledger(directory, fault=fault) as ledger:
            ledger.append_events('s', sys.stdin.read())
    elif mode == 'disk':
        with Ledger(directory) as ledger:
            current = (Path(directory) / 'ledger.sqlite3').stat().st_size
            signal.signal(signal.SIGXFSZ, signal.SIG_IGN)
            resource.setrlimit(resource.RLIMIT_FSIZE, (current, current))
            try:
                ledger.append_events('s', sys.stdin.read())
            except LedgerError as error:
                print(error.code, flush=True)
    elif mode == 'open':
        with Ledger(directory) as ledger:
            print(json.dumps(ledger.snapshot()), flush=True)
except LedgerError as error:
    print(json.dumps(error.as_result()), flush=True)
    sys.exit(2)
