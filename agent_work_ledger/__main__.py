"""Public local service and private client-file helpers."""
import argparse
import json
import os
from pathlib import Path
import secrets
import stat
import sys


def private_write(path, text):
    path = Path(path).expanduser().resolve()
    path.parent.mkdir(parents=True, mode=0o700, exist_ok=True)
    # Caller chooses a private destination; never overwrite an existing credential/config.
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w', encoding='utf-8') as stream:
        stream.write(text)


def read_token(path):
    path = Path(path).expanduser()
    if path.is_symlink() or not path.is_file():
        raise ValueError('Use a regular private token file, not a link.')
    info = path.stat()
    if stat.S_IMODE(info.st_mode) != 0o600 or info.st_uid != os.geteuid() or info.st_size > 4096:
        raise ValueError('Token file must be owned by this user with permissions 0600 and at most 4096 bytes.')
    token = path.read_text('ascii').strip()
    if len(token) < 43 or not all(c.isalnum() or c in '-_' for c in token):
        raise ValueError('Generate a URL-safe random token from at least 32 bytes using init-token.')
    from importlib.resources import files
    public = Path(str(files('agent_work_ledger').joinpath('public'))).resolve()
    if public in path.resolve().parents:
        raise ValueError('Keep the token outside public assets.')
    return token


def main():
    parser = argparse.ArgumentParser(description='Explicit local ledger; receipt confirms acceptance only.')
    commands = parser.add_subparsers(dest='command', required=True)
    serve = commands.add_parser('serve')
    serve.add_argument('--data-dir', required=True)
    serve.add_argument('--token-file', required=True)
    serve.add_argument('--port', type=int, default=8785)
    init = commands.add_parser('init-token')
    init.add_argument('--output', required=True)
    config = commands.add_parser('inspector-config')
    config.add_argument('--token-file', required=True)
    config.add_argument('--port', type=int, default=8785)
    config.add_argument('--output', required=True)
    args = commands.add_parser('append-args')
    args.add_argument('--session-id', required=True)
    args.add_argument('--envelope-file', required=True)
    args.add_argument('--output', required=True)
    options = parser.parse_args()
    try:
        if hasattr(options, 'port') and not 1024 <= options.port <= 65535:
            raise ValueError('Choose an available loopback port from 1024 to 65535.')
        if options.command == 'init-token':
            private_write(options.output, secrets.token_urlsafe(32) + '\n')
        elif options.command == 'inspector-config':
            token = read_token(options.token_file)
            private_write(options.output, json.dumps({'mcpServers': {'awl': {'type': 'streamable-http',
                'url': f'http://127.0.0.1:{options.port}/mcp', 'headers': {'Authorization': 'Bearer ' + token}}}}, indent=2) + '\n')
        elif options.command == 'append-args':
            # Preserve raw duplicate JSON keys; do not parse/rewrite the inner producer envelope.
            raw = Path(options.envelope_file).read_bytes()
            if len(raw) > 1048576:
                raise ValueError('Envelope exceeds 1 MiB; split the report.')
            private_write(options.output, json.dumps({'sessionId': options.session_id, 'envelopeJson': raw.decode('utf-8')}, ensure_ascii=True) + '\n')
        else:
            from .service import create_app
            import uvicorn
            token = read_token(options.token_file)
            uvicorn.run(create_app(options.data_dir, token, options.port), host='127.0.0.1', port=options.port,
                        workers=1, proxy_headers=False, access_log=False, log_level='warning', server_header=False)
    except (OSError, ValueError, UnicodeError):
        parser.exit(2, 'Cannot use these private files or settings. Check paths, permissions and documented local setup; existing files were preserved.\n')


if __name__ == '__main__':
    main()
