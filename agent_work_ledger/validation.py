"""Strict producer v1 validation, matching the browser importer boundary."""
import datetime
import json
import math
import re


class LedgerError(Exception):
    def __init__(self, code, message, *, eventIndex=None, field=None, eventId=None):
        super().__init__(message)
        self.code, self.message = code, message
        self.eventIndex, self.field, self.eventId = eventIndex, field, eventId

    def as_result(self):
        return {'serviceVersion': 1, 'ok': False, 'error': {
            'code': self.code, 'message': self.message, 'eventIndex': self.eventIndex,
            'field': self.field, 'eventId': self.eventId}}


def fail(code='invalid_schema', field=None, index=None):
    raise LedgerError(code, 'Correct the named field against the v1 contract and retry unchanged identities.', field=field, eventIndex=index)


def valid_timestamp(value):
    if not isinstance(value, str) or not re.fullmatch(r'[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z', value):
        return False
    # JS Date supports ISO year 0000 (a leap year).
    try:
        datetime.datetime.fromisoformat(('2000' + value[4:] if value.startswith('0000') else value).replace('Z', '+00:00'))
        return True
    except ValueError:
        return False


def exact(value, keys, path=None, index=None):
    if type(value) is not dict:
        fail(field=path, index=index)
    for key in keys:
        if key not in value:
            fail(field=f'{path}.{key}' if path else key, index=index)
    for key in value:
        if key not in keys:
            safe = key if re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]{0,63}', key) else '[unknown field]'
            fail(field=f'{path}.{safe}' if path else safe, index=index)


def identifier(value, path, nullable=False, index=None):
    if nullable and value is None:
        return
    if not isinstance(value, str) or not re.fullmatch(r'[A-Za-z0-9._:-]{1,128}', value):
        fail(field=path, index=index)


def normalize_string(value):
    # JSON.parse uses UTF-16 code units; Python represents paired escapes as a scalar.
    return value.encode('utf-16-le', 'surrogatepass').decode('utf-16-le', 'surrogatepass')


def text(value, path, nullable=False, index=None):
    if nullable and value is None:
        return
    if not isinstance(value, str) or not 1 <= len(normalize_string(value)) <= 500:
        fail(field=path, index=index)


def dump(value):
    return json.dumps(value, ensure_ascii=True, separators=(',', ':'), allow_nan=False)


def parse(raw):
    if not isinstance(raw, str):
        fail('invalid_input')
    # TextEncoder replaces each unpaired surrogate with U+FFFD; paired units encode as a scalar.
    normalized = normalize_string(raw)
    size = len(normalized.encode('utf-8', 'replace')) + sum(2 for ch in normalized if 0xD800 <= ord(ch) <= 0xDFFF)
    if size > 1048576:
        fail('input_limit')
    if raw.startswith('\ufeff'):
        fail('leading_bom')
    offset = 0
    decoder = json.JSONDecoder()

    def whitespace():
        nonlocal offset
        while offset < len(normalized) and normalized[offset] in ' \t\r\n':
            offset += 1

    def string():
        nonlocal offset
        try:
            result, offset = decoder.raw_decode(normalized, offset)
            return normalize_string(result)
        except (ValueError, UnicodeError):
            fail('invalid_json')

    def value(depth):
        nonlocal offset
        whitespace()
        if depth > 64:
            fail()
        char = normalized[offset:offset + 1]
        if char == '"':
            return string()
        if char in ('{', '['):
            offset += 1
            is_object = char == '{'
            result = {} if is_object else []
            end = '}' if is_object else ']'
            whitespace()
            if normalized[offset:offset + 1] == end:
                offset += 1
                return result
            while True:
                whitespace()
                if is_object:
                    if normalized[offset:offset + 1] != '"':
                        fail('invalid_json')
                    key = string()
                    if key in result:
                        fail('duplicate_key')
                    whitespace()
                    if normalized[offset:offset + 1] != ':':
                        fail('invalid_json')
                    offset += 1
                member = value(depth + 1)
                if is_object:
                    result[key] = member
                else:
                    result.append(member)
                whitespace()
                if normalized[offset:offset + 1] == end:
                    offset += 1
                    return result
                if normalized[offset:offset + 1] != ',':
                    fail('invalid_json')
                offset += 1
        for token, result in [('true', True), ('false', False), ('null', None)]:
            if normalized.startswith(token, offset):
                offset += len(token)
                return result
        match = re.compile(r'-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?').match(normalized, offset)
        if match:
            offset = match.end()
            result = float(match[0])
            if not math.isfinite(result):
                fail('invalid_json')
            return result
        fail('invalid_json')

    result = value(0)
    whitespace()
    if offset != len(normalized):
        fail('invalid_json')
    return result


PAYLOADS = {
    'assignment': ['fromActorId', 'toActorId', 'parentRunId'],
    'consultation': ['toActorId', 'question'], 'block': ['reason', 'nextActorId'],
    'resolution': ['blockEventId'], 'handoff': ['toActorId', 'reason'],
    'revision': ['previousAttemptId', 'reason'],
    'review': ['targetAttemptId', 'outcome', 'summary'], 'qa': ['targetAttemptId', 'outcome', 'summary'],
    'completion': ['summary'], 'runtime': ['configured', 'verified', 'verification']}


def validate(envelope, *, batch=True):
    exact(envelope, ['formatVersion', 'events'])
    if type(envelope['formatVersion']) not in (int, float) or envelope['formatVersion'] != 1:
        fail('unsupported_version', 'formatVersion')
    if type(envelope['events']) is not list:
        fail(field='events')
    if batch and len(envelope['events']) > 1000:
        fail('event_limit', 'events')
    for index, event in enumerate(envelope['events']):
        exact(event, ['eventId', 'taskId', 'actorId', 'actorLabel', 'roleLabel', 'runId', 'attemptId', 'kind', 'occurredAt', 'source', 'data'], index=index)
        for key in ['eventId', 'taskId', 'actorId']:
            identifier(event[key], key, index=index)
        for key in ['runId', 'attemptId']:
            identifier(event[key], key, True, index)
        for key in ['actorLabel', 'roleLabel']:
            text(event[key], key, True, index)
        if event['attemptId'] is not None and event['runId'] is None:
            fail(field='runId', index=index)
        if event['occurredAt'] is not None and not valid_timestamp(event['occurredAt']):
            fail(field='occurredAt', index=index)
        exact(event['source'], ['producerId', 'label', 'synthetic'], 'source', index)
        identifier(event['source']['producerId'], 'source.producerId', index=index)
        text(event['source']['label'], 'source.label', index=index)
        if type(event['source']['synthetic']) is not bool:
            fail(field='source.synthetic', index=index)
        kind = event['kind']
        if not isinstance(kind, str) or kind not in PAYLOADS:
            fail(field='kind', index=index)
        data = event['data']
        exact(data, PAYLOADS[kind], 'data', index)
        if kind != 'consultation' and event['runId'] is None:
            fail(field='runId', index=index)
        if kind in ['assignment', 'block', 'resolution', 'handoff', 'revision', 'completion'] and event['attemptId'] is None:
            fail(field='attemptId', index=index)
        for key, value in data.items():
            if key.endswith('Id'):
                identifier(value, 'data.' + key, key in ['parentRunId', 'nextActorId'], index)
            if key in ['reason', 'question', 'summary']:
                text(value, 'data.' + key, index=index)
        if kind == 'revision' and data['previousAttemptId'] == event['attemptId']:
            fail(field='data.previousAttemptId', index=index)
        if kind in ['review', 'qa'] and data['outcome'] not in ['passed', 'failed', 'unknown']:
            fail(field='data.outcome', index=index)
        if kind == 'runtime':
            for key in ['configured', 'verified']:
                exact(data[key], ['model', 'effort'], 'data.' + key, index)
                for field in ['model', 'effort']:
                    text(data[key][field], f'data.{key}.{field}', True, index)
            verification = data['verification']
            if all(v is None for v in data['verified'].values()):
                if verification is not None:
                    fail(field='data.verification', index=index)
            else:
                exact(verification, ['method', 'verifierActorId', 'evidenceRef', 'summary'], 'data.verification', index)
                if verification['method'] != 'tool':
                    fail(field='data.verification.method', index=index)
                identifier(verification['verifierActorId'], 'data.verification.verifierActorId', index=index)
                for key in ['evidenceRef', 'summary']:
                    text(verification[key], 'data.verification.' + key, index=index)
    return envelope['events']
