/// <reference types="vite/client" />
/**
 * The weekly pipeline is four modules, kept apart so an error can be traced to one of them and each can be tested on its own:
 *
 *   targets/   what a person is compared against (the target calculator)
 *   intake/    what was logged, in nutrients (the intake calculator)
 *   quality/   what is complete, missing or uncertain (the data-quality checker)
 *   report/    the weekly view built from the other three (the report generator)
 *
 * Dependencies only point one way: the report may use the other three, the data-quality checker may read what intake adds up,
 * and neither intake nor the target calculator knows the others exist. None of the four (nor the reference tables they read)
 * reaches for the database, the routes or the health tables: they are pure. (`domain/resolve.ts`, the cascade that re-resolves
 * logged items when a food changes, is the one domain file that writes to the database, and it is not part of the pipeline.)
 */
import { describe, expect, it } from 'vitest';

const files = import.meta.glob('../../src/domain/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

/** `report/weekly.ts` for `../../src/domain/report/weekly.ts`. */
const rel = (path: string) => path.replace('../../src/domain/', '');
const moduleOf = (path: string) => (rel(path).includes('/') ? rel(path).split('/')[0]! : '(root)');

/** Every import of a file, resolved to a path under src/ (`domain/intake/totals`, `db/queries`, `routes/...`). */
function importsOf(path: string, source: string): string[] {
  const dir = rel(path).split('/').slice(0, -1);
  const out: string[] = [];
  for (const m of source.matchAll(/(?:^|\n)\s*(?:import|export)\b[^'"]*?from\s+'([^']+)'/g)) {
    const spec = m[1]!;
    if (!spec.startsWith('.')) continue;
    const parts = ['domain', ...dir];
    for (const seg of spec.split('/')) {
      if (seg === '.') continue;
      if (seg === '..') parts.pop();
      else parts.push(seg);
    }
    out.push(parts.join('/'));
  }
  return out;
}

/** What each module may NOT import. */
const FORBIDDEN: Record<string, readonly string[]> = {
  reference: ['domain/targets', 'domain/intake', 'domain/quality', 'domain/report'],
  targets: ['domain/intake', 'domain/quality', 'domain/report'],
  intake: ['domain/targets', 'domain/quality', 'domain/report'],
  quality: ['domain/targets', 'domain/report'],
  report: [],
};
const OUTSIDE_DOMAIN = /^(db|routes|vapi|health|auth|router|http|index|maintenance|validate)\b/;

describe('the four modules of the weekly pipeline', () => {
  it('are where they should be', () => {
    const modules = new Set(Object.keys(files).map(moduleOf));
    for (const m of ['targets', 'intake', 'quality', 'report', 'reference']) expect(modules, m).toContain(m);
    expect(Object.keys(files).length).toBeGreaterThan(30);
  });

  it('only depend one way: report on the rest, quality on intake, intake and targets on neither', () => {
    const broken: string[] = [];
    for (const [path, source] of Object.entries(files)) {
      const forbidden = FORBIDDEN[moduleOf(path)] ?? [];
      for (const target of importsOf(path, source)) {
        if (forbidden.some((f) => target === f || target.startsWith(`${f}/`))) broken.push(`${rel(path)} imports ${target}`);
      }
    }
    expect(broken).toEqual([]);
  });

  it('stay pure: none of them imports the database, a route or the health tables', () => {
    const pipeline = Object.entries(files).filter(([path]) => moduleOf(path) in FORBIDDEN);
    expect(pipeline.length).toBeGreaterThan(25);
    const broken = pipeline.flatMap(([path, source]) =>
      importsOf(path, source)
        .filter((t) => !t.startsWith('domain/') && OUTSIDE_DOMAIN.test(t))
        .map((t) => `${rel(path)} imports ${t}`),
    );
    expect(broken).toEqual([]);
  });

  it('can tell a forbidden import when it sees one', () => {
    expect(importsOf('../../src/domain/intake/totals.ts', "import { x } from '../targets/types';")).toEqual(['domain/targets/types']);
    expect(importsOf('../../src/domain/quality/days.ts', "import type { y } from '../intake/types';\nexport { z } from './types';")).toEqual([
      'domain/intake/types',
      'domain/quality/types',
    ]);
    expect(importsOf('../../src/domain/match.ts', "import { db } from '../db/queries';")).toEqual(['db/queries']);
  });
});
