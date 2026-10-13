/**
 * Writes the weekly reports the app's tests use: `npm run fixtures:app` in the worker. See test/unit/report/app-fixtures.ts.
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { metaNutrients } from '../src/routes/meta';
import { buildAppFixtures } from '../test/unit/report/app-fixtures';

// Run from the worker directory (the npm script does): the app sits next to it.
const dir = resolve(process.cwd(), '../app/__tests__/fixtures');
for (const [file, value] of [
  ['reports.json', buildAppFixtures()],
  ['meta.json', { nutrients: metaNutrients() }],
] as const) {
  writeFileSync(resolve(dir, file), `${JSON.stringify(value, null, 2)}\n`);
  console.log(`wrote ${resolve(dir, file)}`);
}
