"""Source-only golden/parser Chromium runner; never an installed UI test."""
import argparse
import functools
import http.server
from pathlib import Path
import re
import subprocess
import tempfile
import threading

p = argparse.ArgumentParser()
p.add_argument('--chromium', required=True)
p.add_argument('--output', required=True)
p.add_argument('--port', type=int, default=18939)
o = p.parse_args()
output = Path(o.output); output.mkdir(parents=True, exist_ok=True)
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args): pass
web = Path(__file__).resolve().parents[2]
server = http.server.ThreadingHTTPServer(('127.0.0.1', o.port), functools.partial(Quiet, directory=str(web)))
thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
try:
    with tempfile.TemporaryDirectory(prefix='awl-parser-chromium-') as profile:
        result = subprocess.run([o.chromium, '--headless', '--no-sandbox', '--disable-gpu',
            '--dump-dom', '--virtual-time-budget=10000', f'--user-data-dir={profile}',
            f'http://127.0.0.1:{o.port}/tests/import/'], capture_output=True, text=True, timeout=30)
    (output/'dom.html').write_text(result.stdout)
    (output/'browser.log').write_text(result.stderr)
    match = re.search(r'TOTAL (\d+) PASS (\d+) FAIL (\d+) SKIP (\d+)', result.stdout)
    assert result.returncode == 0 and match, 'Missing completed Chromium results; see dom.html/browser.log'
    total, passed, failed, skipped = map(int, match.groups())
    assert (total, passed, failed, skipped) == (170, 170, 0, 0), match.group()
    print(match.group())
finally:
    server.shutdown(); server.server_close(); thread.join(timeout=5)
