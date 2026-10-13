import { LooseSyntaxError, readLoose, straighten } from '@/utils/looseJson';

/** The error a text raises, or null when it reads. */
function failure(text: string): LooseSyntaxError | null {
  try {
    readLoose(text);
    return null;
  } catch (e) {
    if (e instanceof LooseSyntaxError) return e;
    throw e;
  }
}

describe('reading what an assistant wrote', () => {
  it('reads plain JSON', () => {
    expect(readLoose('{"name": "Idli", "per": "piece", "calories_kcal": 39, "nested": {"a": [1, 2, null, true]}}')).toEqual({
      name: 'Idli',
      per: 'piece',
      calories_kcal: 39,
      nested: { a: [1, 2, null, true] },
    });
  });

  it('finds the data inside a reply: a sentence before, a code fence around, a sentence after', () => {
    const reply = 'Sure! Here are the nutrition facts for idli:\n\n```json\n{\n  "name": "Idli",\n  "protein_g": 1.9\n}\n```\n\nLet me know if you need anything else {anything}.';
    expect(readLoose(reply)).toEqual({ name: 'Idli', protein_g: 1.9 });
  });

  it('lets through what assistants commonly get wrong', () => {
    // a trailing comma, comments, single quotes, an unquoted key, a bare word, a number with its unit
    const text = `{
      name: 'Idli', // the food
      "per": "piece",
      /* grams */ "protein_g": 1.9,
      "fat_g": 0.2 g,
      "sodium_mg": N/A,
      "fiber_g": ~0.6,
    }`;
    expect(readLoose(text)).toEqual({ name: 'Idli', per: 'piece', protein_g: 1.9, fat_g: '0.2 g', sodium_mg: 'N/A', fiber_g: '~0.6' });
  });

  it('reads curly quotes and odd spaces, which a copied reply can carry', () => {
    const text = `{\u201Cname\u201D:\u00A0\u201CIdli\u201D, \u201Cprotein_g\u201D: 2}`;
    expect(readLoose(text)).toEqual({ name: 'Idli', protein_g: 2 });
    expect(straighten(text)).toHaveLength(text.length);
  });

  it('keeps true, false and null, and reads numbers however they are written', () => {
    expect(readLoose('{"a": true, "b": FALSE, "c": null, "d": +5, "e": .5, "f": 5., "g": 1e3, "h": -0.25}')).toEqual({
      a: true,
      b: false,
      c: null,
      d: 5,
      e: 0.5,
      f: 5,
      g: 1000,
      h: -0.25,
    });
  });

  it('reads escapes in text', () => {
    expect(readLoose('{"a": "line\\nbreak \\"quoted\\" \\u0041"}')).toEqual({ a: 'line\nbreak "quoted" A' });
  });

  it('reads a list of foods', () => {
    expect(readLoose('[{"name": "a"}, {"name": "b"}]')).toEqual([{ name: 'a' }, { name: 'b' }]);
  });

  it('has nothing to read when there is no object', () => {
    expect(readLoose('')).toBeUndefined();
    expect(readLoose('no data here')).toBeUndefined();
    expect(readLoose('[1, 2, 3]')).toBeUndefined();
  });

  it('passes over a bracketed aside before the data', () => {
    expect(readLoose('Here is the data [see the note below]: {"name": "Idli"}')).toEqual({ name: 'Idli' });
  });

  it('passes over braces and brackets in the sentence around the data, which are words and not data', () => {
    const data = '{"calories_kcal": 5, "protein_g": 1}';
    const expected = { calories_kcal: 5, protein_g: 1 };
    expect(readLoose(`Here is { the data } for you:\n${data}`)).toEqual(expected);
    expect(readLoose(`Values are per {serving}.\n\`\`\`json\n${data}\n\`\`\``)).toEqual(expected);
    expect(readLoose(`Note [see below\n${data}`)).toEqual(expected); // a bracket that is never closed
    expect(readLoose(`Per {1 piece} and [approx.]: ${data}`)).toEqual(expected);
    expect(readLoose(`Use {} for nothing, ${data}`)).toEqual({}); // an empty object does start like data: it reads, and has nothing in it
  });

  it('still reports a mistake once something starts like data, and does not read a cut-off reply as a smaller one', () => {
    expect(failure('Values {"calories_kcal": 5, "protein_g" 2}')!.expected).toBe('a colon after "protein_g"');
    // the outer object is never closed: its inner object is complete, but it is not the reply
    const cutOff = failure('{"name": "Idli", "nutrients": {"calories_kcal": 39}')!;
    expect(cutOff).toBeInstanceOf(LooseSyntaxError);
    expect(cutOff.expected).toBe('a comma or a closing }');
  });

  it('never lets a field called __proto__ change the object it is read into', () => {
    const read = readLoose('{"__proto__": {"polluted": true}, "name": "x"}') as Record<string, unknown>;
    expect(read.name).toBe('x');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.keys(read)).toEqual(['name']);
  });
});

describe('saying where it gave up', () => {
  it('names the line, the column and what it was looking for when a comma is missing', () => {
    const e = failure('{\n  "name": "Idli"\n  "per": "piece"\n}')!;
    expect(e).toBeInstanceOf(LooseSyntaxError);
    expect(e.line).toBe(3);
    expect(e.column).toBe(3);
    expect(e.near).toBe('"per": "piece"');
    expect(e.expected).toBe('a comma or a closing }');
  });

  it('counts lines in the text as it was pasted, including what came before the data', () => {
    const e = failure('Here you go:\n\n```json\n{ "a": 1,\n  "b" 2 }\n```')!;
    expect(e.line).toBe(5);
    expect(e.expected).toBe('a colon after "b"');
  });

  it('says so when the data is cut off', () => {
    const e = failure('{"name": "Idli", "protein_g": 2')!;
    expect(e.line).toBe(1);
    expect(e.expected).toBe('a comma or a closing }');
    expect(failure('{"name": "Idli",')!.expected).toBe('a field name in quotes');
  });

  it('points at the start of a text that is never closed', () => {
    const e = failure('{"name": "Idli,\n"per": "piece"}')!;
    expect(e.line).toBe(1);
    expect(e.column).toBe(10);
    expect(e.expected).toBe('the closing quote of this text');
  });

  it('asks for a value where there is none', () => {
    expect(failure('{"a": }')!.expected).toBe('a value');
    expect(failure('{"a": ,"b": 1}')!.expected).toBe('a value');
  });

  it('refuses data nested far deeper than any food needs, rather than running out of stack', () => {
    expect(failure('{"a":'.repeat(200) + '1' + '}'.repeat(200))!.expected).toBe('a simpler structure');
    expect(failure('[{"a":'.repeat(200) + '1')!.expected).toBe('a simpler structure');
  });

  it('accepts the same text without the slip', () => {
    expect(failure('{\n  "name": "Idli",\n  "per": "piece"\n}')).toBeNull();
  });
});
