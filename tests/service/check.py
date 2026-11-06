"""Actual installed CLI/process/HTTP/SDK/Inspector acceptance checks; stdlib harness."""
import argparse
import copy
import http.client
import json
import os
from pathlib import Path
import socket
import sqlite3
import hashlib
import subprocess
import tempfile
import time
import unittest
from urllib.request import Request, urlopen
from urllib.error import HTTPError

CONFIG = None
class InstalledService(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.output = Path(CONFIG.output).resolve(); cls.output.mkdir(parents=True, exist_ok=True)
        cls.temp = tempfile.TemporaryDirectory(prefix='awl-wire-'); cls.private = Path(cls.temp.name)
        cls.port = CONFIG.port; cls.base = f'http://127.0.0.1:{cls.port}'
        cls.env = dict(os.environ); cls.env.pop('PYTHONPATH', None); cls.env['MCP_CATALOG_PATH']=str(cls.private/'deliberately-invalid-catalog.json')
        cls.proc = None
        # Refuse to disturb any process already using the assigned test port.
        with socket.socket() as probe: probe.bind(('127.0.0.1', cls.port))
        cls.report('prepare-example', '--output-dir', str(cls.private / 'journey'))
        cls.start()
        cls.discovery = cls.sdk()
        for tool, name in [('register_project','project-a'),('register_project','project-b'),('register_session','session-a'),('register_session','session-b'),('append_events','journey-sdk')]:
            cls.sdk(tool, name)
        cls.inspector('append_events', 'journey-inspector')
        cls.sdk('append_events', 'second')
        cls.oracle = cls.get('/v1/snapshot')[1]
        (cls.output / 'first-snapshot.json').write_text(json.dumps(cls.oracle, ensure_ascii=True, indent=2))

    @classmethod
    def command(cls, module, *args):
        return subprocess.run([CONFIG.python, '-m', module, *args], cwd=cls.private, env=cls.env,
                              text=True, capture_output=True, timeout=30)
    @classmethod
    def cli(cls,*args):
        r=cls.command('agent_work_ledger',*args); assert r.returncode==0, r.stderr; return r
    @classmethod
    def report(cls,*args):
        r=cls.command('agent_work_ledger.report',*args); assert r.returncode==0, r.stderr; return r
    @classmethod
    def sdk(cls,tool=None,name=None,arguments=None,discard=False):
        args=['sdk','--port',str(cls.port)]
        if tool:
            path=cls.private/'journey'/f'{name}.args.json' if name else cls.private/'case.args.json'
            if arguments is not None: path.write_text(json.dumps(arguments,ensure_ascii=True))
            args+=['--tool',tool,'--args-file',str(path)]
        if discard: args+=['--discard-response']
        result=json.loads(cls.report(*args).stdout)
        if 'structuredContent' in result:
            assert json.loads(result['text'][0])==result['structuredContent']
            assert result['isError']==(not result['structuredContent']['ok'])
        return result
    @classmethod
    def inspector(cls,tool=None,name=None):
        args=['inspector','--executable',CONFIG.inspector,'--port',str(cls.port),'--state-dir',str(cls.private/'client')]
        if tool: args+=['--tool',tool,'--args-file',str(cls.private/'journey'/f'{name}.args.json')]
        result=cls.report(*args)
        (cls.output/f'inspector-{name or "discovery"}.json').write_text(result.stdout)
        return json.loads(result.stdout)
    @classmethod
    def get(cls,path,headers=None,body=None,method='GET'):
        values={} if headers is None else headers
        try:
            with urlopen(Request(cls.base+path,data=body,headers=values,method=method),timeout=15) as r:
                raw=r.read(); status=r.status; received={k.lower():v for k,v in r.headers.items()}
        except HTTPError as r: raw=r.read();status=r.code;received={k.lower():v for k,v in r.headers.items()}
        try: parsed=json.loads(raw)
        except ValueError: parsed=raw.decode('utf-8','replace')
        return status,parsed,received
    @classmethod
    def start(cls):
        cls.log=open(cls.output/'server.log','a')
        cls.proc=subprocess.Popen([CONFIG.python,'-m','agent_work_ledger','serve','--data-dir',str(cls.private/'data'),'--port',str(cls.port)],cwd=cls.private,env=cls.env,stdout=cls.log,stderr=cls.log)
        deadline=time.monotonic()+12
        while time.monotonic()<deadline:
            if cls.proc.poll() is not None: raise AssertionError('Service exited; inspect server.log')
            try:
                if cls.get('/v1/health')[0]==200:return
            except OSError:pass
            time.sleep(.05)
        raise AssertionError('Readiness timeout')
    @classmethod
    def stop(cls):
        if cls.proc and cls.proc.poll() is None:cls.proc.terminate();cls.proc.wait(timeout=15)
        cls.log.close()
    @classmethod
    def tearDownClass(cls):
        cls.stop();cls.temp.cleanup()

    def test_direct_demo_document_and_no_database_mutation(self):
        before=self.get('/v1/snapshot')[1]
        database=self.private/'data/ledger.sqlite3'
        original=hashlib.sha256(database.read_bytes()).hexdigest()
        root=self.get('/');demo=self.get('/demo')
        self.assertEqual(demo[0],200);self.assertEqual(demo[1],root[1])
        self.assertIn('text/html',demo[2]['content-type'])
        for path in ['/demo/','/demo/unknown','/not-a-route']:
            self.assertEqual(self.get(path)[0],404)
        for headers in [{'Host':'evil.invalid'},{'Origin':'null'},{'Origin':'http://evil.invalid'}]:
            self.assertEqual(self.get('/demo',headers)[0],403)
        self.assertEqual(self.get('/demo',{'Origin':self.base})[0],200)
        for header,expected in [('Host',400),('Origin',403)]:
            host=f'Host: 127.0.0.1:{self.port}\r\n'
            extra=host if header=='Host' else f'Origin: {self.base}\r\nOrigin: {self.base}\r\n'
            with socket.create_connection(('127.0.0.1',self.port),timeout=5) as connection:
                connection.sendall(f'GET /demo HTTP/1.1\r\n{host}{extra}Connection: close\r\n\r\n'.encode())
                wire=connection.recv(4096)
            self.assertEqual(int(wire.split(b' ')[1]),expected)
        self.assertEqual(self.get('/v1/snapshot')[1],before)
        self.assertEqual(hashlib.sha256(database.read_bytes()).hexdigest(),original)

    def test_discovery_clients_and_journey(self):
        self.assertEqual(self.discovery['protocol'],'2026-07-28')
        self.assertEqual({t['name'] for t in self.discovery['tools']},{'register_project','register_session','append_events'})
        self.assertTrue(all(t['inputSchema']['additionalProperties'] is False for t in self.discovery['tools']))
        self.inspector()
        self.assertEqual(len(self.oracle['data']['events']),13)
        self.assertEqual(len(self.oracle['data']['projects']),2)
        self.assertEqual(self.sdk('append_events','journey-inspector')['structuredContent']['data']['acceptedEventIds'],[])

    def test_public_journey_helper_retries_both_clients(self):
        before=self.get('/v1/snapshot')[1]
        self.report('journey','--args-dir',str(self.private/'journey'),'--port',str(self.port),'--inspector-executable',CONFIG.inspector,'--state-dir',str(self.private/'client'))
        self.assertEqual(self.get('/v1/snapshot')[1],before)
        raw='{"formatVersion":1,"events":[],"events":[]}'
        source=self.private/'raw-envelope.json'; source.write_text(raw)
        output=self.private/'raw-envelope.args.json'
        self.cli('append-args','--session-id','qa32:session-a','--envelope-file',str(source),'--output',str(output))
        arguments=json.loads(output.read_text());self.assertEqual(arguments['envelopeJson'],raw)
        self.assertEqual(self.sdk('append_events',arguments=arguments)['structuredContent']['error']['code'],'duplicate_key')
        self.assertEqual(self.get('/v1/snapshot')[1],before)

    def test_domain_http200_and_atomic_failures(self):
        before=self.get('/v1/snapshot')[1]
        raw=json.loads((self.private/'journey/journey-sdk.args.json').read_text())
        cases=[('duplicate_key',dict(raw,envelopeJson='{"formatVersion":1,"events":[],"events":[]}')),
               ('invalid_json',dict(raw,envelopeJson='{')),
               ('unsupported_version',dict(raw,envelopeJson='{"formatVersion":2,"events":[]}')),
               ('session_not_found',dict(raw,sessionId='absent'))]
        original=json.loads(raw['envelopeJson'])['events'][0]
        conflict=copy.deepcopy(original);conflict['actorLabel']='Changed'
        cases.append(('event_id_conflict',dict(raw,envelopeJson=json.dumps({'formatVersion':1,'events':[conflict]}))))
        wrong=copy.deepcopy(original);wrong['eventId']='qa32:wrong';wrong['taskId']='wrong'
        cases.append(('session_task_mismatch',dict(raw,envelopeJson=json.dumps({'formatVersion':1,'events':[original,wrong]}))))
        for code,arguments in cases:
            wire=json.dumps({'jsonrpc':'2.0','id':7,'method':'tools/call','params':{'name':'append_events','arguments':arguments,'_meta':{'io.modelcontextprotocol/protocolVersion':'2026-07-28','io.modelcontextprotocol/clientCapabilities':{}}}}).encode()
            status,result,_=self.get('/mcp',{'Content-Type':'application/json','Accept':'application/json, text/event-stream','MCP-Protocol-Version':'2026-07-28','Mcp-Method':'tools/call','Mcp-Name':'append_events'},wire,'POST')
            self.assertEqual(status,200,result)
            self.assertTrue(result['result']['isError']);self.assertEqual(result['result']['structuredContent']['error']['code'],code)
            self.assertEqual(json.loads(result['result']['content'][0]['text']),result['result']['structuredContent'])
        for arguments in [dict(raw,extra='unknown'),dict(raw,sessionId=None),{'sessionId':3}]:
            wire=json.dumps({'jsonrpc':'2.0','id':8,'method':'tools/call','params':{'name':'append_events','arguments':arguments,'_meta':{'io.modelcontextprotocol/protocolVersion':'2026-07-28','io.modelcontextprotocol/clientCapabilities':{}}}}).encode()
            _,result,_=self.get('/mcp',{'Content-Type':'application/json','Accept':'application/json, text/event-stream','MCP-Protocol-Version':'2026-07-28','Mcp-Method':'tools/call','Mcp-Name':'append_events'},wire,'POST')
            self.assertEqual(result['error']['code'],-32602)
        self.assertEqual(self.get('/v1/snapshot')[1],before)

    def test_local_boundary_all_routes_before_mutation(self):
        before=self.get('/v1/snapshot')[1]
        for path in ['/','/app.js','/graph-ui/graph.js','/v1/snapshot','/v1/health','/mcp']:
            for headers in [{'Origin':'http://evil.invalid'},{'Host':'evil.invalid'},{'Origin':'null'}]:
                self.assertEqual(self.get(path,headers)[0],403)
            self.assertNotEqual(self.get(path,{})[0],401)
            self.assertNotIn('www-authenticate',self.get(path,{})[2])
            for header in ['Host','Origin']:
                host=f'Host: 127.0.0.1:{self.port}\r\n'
                extra=(host if header=='Host' else f'Origin: {self.base}\r\nOrigin: {self.base}\r\n')
                with socket.create_connection(('127.0.0.1',self.port),timeout=5) as connection:
                    connection.sendall(f'GET {path} HTTP/1.1\r\n{host}{extra}Connection: close\r\n\r\n'.encode())
                    wire=connection.recv(4096);status=int(wire.split(b' ')[1])
                # h11 rejects duplicate Host before ASGI with its native 400.
                self.assertEqual(status,400 if header=='Host' else 403,(path,header,wire))
        observations=[]
        wire=json.dumps({'jsonrpc':'2.0','id':99,'method':'tools/call','params':{'name':'register_project','arguments':{'projectId':'boundary:must-not-exist','name':'Rejected synthetic write'},'_meta':{'io.modelcontextprotocol/protocolVersion':'2026-07-28','io.modelcontextprotocol/clientCapabilities':{}}}}).encode()
        for host,origin,expected in [(f'127.0.0.1:{self.port}','http://evil.invalid',403),('evil.invalid',None,403),(f'127.0.0.1:{self.port},evil.invalid',None,403),(f'127.0.0.1:{self.port}',self.base+'/',403)]:
            headers={'Host':host,'Content-Type':'application/json','Accept':'application/json, text/event-stream','MCP-Protocol-Version':'2026-07-28','Mcp-Method':'tools/call','Mcp-Name':'register_project'}
            if origin:headers['Origin']=origin
            status,_,_=self.get('/mcp',headers,wire,'POST');self.assertEqual(status,expected);observations.append({'host':host,'origin':origin,'status':status})
        for header,expected in [('Host',400),('Origin',403)]:
            host=f'Host: 127.0.0.1:{self.port}\r\n'
            extra=host if header=='Host' else f'Origin: {self.base}\r\nOrigin: {self.base}\r\n'
            request=(f'POST /mcp HTTP/1.1\r\n{host}{extra}Content-Type: application/json\r\nAccept: application/json, text/event-stream\r\nMCP-Protocol-Version: 2026-07-28\r\nMcp-Method: tools/call\r\nMcp-Name: register_project\r\nContent-Length: {len(wire)}\r\nConnection: close\r\n\r\n').encode()+wire
            with socket.create_connection(('127.0.0.1',self.port),timeout=5) as connection:
                connection.sendall(request);response=connection.recv(4096)
            status=int(response.split(b' ')[1]);self.assertEqual(status,expected)
            observations.append({'duplicate':header,'method':'POST','status':status})
        (self.output/'boundary-rejections.json').write_text(json.dumps(observations,indent=2))
        self.assertEqual(self.get('/v1/snapshot')[1],before)
        for path in ['/ledger.sqlite3','/token','/.git/config','/../token','/%2e%2e/token','/v1/events','/login','/logout']:
            self.assertEqual(self.get(path)[0],404)
        self.assertEqual(self.get('/v1/snapshot',method='POST',body=b'{}')[0],405)
        self.assertEqual(self.get('/v1/snapshot',{'Authorization':'Bearer irrelevant'})[1],before)
        self.assertEqual(self.get('/v1/health',{'X-Forwarded-Host':'evil.invalid','X-Forwarded-Proto':'https'})[0],200)
        for path in ['/','/v1/snapshot','/mcp']:
            response=self.get(path,method='OPTIONS');self.assertEqual(response[0],405);self.assertNotIn('access-control-allow-origin',response[2])
        self.assertEqual(self.get('/v1/snapshot')[2]['cache-control'],'no-store')

    def test_chunked_outer_limit_and_inner_limits(self):
        for size,expected in [(4194304,400),(4194305,413)]:
            connection=http.client.HTTPConnection('127.0.0.1',self.port,timeout=20)
            body=(b' ' * min(65536,size-i) for i in range(0,size,65536))
            connection.request('POST','/mcp',body=body,encode_chunked=True,headers={'Content-Type':'application/json','Accept':'application/json, text/event-stream'})
            response=connection.getresponse();self.assertEqual(response.status,expected);response.read();connection.close()
        raw=json.loads((self.private/'journey/journey-sdk.args.json').read_text())
        for value,code in [(' '*1048577,'input_limit'),(json.dumps({'formatVersion':1,'events':[json.loads(raw['envelopeJson'])['events'][0]]*1001}),'event_limit')]:
            result=self.sdk('append_events',arguments=dict(raw,envelopeJson=value))
            self.assertEqual(result['structuredContent']['error']['code'],code)

    def test_startup_loopback_owner_and_failed_storage(self):
        def launch(data, extra=()):
            return self.command('agent_work_ledger','serve','--data-dir',str(data),'--port',str(self.port),*extra)
        owner=launch(self.private/'data')
        self.assertNotEqual(owner.returncode,0);self.assertIn('already owned',owner.stderr)
        for flags in [('--host','0.0.0.0'),('--token-file','unused'),('--auth','off')]:
            self.assertEqual(launch(self.private/'unused',flags).returncode,2)
        for command in ['init-token','inspector-config']:
            self.assertEqual(self.command('agent_work_ledger',command).returncode,2)
        for name in ['corrupt','newer']:
            directory=self.private/name;directory.mkdir();database=directory/'ledger.sqlite3'
            if name=='corrupt': database.write_bytes(b'not a database')
            else:
                with sqlite3.connect(database) as connection: connection.execute('PRAGMA user_version=9')
            original=hashlib.sha256(database.read_bytes()).hexdigest()
            failure=launch(directory);self.assertNotEqual(failure.returncode,0)
            self.assertEqual(hashlib.sha256(database.read_bytes()).hexdigest(),original)
        self.assertEqual((self.private/'data').stat().st_mode&0o777,0o700)
        self.assertEqual((self.private/'data/ledger.sqlite3').stat().st_mode&0o777,0o600)

    def test_unavailable_read_is_503_without_empty_success(self):
        connection=sqlite3.connect(self.private/'data/ledger.sqlite3',isolation_level=None)
        connection.execute('BEGIN EXCLUSIVE')
        try:
            status,value,headers=self.get('/v1/snapshot')
            self.assertEqual(status,503);self.assertFalse(value['ok']);self.assertEqual(value['error']['code'],'busy');self.assertEqual(headers['cache-control'],'no-store')
        finally: connection.rollback();connection.close()
        self.assertTrue(self.get('/v1/snapshot')[1]['ok'])

    def test_restart_original_receipts_and_lost_response_retry(self):
        before=self.get('/v1/snapshot')[1];self.stop();self.start();self.assertEqual(self.get('/v1/snapshot')[1],before)
        self.sdk('append_events','journey-sdk');self.inspector('append_events','journey-inspector');self.assertEqual(self.get('/v1/snapshot')[1],before)
        args=json.loads((self.private/'journey/second.args.json').read_text());e=json.loads(args['envelopeJson'])['events'][0];e['eventId']='qa32:lost-response'
        args['envelopeJson']=json.dumps({'formatVersion':1,'events':[e]})
        self.assertEqual(self.sdk('append_events',arguments=args,discard=True)['delivery'],'unconfirmed')
        committed=self.get('/v1/snapshot')[1]
        result=self.sdk('append_events',arguments=args)['structuredContent']['data'];self.assertEqual(result['duplicateEventIds'],['qa32:lost-response'])
        self.assertEqual(self.get('/v1/snapshot')[1],committed)

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--python',required=True);parser.add_argument('--inspector',required=True);parser.add_argument('--output',required=True);parser.add_argument('--port',type=int,default=18939)
    CONFIG,rest=parser.parse_known_args();unittest.main(argv=['check.py']+rest,verbosity=2)
