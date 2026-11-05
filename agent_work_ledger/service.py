"""Local MCP transport adapter; Ledger alone owns domain rules and storage."""
from contextlib import asynccontextmanager
from importlib.resources import files
import mimetypes

from mcp.server import MCPServer
from mcp.server.transport_security import TransportSecuritySettings
from mcp.shared.exceptions import MCPError
from mcp_types import CallToolResult, TextContent
from starlette.applications import Starlette
from starlette.responses import Response
from starlette.routing import Route
from starlette.concurrency import run_in_threadpool

from .assets import PUBLIC_FILES
from .ledger import Ledger, LedgerError
from .validation import dump

ARGUMENTS = {'register_project': {'projectId', 'name'},
             'register_session': {'sessionId', 'projectId', 'taskId', 'title'},
             'append_events': {'sessionId', 'envelopeJson'}}
LIMIT = 4194304


class StrictServer(MCPServer):
    async def list_tools(self):
        tools = await super().list_tools()
        for tool in tools:
            tool.input_schema['additionalProperties'] = False
        return tools

    async def call_tool(self, name, arguments, context=None):
        if name not in ARGUMENTS or set(arguments) != ARGUMENTS[name] or any(type(v) is not str for v in arguments.values()):
            raise MCPError(-32602, 'Use the named tool with exactly its documented string arguments.')
        return await super().call_tool(name, arguments, context)


def json_response(value, status=200, headers=None):
    # ASCII serialization retains the unchanged v1 lone-surrogate semantics.
    return Response(dump(value), status_code=status, media_type='application/json', headers=headers)


def create_app(data_dir, port):
    state = {}
    mcp = StrictServer('Agent Work Ledger')

    def invoke(method, *args):
        try:
            result = getattr(state['ledger'], method)(*args)
        except LedgerError as error:
            result = error.as_result()
        return CallToolResult(content=[TextContent(type='text', text=dump(result))],
                              structured_content=result, is_error=not result['ok'])

    @mcp.tool()
    def register_project(projectId: str, name: str) -> CallToolResult:
        """Opt-in explicit immutable project registration. Unknown arguments rejected. Receipt confirms ledger acceptance only."""
        return invoke('register_project', projectId, name)

    @mcp.tool()
    def register_session(sessionId: str, projectId: str, taskId: str, title: str) -> CallToolResult:
        """Register one whole-task journey; separate session/task IDs are explicit. All reporters and retries reuse this binding, never a protocol connection ID."""
        return invoke('register_session', sessionId, projectId, taskId, title)

    @mcp.tool()
    def append_events(sessionId: str, envelopeJson: str) -> CallToolResult:
        """Opt-in structured metadata only: raw v1 JSON text, not parsed events. Preserve exact event IDs/content/session on unconfirmed retry; no prompts, transcripts or secrets. Unknown fields rejected."""
        return invoke('append_events', sessionId, envelopeJson)

    host = f'127.0.0.1:{port}'
    origin = f'http://{host}'
    inner = mcp.streamable_http_app(json_response=True, stateless_http=True, max_request_body_size=LIMIT,
        transport_security=TransportSecuritySettings(enable_dns_rebinding_protection=True,
                                                     allowed_hosts=[host], allowed_origins=[origin]))

    @asynccontextmanager
    async def lifespan(app):
        ledger = Ledger(data_dir)
        state['ledger'] = ledger
        try:
            async with inner.router.lifespan_context(inner):
                yield
        finally:
            ledger.close()
            state.clear()

    async def snapshot(request):
        try:
            return json_response(await run_in_threadpool(state['ledger'].snapshot))
        except LedgerError as error:
            return json_response(error.as_result(), 503)

    async def health(request):
        try:
            await run_in_threadpool(state['ledger'].snapshot)
            return json_response({'serviceVersion': 1, 'ok': True, 'data': {'status': 'ready', 'storageVersion': 1}})
        except LedgerError as error:
            return json_response(error.as_result(), 503)

    public = files('agent_work_ledger').joinpath('public')
    # Only the built public runtime inventory is eligible; no arbitrary directory serving.
    allowed = set(PUBLIC_FILES)

    async def asset(request):
        name = request.path_params.get('path', '') or 'index.html'
        if name not in allowed:
            return Response('Not found', status_code=404)
        try:
            content = public.joinpath(name).read_bytes()
        except (OSError, FileNotFoundError):
            return Response('Public asset unavailable; reinstall the package.', status_code=503)
        return Response(content, media_type=mimetypes.guess_type(name)[0] or 'application/octet-stream')

    application = Starlette(lifespan=lifespan, routes=[Route('/v1/snapshot', snapshot, methods=['GET']),
        Route('/v1/health', health, methods=['GET']), Route('/mcp', inner, methods=['GET', 'POST', 'DELETE']),
        Route('/{path:path}', asset, methods=['GET'])])
    return Boundary(application, host, origin)


class Boundary:
    def __init__(self, app, host, origin):
        self.app, self.host, self.origin = app, host.encode('ascii'), origin.encode('ascii')

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http':
            return await self.app(scope, receive, send)
        headers = {}
        for key, value in scope['headers']:
            headers.setdefault(key.lower(), []).append(value)
        if headers.get(b'host') != [self.host] or (b'origin' in headers and headers[b'origin'] != [self.origin]):
            return await Response('Use the configured loopback Host and Origin.', status_code=403)(scope, receive, send)
        async def no_store(message):
            if message['type'] == 'http.response.start':
                message['headers'] = [(k, v) for k, v in message['headers'] if k.lower() != b'cache-control'] + [(b'cache-control', b'no-store')]
            await send(message)
        if scope['path'] == '/mcp':
            size, chunks = 0, []
            while True:
                message = await receive()
                if message['type'] == 'http.disconnect':
                    return
                chunk = message.get('body', b'')
                size += len(chunk)
                if size > LIMIT:
                    return await Response('Request exceeds 4 MiB; split the report.', status_code=413)(scope, receive, no_store)
                chunks.append(chunk)
                if not message.get('more_body', False):
                    break
            delivered = False
            async def replay():
                nonlocal delivered
                if not delivered:
                    delivered = True
                    return {'type': 'http.request', 'body': b''.join(chunks), 'more_body': False}
                return await receive()
            return await self.app(scope, replay, no_store)
        return await self.app(scope, receive, no_store)
