import path from 'node:path';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig(async () => {
  const migrations = await readD1Migrations(path.join(import.meta.dirname, 'migrations'));
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: {
          // The Nutrient mix is off in a deployment (wrangler.jsonc) and on here, so the integration tests keep exercising its rules;
          // test/integration/reports.test.ts checks the deployment default and what a report says with the score off.
          bindings: { APP_TOKEN: 'test-app-token', DEEPGRAM_API_KEY: 'test-deepgram-key', PUBLIC_BASE_URL: '', NUTRIENT_SCORE: '1', TEST_MIGRATIONS: migrations },
        },
      }),
    ],
    test: {
      setupFiles: ['./test/apply-migrations.ts'],
    },
  };
});
