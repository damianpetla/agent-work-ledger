// JSON.parse discards duplicate members. Parse each object before that can happen.
export function parseJSON(text) {
  let offset = 0;
  function fail(code, message, at = offset) {
    const before = text.slice(0, at);
    throw {code, message, eventIndex:null, field:null, location:{offset:at, line:before.split('\n').length, column:at - before.lastIndexOf('\n')}};
  }
  const whitespace = () => { while (/[\x20\t\r\n]/.test(text[offset] ?? '') && offset < text.length) offset++; };
  function string() {
    const start = offset++;
    while (offset < text.length) {
      const char = text[offset++];
      if (char === '\\') { offset++; continue; }
      if (char === '"') {
        try { return JSON.parse(text.slice(start, offset)); }
        catch { fail('invalid_json', 'Invalid JSON string; correct its escapes or control characters.', start); }
      }
    }
    fail('invalid_json', 'Unterminated JSON string; add the closing quote.', start);
  }
  function value(depth) {
    whitespace();
    // The fixed v1 schema needs fewer than ten levels. Bound malformed nesting
    // before recursive parsing can exhaust the browser stack.
    if (depth > 64) fail('invalid_schema', 'Nesting exceeds the v1 schema; remove nested unknown data.');
    const char = text[offset];
    if (char === '"') return string();
    if (char === '{' || char === '[') {
      offset++;
      const object = char === '{';
      const output = object ? Object.create(null) : [];
      const end = object ? '}' : ']';
      whitespace();
      if (text[offset] === end) { offset++; return output; }
      while (true) {
        whitespace();
        let key;
        if (object) {
          const at = offset;
          if (text[offset] !== '"') fail('invalid_json', 'Object members need quoted keys.');
          key = string();
          if (Object.hasOwn(output, key)) fail('duplicate_key', 'Duplicate object key; keep exactly one value for each key.', at);
          whitespace();
          if (text[offset++] !== ':') fail('invalid_json', 'Add a colon after the object key.');
        }
        const member = value(depth + 1);
        if (object) output[key] = member; else output.push(member);
        whitespace();
        if (text[offset] === end) { offset++; return output; }
        if (text[offset++] !== ',') fail('invalid_json', 'Expected a comma or closing bracket.');
      }
    }
    for (const [token, result] of [['true',true], ['false',false], ['null',null]]) {
      if (text.startsWith(token, offset)) { offset += token.length; return result; }
    }
    const match = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(text.slice(offset));
    if (match) {
      offset += match[0].length;
      const number = Number(match[0]);
      if (!Number.isFinite(number)) fail('invalid_json', 'Non-finite number; use a finite JSON value.');
      return number;
    }
    fail('invalid_json', 'Invalid JSON value; check the file syntax.');
  }
  const result = value(0);
  whitespace();
  if (offset !== text.length) fail('invalid_json', 'Unexpected trailing content; supply one JSON envelope.');
  return result;
}
