/**
 * A forgiving JSON reader for text that came from a chat assistant. It lets through what assistants commonly get wrong (a trailing
 * comma, single or curly quotes, an unquoted key, a comment, a bare word where a string belongs) and, when it does give up, says
 * where. It reads the first object (or list of objects) in the text and ignores whatever surrounds it (the sentence before, the closing
 * words after, the code fence around), so a reply that wraps the data in prose still reads.
 */
export type Loose = string | number | boolean | null | Loose[] | { [key: string]: Loose };
export type LooseObject = { [key: string]: Loose };

export const isLooseObject = (v: unknown): v is LooseObject => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Where the reader gave up, and what it was looking for. `line` and `column` count from 1, in the text as it was pasted. */
export class LooseSyntaxError extends Error {
  constructor(
    readonly line: number,
    readonly column: number,
    /** The few characters at that spot, up to the end of the line. */
    readonly near: string,
    /** A phrase that completes "expected ...". */
    readonly expected: string,
  ) {
    super(`line ${line}, column ${column}: expected ${expected}`);
  }
}

/** The characters of these code points, as a regular-expression class body. */
const chars = (...codes: number[]) => codes.map(c => String.fromCodePoint(c)).join('');

const CURLY_DOUBLE = new RegExp(`[${chars(0x201c, 0x201d, 0x201e, 0x201f, 0x2033, 0xab, 0xbb)}]`, 'g');
const CURLY_SINGLE = new RegExp(`[${chars(0x2018, 0x2019, 0x201a, 0x201b, 0x2032)}]`, 'g');
/** No-break and zero-width spaces, which a copied reply can carry without showing them. */
const ODD_SPACES = new RegExp(`[${chars(0xa0)}${chars(0x2000)}-${chars(0x200b)}${chars(0x202f, 0x205f, 0x3000, 0xfeff)}]`, 'g');

/** Curly quotes become straight ones and odd spaces plain ones. Every replacement is one character for one, so positions hold. */
export function straighten(text: string): string {
  return text.replace(CURLY_DOUBLE, '"').replace(CURLY_SINGLE, "'").replace(ODD_SPACES, ' ');
}

const NUMBER = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
const MAX_DEPTH = 40;

/** One value from `src` at `start` (which holds a `{` or a `[`), and where it ended. Throws a `LooseSyntaxError`. */
function parseAt(src: string, start: number): { value: Loose; end: number } {
  const n = src.length;
  let i = start;

  const errorAt = (pos: number, expected: string): LooseSyntaxError => {
    const before = src.slice(0, pos);
    const line = before.split('\n').length;
    const column = pos - before.lastIndexOf('\n');
    return new LooseSyntaxError(line, column, (src.slice(pos, pos + 18).split('\n')[0] ?? '').trimEnd(), expected);
  };
  const fail = (expected: string): never => {
    throw errorAt(i, expected);
  };

  /** Whitespace and comments. */
  const skip = () => {
    while (i < n) {
      const c = src[i]!;
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') i++;
      else if (c === '/' && src[i + 1] === '/') {
        while (i < n && src[i] !== '\n') i++;
      } else if (c === '/' && src[i + 1] === '*') {
        const end = src.indexOf('*/', i + 2);
        i = end < 0 ? n : end + 2;
      } else break;
    }
  };

  const string = (): string => {
    const quote = src[i]!;
    const opened = i;
    i++;
    let out = '';
    for (;;) {
      if (i >= n || src[i] === '\n') throw errorAt(opened, 'the closing quote of this text');
      const c = src[i]!;
      if (c === quote) {
        i++;
        return out;
      }
      if (c === '\\') {
        const next = src[i + 1];
        if (next === 'u' && /^[0-9a-fA-F]{4}$/.test(src.slice(i + 2, i + 6))) {
          out += String.fromCharCode(parseInt(src.slice(i + 2, i + 6), 16));
          i += 6;
          continue;
        }
        const simple: Record<string, string> = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f' };
        out += next === undefined ? '' : (simple[next] ?? next);
        i += 2;
        continue;
      }
      out += c;
      i++;
    }
  };

  /** Anything up to the next comma, bracket, end of line or comment: a number, a word, or `12 g`. */
  const bare = (): Loose => {
    const from = i;
    while (i < n) {
      const c = src[i]!;
      if (c === ',' || c === '}' || c === ']' || c === '\n' || c === '\r') break;
      if (c === '/' && (src[i + 1] === '/' || src[i + 1] === '*')) break;
      i++;
    }
    const token = src.slice(from, i).trim();
    if (token === '') {
      i = from;
      return fail('a value');
    }
    const lower = token.toLowerCase();
    if (lower === 'true') return true;
    if (lower === 'false') return false;
    if (lower === 'null') return null;
    return NUMBER.test(token) ? Number(token) : token;
  };

  const key = (): string => {
    if (src[i] === '"' || src[i] === "'") return string();
    const word = /^[A-Za-z_$][\w$-]*/.exec(src.slice(i, i + 80));
    if (!word) return fail('a field name in quotes');
    i += word[0].length;
    return word[0];
  };

  const value = (depth: number): Loose => {
    skip();
    if (i >= n) return fail('a value');
    if (depth > MAX_DEPTH) return fail('a simpler structure');
    const c = src[i]!;
    if (c === '{') {
      i++;
      const out: LooseObject = {};
      for (;;) {
        skip();
        if (src[i] === '}') {
          i++;
          return out;
        }
        const name = key();
        skip();
        if (src[i] !== ':') fail(`a colon after "${name}"`);
        i++;
        const v = value(depth + 1);
        if (name !== '__proto__') out[name] = v;
        skip();
        if (src[i] === ',') {
          i++;
          continue;
        }
        if (src[i] === '}') {
          i++;
          return out;
        }
        fail('a comma or a closing }');
      }
    }
    if (c === '[') {
      i++;
      const out: Loose[] = [];
      for (;;) {
        skip();
        if (src[i] === ']') {
          i++;
          return out;
        }
        out.push(value(depth + 1));
        skip();
        if (src[i] === ',') {
          i++;
          continue;
        }
        if (src[i] === ']') {
          i++;
          return out;
        }
        fail('a comma or a closing ]');
      }
    }
    if (c === '"' || c === "'") return string();
    return bare();
  };

  const parsed = value(0);
  return { value: parsed, end: i };
}

/**
 * Whether the bracket at `at` opens something that reads like data, not like a word in a sentence: an object starts with a field name
 * and a colon (or is empty), a list starts with an object. "{serving}" and "{ the data }" and "[see below]" are not data.
 */
function startsLikeData(src: string, at: number): boolean {
  const after = src.slice(at + 1, at + 200);
  return src[at] === '{'
    ? /^\s*(\}|["'][^"'\n]{1,80}["']\s*:|[A-Za-z_$][\w$-]*\s*:|\/[/*])/.test(after)
    : /^\s*\{/.test(after);
}

/**
 * The first object, or list holding an object, in `input`; `undefined` when there is none. A sentence around the data may have
 * braces or brackets of its own ("per {serving}", "[see below]"): those are passed over. Once something starts like data, though, a
 * mistake in it is reported, never skipped, so a cut-off reply is not read as a smaller one. Throws a `LooseSyntaxError`. A value that
 * is not quoted and not a number is kept as text (`N/A`, `12 g`, `~40`), for the caller to make sense of.
 */
export function readLoose(input: string): Loose | undefined {
  const src = straighten(input);
  let from = 0;
  for (;;) {
    const rest = src.slice(from).search(/[{[]/);
    if (rest < 0) return undefined;
    const at = from + rest;
    if (!startsLikeData(src, at)) {
      from = at + 1;
      continue;
    }
    const { value, end } = parseAt(src, at);
    if (isLooseObject(value) || (Array.isArray(value) && value.some(isLooseObject))) return value;
    from = end;
  }
}
