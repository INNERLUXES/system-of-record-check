// A small reader for a subset of YAML, enough to write an integration map by hand: block mappings of "key: value" lines,
// block lists of "- " entries (an entry may start a mapping on its own line), values in single or double quotes, plain
// values, short lists in brackets ("[id, name]"), an empty "{}", true, false, null and numbers, and comments that start
// with a #. Structure is set by indentation with spaces; a tab in the indentation is refused, as YAML refuses it. A key
// named twice in one mapping is refused, because YAML keys must be unique. Anchors, aliases, tags, block scalars (| and
// >), mappings in braces, keys with a ?, a value that runs on over several lines and a second document are not read:
// each stops the run with its line, so nothing is passed over. The result has the same form as src/json.js gives:
// { value, lines }, with the line of every key and list entry under its path, such as "flows[1].fields[0]".

export const YAML_LIMITS = { maxDepth: 32, maxValues: 100000, maxStringLength: 4096, maxLines: 200000 };

export class YamlError extends Error {
  constructor(reason, line) {
    super(reason);
    this.reason = reason;
    this.line = line;
  }
}

function setOwn(object, name, value) {
  Object.defineProperty(object, name, { value, enumerable: true, writable: true, configurable: true });
}

// A line without its comment: a # at the start or after a space or a tab, outside quotes. A quote opens a quoted value
// only where a value can start, so the apostrophe in "don't" is text.
export function stripComment(text) {
  let quote = null;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quote === '"') {
      if (c === '\\') i += 1;
      else if (c === '"') quote = null;
    } else if (quote === "'") {
      if (c === "'") {
        if (text[i + 1] === "'") i += 1;
        else quote = null;
      }
    } else if (c === '#' && (i === 0 || text[i - 1] === ' ' || text[i - 1] === '\t')) return text.slice(0, i);
    else if ((c === '"' || c === "'") && (i === 0 || ' \t[,:-'.includes(text[i - 1]))) quote = c;
  }
  return text;
}

const ESCAPES = { '"': '"', '\\': '\\', '/': '/', n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', 0: '\0' };
const INDICATORS = '&*!|>%@`?{';
const isItem = (content) => content === '-' || content.startsWith('- ');

// Reads one YAML text of the subset. Throws YamlError with the line of the problem.
export function parseYaml(text, limits = YAML_LIMITS) {
  const lim = { ...YAML_LIMITS, ...limits };
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const raw = source.split(/\r\n|\r|\n/);
  if (raw.length > lim.maxLines) throw new YamlError(`holds ${raw.length.toLocaleString('en-US')} lines, more than the ${lim.maxLines.toLocaleString('en-US')} read`, lim.maxLines + 1);

  // The lines that hold something: { line, indent, content } with the comment and the trailing space left out.
  const L = [];
  let started = false;
  raw.forEach((l, n) => {
    let indent = 0;
    while (l.charCodeAt(indent) === 32) indent += 1;
    const content = stripComment(l.slice(indent)).trimEnd();
    if (content === '') return;
    if (content[0] === '\t') throw new YamlError('a tab in the indentation; YAML indents with spaces only', n + 1);
    if (indent === 0 && (content === '---' || content === '...')) {
      if (content === '---' && !started) {
        started = true;
        return;
      }
      throw new YamlError('a second document or a document end marker; one map is read from one file', n + 1);
    }
    if (indent === 0 && content[0] === '%') throw new YamlError('a directive such as %YAML, which this reader does not read', n + 1);
    started = true;
    L.push({ line: n + 1, indent, content });
  });
  if (!L.length) throw new YamlError('the file holds no value', 1);

  const lines = new Map();
  let i = 0;
  let values = 0;
  const fail = (reason, line = i < L.length ? L[i].line : L.at(-1).line) => {
    throw new YamlError(reason, line);
  };
  const count = (line) => {
    values += 1;
    if (values > lim.maxValues) fail(`more than ${lim.maxValues} values`, line);
  };
  const long = (s, line) => {
    if (s.length > lim.maxStringLength) fail(`a value longer than ${lim.maxStringLength} characters`, line);
    return s;
  };

  // A quoted value that starts at t[s]: { value, end }, end being the index after the closing quote.
  const quoted = (t, s, line) => {
    const q = t[s];
    let out = '';
    let k = s + 1;
    for (;;) {
      if (k >= t.length) fail('a quoted value that is not closed on its line', line);
      const c = t[k];
      if (q === "'" && c === "'") {
        if (t[k + 1] === "'") {
          out += "'";
          k += 2;
          continue;
        }
        return { value: long(out, line), end: k + 1 };
      }
      if (q === '"' && c === '"') return { value: long(out, line), end: k + 1 };
      if (q === '"' && c === '\\') {
        const e = t[k + 1];
        if (e === 'u') {
          const hex = t.slice(k + 2, k + 6);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail('an escape \\u that is not followed by four hexadecimal digits', line);
          out += String.fromCharCode(parseInt(hex, 16));
          k += 6;
        } else if (e !== undefined && Object.hasOwn(ESCAPES, e)) {
          out += ESCAPES[e];
          k += 2;
        } else fail(`an escape \\${(e ?? '').slice(0, 1)} that this reader does not read`, line);
      } else {
        out += c;
        k += 1;
      }
      if (out.length > lim.maxStringLength) fail(`a value longer than ${lim.maxStringLength} characters`, line);
    }
  };

  // A value written without quotes: null, a boolean, a number or a text.
  const plain = (t, line) => {
    if (INDICATORS.includes(t[0])) fail(`a value that starts with "${t[0]}" (an anchor, an alias, a tag, a block scalar or a mapping in braces), which this reader does not read`, line);
    if (t.includes(': ')) fail('a value without quotes that holds ": "; put the value in quotes', line);
    long(t, line);
    if (t === 'null' || t === 'Null' || t === 'NULL' || t === '~') return null;
    if (t === 'true' || t === 'True' || t === 'TRUE') return true;
    if (t === 'false' || t === 'False' || t === 'FALSE') return false;
    if (/^[-+]?[0-9]+$/.test(t) && Number.isSafeInteger(Number(t))) return Number(t);
    if (/^[-+]?(?:[0-9]+\.[0-9]*|\.[0-9]+)(?:[eE][-+]?[0-9]+)?$/.test(t)) return Number(t);
    return t;
  };

  // A list in brackets on one line, of quoted and plain values: [a, "b c"].
  const bracketList = (t, line, path) => {
    if (t[t.length - 1] !== ']') fail('a list in brackets that is not closed on its line', line);
    const inner = t.slice(1, -1).trim();
    const out = [];
    if (inner === '') return out;
    let k = 0;
    for (;;) {
      while (inner[k] === ' ') k += 1;
      let item;
      if (inner[k] === '"' || inner[k] === "'") {
        const q = quoted(inner, k, line);
        item = q.value;
        k = q.end;
        while (inner[k] === ' ') k += 1;
      } else {
        let end = k;
        while (end < inner.length && inner[end] !== ',') end += 1;
        const word = inner.slice(k, end).trim();
        if (word === '') fail('an empty entry in a list in brackets', line);
        if (word[0] === '[') fail('a list in brackets inside another, which this reader does not read', line);
        item = plain(word, line);
        k = end;
      }
      count(line);
      lines.set(`${path}[${out.length}]`, line);
      out.push(item);
      if (k >= inner.length) return out;
      if (inner[k] !== ',') fail('a comma or the end of the list was expected in a list in brackets', line);
      k += 1;
    }
  };

  // A value written on the line of its key or its dash.
  const scalar = (t, line, path) => {
    count(line);
    if (t[0] === '"' || t[0] === "'") {
      const q = quoted(t, 0, line);
      if (q.end !== t.length) fail('text after a quoted value', line);
      return q.value;
    }
    if (t[0] === '[') return bracketList(t, line, path);
    if (t === '{}') return {};
    return plain(t, line);
  };

  // { key, rest } when a content starts with a key and a colon, else null.
  const keyOf = (content, line) => {
    let key;
    let j;
    if (content[0] === '?' && (content.length === 1 || content[1] === ' ')) fail('a key that starts with "?", which this reader does not read', line);
    if (content[0] === '"' || content[0] === "'") {
      const q = quoted(content, 0, line);
      key = q.value;
      j = q.end;
    } else {
      if (content[0] === '[') return null;
      j = -1;
      for (let k = 0; k < content.length; k += 1) {
        if (content[k] === ':' && (k + 1 === content.length || content[k + 1] === ' ')) {
          j = k;
          break;
        }
      }
      if (j < 0) return null;
      key = content.slice(0, j).trimEnd();
      if (key === '') fail('a colon with no key in front of it', line);
      if (INDICATORS.includes(key[0])) fail(`a key that starts with "${key[0]}", which this reader does not read`, line);
    }
    if (!(content[j] === ':' && (j + 1 === content.length || content[j + 1] === ' '))) return null;
    return { key: long(key, line), rest: content.slice(j + 1).trim() };
  };

  const deeper = (indent) => i < L.length && L[i].indent > indent;

  const block = (indent, path, depth) => {
    if (depth > lim.maxDepth) fail(`values nested more than ${lim.maxDepth} deep`);
    return isItem(L[i].content) ? sequence(indent, path, depth) : mapping(indent, path, depth);
  };

  const sequence = (indent, path, depth) => {
    const out = [];
    while (i < L.length && L[i].indent === indent && isItem(L[i].content)) {
      const cur = L[i];
      const itemPath = `${path}[${out.length}]`;
      count(cur.line);
      lines.set(itemPath, cur.line);
      let k = 1;
      while (cur.content[k] === ' ') k += 1;
      const rest = cur.content.slice(k);
      if (rest === '') {
        i += 1;
        out.push(deeper(indent) ? block(L[i].indent, itemPath, depth + 1) : null);
      } else if (isItem(rest) || keyOf(rest, cur.line) !== null) {
        // The entry starts a list or a mapping on the line of its dash: read it as if it began at its own column.
        L[i] = { line: cur.line, indent: indent + k, content: rest };
        out.push(block(indent + k, itemPath, depth + 1));
      } else {
        out.push(scalar(rest, cur.line, itemPath));
        i += 1;
        if (deeper(indent)) fail('a line indented under a list entry that already has a value; a value cannot run on over several lines');
      }
    }
    if (deeper(indent)) fail('a line indented more than the lines before it, where none was expected');
    return out;
  };

  const mapping = (indent, path, depth) => {
    const out = {};
    const seen = new Set();
    while (i < L.length && L[i].indent === indent) {
      const cur = L[i];
      if (isItem(cur.content)) fail('a list entry where a key was expected');
      const kv = keyOf(cur.content, cur.line);
      if (kv === null) fail('a line that is neither a key with a colon nor a list entry');
      if (seen.has(kv.key)) fail(`the key "${kv.key.slice(0, 60)}" appears twice in one mapping; YAML keys must be unique`);
      seen.add(kv.key);
      count(cur.line);
      const p = path ? `${path}.${kv.key}` : kv.key;
      lines.set(p, cur.line);
      i += 1;
      let value;
      if (kv.rest === '') {
        if (deeper(indent)) value = block(L[i].indent, p, depth + 1);
        else if (i < L.length && L[i].indent === indent && isItem(L[i].content)) value = sequence(indent, p, depth + 1);
        else value = null;
      } else {
        value = scalar(kv.rest, cur.line, p);
        if (deeper(indent)) fail('a line indented under a key that already has a value; a value cannot run on over several lines');
      }
      setOwn(out, kv.key, value);
    }
    if (deeper(indent)) fail('a line indented more than the lines before it, where none was expected');
    return out;
  };

  lines.set('', L[0].line);
  let value;
  if (L.length === 1 && !isItem(L[0].content) && keyOf(L[0].content, L[0].line) === null) {
    value = scalar(L[0].content, L[0].line, '');
    i = 1;
  } else value = block(L[0].indent, '', 0);
  if (i < L.length) fail('a line indented less than the first line, after the end of the value');
  return { value, lines };
}
