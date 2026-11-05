"""Public loopback service and explicit raw reporting argument helper."""
import argparse
import json
import os
from pathlib import Path


def private_write(path, text):
    path = Path(path).expanduser().resolve()
    path.parent.mkdir(parents=True, mode=0o700, exist_ok=True)
    # Caller chooses a private destination; never overwrite an existing argument file.
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w', encoding='utf-8') as stream:
        stream.write(text)


def main():
    parser = argparse.ArgumentParser(description='Explicit local ledger; receipt confirms acceptance only.')
    commands = parser.add_subparsers(dest='command', required=True)
    serve = commands.add_parser('serve')
    serve.add_argument('--data-dir', required=True)
    serve.add_argument('--port', type=int, default=8785)
    args = commands.add_parser('append-args')
    args.add_argument('--session-id', required=True)
    args.add_argument('--envelope-file', required=True)
    args.add_argument('--output', required=True)
    options = parser.parse_args()
    try:
        if hasattr(options, 'port') and not 1024 <= options.port <= 65535:
            raise ValueError('Choose an available loopback port from 1024 to 65535.')
        if options.command == 'append-args':
            # Preserve raw duplicate JSON keys; do not parse/rewrite the inner producer envelope.
            raw = Path(options.envelope_file).read_bytes()
            if len(raw) > 1048576:
                raise ValueError('Envelope exceeds 1 MiB; split the report.')
            private_write(options.output, json.dumps({'sessionId': options.session_id, 'envelopeJson': raw.decode('utf-8')}, ensure_ascii=True) + '\n')
        else:
            from .service import create_app
            import uvicorn
            uvicorn.run(create_app(options.data_dir, options.port), host='127.0.0.1', port=options.port,
                        workers=1, proxy_headers=False, access_log=False, log_level='warning', server_header=False)
    except (OSError, ValueError, UnicodeError):
        parser.exit(2, 'Cannot use these private files or settings. Check paths, permissions and documented local setup; existing files were preserved.\n')


if __name__ == '__main__':
    main()
