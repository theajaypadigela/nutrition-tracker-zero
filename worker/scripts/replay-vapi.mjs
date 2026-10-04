#!/usr/bin/env node
// Replays sample Vapi server messages against a local or deployed Worker (PLAN.md §13, Phase 3).
//
//   node scripts/replay-vapi.mjs --base http://localhost:8787 --user "Asha" --local --scenario all
//   APP_TOKEN=… node scripts/replay-vapi.mjs --base https://<worker>.workers.dev --user "Asha" --remote --scenario save
//
// The webhook token is read straight from D1 with `wrangler d1 execute … --json`, so no API exposes it
// and it is never printed. With APP_TOKEN set, results are verified through the REST API.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const fixtures = join(root, 'test', 'fixtures', 'vapi');
const SCENARIOS = ['save', 'duplicate', 'correction', 'no-list'];

const { values: args } = parseArgs({
  options: {
    base: { type: 'string' },
    user: { type: 'string' },
    scenario: { type: 'string', default: 'all' },
    local: { type: 'boolean', default: false },
    remote: { type: 'boolean', default: false },
    db: { type: 'string', default: 'nutrition-zero' },
  },
});

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

if (!args.base || !args.user || args.local === args.remote) {
  fail('usage: --base <url> --user <profile name or id> (--local | --remote) [--scenario save|duplicate|correction|no-list|all]');
}
const scenarios = args.scenario === 'all' ? SCENARIOS : [args.scenario];
for (const s of scenarios) if (!SCENARIOS.includes(s)) fail(`unknown scenario ${s}`);
const base = args.base.replace(/\/+$/, '');
const appToken = process.env.APP_TOKEN;

function lookupUser(user) {
  const quoted = user.replace(/'/g, "''");
  const out = execFileSync(
    'npx',
    [
      'wrangler', 'd1', 'execute', args.db, args.local ? '--local' : '--remote', '--json',
      '--command', `SELECT id, name, timezone, webhook_token FROM users WHERE id = '${quoted}' OR name = '${quoted}' COLLATE NOCASE`,
    ],
    { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const rows = JSON.parse(out)[0]?.results ?? [];
  if (rows.length !== 1) fail(`expected one profile matching "${user}", found ${rows.length}`);
  return rows[0];
}

function fixture(name, vars) {
  let text = readFileSync(join(fixtures, name), 'utf8');
  for (const [k, v] of Object.entries(vars)) text = text.split(`__${k}__`).join(v);
  return text;
}

async function post(token, body) {
  const res = await fetch(`${base}/vapi/webhook/${token}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function rest(user, path) {
  const res = await fetch(`${base}${path}`, { headers: { authorization: `Bearer ${appToken}`, 'x-user-id': user.id } });
  if (!res.ok) fail(`GET ${path} → ${res.status}`);
  return res.json();
}

function localDate(tz) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

async function callState(user, callId) {
  if (!appToken) return null;
  const day = await rest(user, `/days/${localDate(user.timezone)}`);
  return {
    items: day.items.filter((i) => i.callId === callId),
    call: day.calls.find((c) => c.vapiCallId === callId),
  };
}

function check(label, ok, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` (${detail})` : ''}`);
  if (!ok) process.exitCode = 1;
}

const user = lookupUser(args.user);
console.log(`Replaying against ${base} as profile ${user.name} (${user.id})${appToken ? '' : ' — set APP_TOKEN to verify via the API'}`);

for (const scenario of scenarios) {
  const callId = `replay-${scenario}-${crypto.randomUUID()}`;
  const tc = (n) => `${callId}-tc${n}`;
  console.log(`\n# ${scenario} (call ${callId})`);
  const save = fixture('tool-calls.save.json', { CALL_ID: callId, TOOL_CALL_ID: tc(1) });

  if (scenario === 'no-list') {
    const r = await post(user.webhook_token, fixture('end-of-call-report.no-list.json', { CALL_ID: callId }));
    check('end-of-call-report accepted', r.status === 200, `HTTP ${r.status}`);
    const s = await callState(user, callId);
    if (s) check('call is no_list with transcript', s.call?.status === 'no_list' && !!s.call?.transcript, s.call?.status);
    continue;
  }

  const first = await post(user.webhook_token, save);
  check('save_foods → Saved 5 items', first.body?.results?.[0]?.result === 'Saved 5 items', JSON.stringify(first.body));

  if (scenario === 'duplicate') {
    const again = await post(user.webhook_token, save);
    check('redelivery answers the same', again.body?.results?.[0]?.result === 'Saved 5 items');
  }
  if (scenario === 'correction') {
    const fix = await post(user.webhook_token, fixture('tool-calls.correction.json', { CALL_ID: callId, TOOL_CALL_ID: tc(2) }));
    check('correction → Saved 4 items', fix.body?.results?.[0]?.result === 'Saved 4 items', JSON.stringify(fix.body));
  }

  const report = await post(user.webhook_token, fixture('end-of-call-report.json', { CALL_ID: callId }));
  check('end-of-call-report accepted', report.status === 200);

  const s = await callState(user, callId);
  if (s) {
    const expected = scenario === 'correction' ? 4 : 5;
    check(`call has exactly ${expected} items`, s.items.length === expected, `${s.items.length}`);
    check('call stays tool_saved', s.call?.status === 'tool_saved', s.call?.status);
  }
}
