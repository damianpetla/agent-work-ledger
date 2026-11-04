"""Explicit real-client helpers; never reads conversations or reports automatically."""
import argparse
import asyncio
import json
import os
from pathlib import Path
import subprocess
import sys
from .__main__ import private_write, read_token

async def sdk_call(o):
    from mcp import Client
    from mcp.client.streamable_http import streamable_http_client
    import httpx2
    args = json.loads(Path(o.args_file).read_text()) if o.args_file else {}
    async with httpx2.AsyncClient(headers={'Authorization': 'Bearer ' + read_token(o.token_file)}, trust_env=False) as http:
        async with Client(streamable_http_client(f'http://127.0.0.1:{o.port}/mcp', http_client=http)) as client:
            if o.tool:
                r = await client.call_tool(o.tool, args)
                if o.discard_response:
                    print(json.dumps({'delivery': 'unconfirmed', 'action': 'Response deliberately discarded; retry identical IDs/content.'})); return
                value = {'protocol': client.protocol_version, 'isError': r.is_error, 'structuredContent': r.structured_content,
                         'text': [b.text for b in r.content if b.type == 'text']}
            else:
                tools = await client.list_tools()
                value = {'protocol': client.protocol_version, 'tools': [t.model_dump(mode='json', by_alias=True) for t in tools.tools]}
            print(json.dumps(value, ensure_ascii=True))

def prepare(directory):
    from importlib.resources import files
    source = files('agent_work_ledger').joinpath('public/examples/synthetic-workflow.json').read_text()
    events = json.loads(source.replace('example:', 'qa32:'))['events']
    task = events[0]['taskId']; sample = events[0]
    block = dict(sample, eventId='qa32:block', kind='block', occurredAt=None, data={'reason': 'Synthetic input clarification', 'nextActorId': 'qa32:lead'})
    resolution = dict(sample, eventId='qa32:resolution', kind='resolution', occurredAt=None, data={'blockEventId': 'qa32:block'})
    parts = [events[:5] + [block], events[5:] + [resolution]]
    second = dict(sample, eventId='qa32:second', kind='completion', taskId='qa32:other-task', runId='qa32:other-run', attemptId='qa32:other-v1', data={'summary': 'Separate synthetic task; no inherited acceptance.'})
    values = {
        'project-a.args.json': {'projectId': 'qa32:project-a', 'name': 'Synthetic project A'},
        'project-b.args.json': {'projectId': 'qa32:project-b', 'name': 'Synthetic project B'},
        'session-a.args.json': {'sessionId': 'qa32:session-a', 'projectId': 'qa32:project-a', 'taskId': task, 'title': 'Synthetic multi-reporter journey'},
        'session-b.args.json': {'sessionId': 'qa32:session-b', 'projectId': 'qa32:project-b', 'taskId': 'qa32:other-task', 'title': 'Independent synthetic task'},
        'journey-sdk.args.json': {'sessionId': 'qa32:session-a', 'envelopeJson': json.dumps({'formatVersion': 1, 'events': parts[0]})},
        'journey-inspector.args.json': {'sessionId': 'qa32:session-a', 'envelopeJson': json.dumps({'formatVersion': 1, 'events': parts[1]})},
        'second.args.json': {'sessionId': 'qa32:session-b', 'envelopeJson': json.dumps({'formatVersion': 1, 'events': [second]})},
        'expected.json': {'primaryTaskId': task, 'primaryCount': 12, 'totalCount': 13, 'primaryEventIds': sorted(e['eventId'] for e in events + [block, resolution]), 'secondaryEventId': 'qa32:second'}}
    for name, value in values.items(): private_write(Path(directory) / name, json.dumps(value, ensure_ascii=True, indent=2) + '\n')

def main():
    p = argparse.ArgumentParser(description='Explicit selected metadata; no automatic reporting.')
    sub = p.add_subparsers(dest='command', required=True)
    sdk = sub.add_parser('sdk'); sdk.add_argument('--token-file', required=True); sdk.add_argument('--port', type=int, default=8785)
    sdk.add_argument('--tool'); sdk.add_argument('--args-file'); sdk.add_argument('--discard-response', action='store_true')
    inspector = sub.add_parser('inspector'); inspector.add_argument('--executable', required=True); inspector.add_argument('--config', required=True)
    inspector.add_argument('--state-dir', required=True); inspector.add_argument('--tool'); inspector.add_argument('--args-file')
    example = sub.add_parser('prepare-example'); example.add_argument('--output-dir', required=True)
    journey = sub.add_parser('journey', help='Explicitly report/retry the safe synthetic fixture through both real clients.')
    journey.add_argument('--args-dir', required=True); journey.add_argument('--token-file', required=True); journey.add_argument('--port', type=int, default=8785)
    journey.add_argument('--inspector-executable', required=True); journey.add_argument('--inspector-config', required=True); journey.add_argument('--state-dir', required=True)
    o = p.parse_args()
    if o.command == 'journey':
        if not 1024 <= o.port <= 65535: p.error('Use a valid loopback port.')
        if not Path(o.args_dir).exists(): prepare(o.args_dir)
        for tool, name in [('register_project','project-a'),('register_project','project-b'),('register_session','session-a'),('register_session','session-b'),('append_events','journey-sdk'),('append_events','journey-inspector'),('append_events','second')]:
            command = [sys.executable, '-m', 'agent_work_ledger.report']
            if name == 'journey-inspector':
                command += ['inspector','--executable',o.inspector_executable,'--config',o.inspector_config,'--state-dir',o.state_dir]
            else: command += ['sdk','--token-file',o.token_file,'--port',str(o.port)]
            command += ['--tool',tool,'--args-file',str(Path(o.args_dir) / (name + '.args.json'))]
            result = subprocess.run(command, capture_output=True, text=True)
            if result.returncode: raise SystemExit('Synthetic report unconfirmed; check local setup and retry identical inputs.')
            value = json.loads(result.stdout)
            outcome = value.get('result', value)
            print(json.dumps(value, ensure_ascii=True))
            if outcome.get('isError', False): raise SystemExit('Synthetic report rejected; inspect the bounded result above.')
    elif o.command == 'prepare-example': prepare(o.output_dir)
    elif o.command == 'sdk':
        if not 1024 <= o.port <= 65535: p.error('Use a valid loopback port.')
        asyncio.run(sdk_call(o))
    else:
        state = Path(o.state_dir).resolve(); state.mkdir(mode=0o700, parents=True, exist_ok=True); os.chmod(state, 0o700)
        environment = dict(os.environ); environment.pop('MCP_CATALOG_PATH', None); environment['MCP_CLIENT_CONFIG_PATH'] = str(state / 'client.json')
        args = [o.executable, '--cli', '--config', o.config, '--server', 'awl', '--protocol-era', 'modern', '--method', 'tools/call' if o.tool else 'tools/list', '--format', 'json']
        if o.tool: args += ['--tool-name', o.tool, '--tool-args-json', Path(o.args_file).read_text()]
        raise SystemExit(subprocess.run(args, env=environment).returncode)

if __name__ == '__main__': main()
