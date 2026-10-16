/**
 * The whole app-side stack against the real Worker code running on SQLite, the way it runs on the phone: the app's own API client,
 * the on-device D1, the polyfills, the Vapi bridge. Node's built-in sqlite stands in for the phone's SQLite file.
 */
import { createEmbedded, type EmbeddedBackend } from '@/embedded/runtime';
import { nodeSqliteDriver } from '../../testing/nodeSqlite';

let mockBackend: EmbeddedBackend;
const driver = nodeSqliteDriver();

jest.mock('@/config/local', () => ({ ON_DEVICE: true, API_BASE_URL: 'http://unused', APP_TOKEN: 'tok' }));
jest.mock('@/embedded/runtime', () => {
  const actual = jest.requireActual('@/embedded/runtime');
  return { ...actual, getEmbedded: () => mockBackend };
});

import { api, ApiError, deliverVapiMessage, setApiSecret, setApiUser } from '@/api/client';
import { CONSENT_VERSION } from '@/i18n/strings';
import { CallBridge } from '@/embedded/vapi';
import { FEATURES } from '@/config/features';

const today = () => new Date().toISOString().slice(0, 10);

beforeAll(() => {
  mockBackend = createEmbedded(driver, 'tok');
});

async function newProfile(name: string, extra: { timezone?: string; callTime?: string | null } = {}) {
  const { profile, secret } = await api.createProfile(name, extra);
  setApiUser(profile.id);
  setApiSecret(secret);
  return { profile, secret };
}

describe('on the phone', () => {
  it('answers health and serves the catalogue', async () => {
    expect(await api.health()).toMatchObject({ ok: true });
    const meta = await api.meta();
    expect(meta.units.length).toBeGreaterThan(5);
    expect(meta.nutrients.length).toBeGreaterThan(15);
  });

  it('creates a profile with a one-time secret and refuses a duplicate name', async () => {
    const { profile, secret } = await newProfile('Asha');
    expect(secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect((await api.listProfiles()).map((p) => p.name)).toContain('Asha');
    expect((await api.getSettings()).id).toBe(profile.id);
    await expect(api.createProfile('asha')).rejects.toMatchObject({ status: 409 });
  });

  it('registers an account and logs in to it, with the password checked by the Worker code running on SQLite', async () => {
    const created = await api.register('Kavya', 'a long password');
    expect(created.secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    // Logging in needs no profile selected yet, and finds the account whatever the case.
    setApiUser(null);
    setApiSecret(null);
    await expect(api.login('KAVYA', 'a long password')).resolves.toEqual({ profile: created.profile, secret: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/) });
    await expect(api.login('Kavya', 'a long passworD')).rejects.toMatchObject({ status: 401, code: 'invalid_credentials' });
    await expect(api.register('kavya', 'another password')).rejects.toMatchObject({ status: 409, code: 'name_taken' });
    // What the account made at registration is the same profile the app then selects.
    setApiUser(created.profile.id);
    setApiSecret(created.secret);
    expect((await api.getSettings()).name).toBe('Kavya');
  });

  it('logs food, asks for its values, then resolves everything once they are entered', async () => {
    await newProfile('Ravi');
    const d = today();
    const items = await api.addItems(d, [
      { name: 'idli', quantity: 3, unit: 'piece', meal: 'breakfast' },
      { name: 'masala chai', quantity: 1, unit: 'cup' },
    ]);
    expect(items).toHaveLength(2);
    expect(items.every((i) => i.status === 'pending_food')).toBe(true);
    expect((await api.uncached()).unknownFoods.map((f) => f.normalizedName)).toEqual(expect.arrayContaining(['idli']));

    const created = await api.createFood({ displayName: 'Idli', baseUnit: 'piece', nutrients: { calories: 39, protein: 2, carbs: 8, fat: 0.2 } });
    expect(created.resolvedCount).toBe(1);
    const day = await api.getDay(d);
    const idli = day.items.find((i) => i.rawName === 'idli')!;
    expect(idli.status).toBe('resolved');
    expect(idli.nutrients.calories).toBeCloseTo(117, 5);
    expect(day.items.find((i) => i.rawName === 'masala chai')!.status).toBe('pending_food');

    await api.deleteItem(idli.id);
    expect((await api.getDay(d)).items.map((i) => i.rawName)).toEqual(['masala chai']);
  });

  it('ranks what the person logs for each meal, from their own log, on the phone as on the server', async () => {
    await newProfile('Hema');
    const day = (back: number) => new Date(Date.now() - back * 86_400_000).toISOString().slice(0, 10);
    for (const back of [0, 1, 2, 3]) {
      await api.addItems(day(back), [
        { name: 'egg', quantity: 2, unit: 'piece', meal: 'breakfast' },
        { name: 'dal', quantity: 1, unit: 'katori', meal: 'lunch' },
      ]);
    }
    await api.addItems(day(4), [{ name: 'toast', quantity: 2, unit: 'slice', meal: 'breakfast' }]);
    const history = await api.getFoodHistory();
    expect(history.windowDays).toBeGreaterThan(30);
    const forMeal = (meal: 'breakfast' | 'lunch') =>
      history.foods.filter((f) => f.meals[meal]).sort((a, b) => b.meals[meal]!.score - a.meals[meal]!.score).map((f) => f.displayName);
    expect(forMeal('breakfast')).toEqual(['egg', 'toast']);
    expect(forMeal('lunch')).toEqual(['dal']);
    expect(history.foods.find((f) => f.name === 'egg')!.meals.breakfast).toMatchObject({ days: 4, quantity: 2, unit: 'piece' });

    // another person on the same phone has nothing of the first person's
    await newProfile('Someone else');
    expect((await api.getFoodHistory()).foods).toEqual([]);
  });

  it('builds the weekly report from what was logged', async () => {
    await newProfile('Meera');
    await api.createFood({ displayName: 'Dal', baseUnit: 'katori', nutrients: { calories: 120, protein: 7 } });
    const d = today();
    await api.addItems(d, [{ name: 'dal', quantity: 2, unit: 'katori' }]);
    const report = await api.getWeeklyReport();
    expect(report).toBeTruthy();
    expect(JSON.stringify(report)).toContain('2026'.slice(0, 2));
  });

  it('keeps health data behind the profile secret', async () => {
    const { profile, secret } = await newProfile('Kiran');
    setApiSecret(null);
    await expect(api.getHealthProfile()).rejects.toMatchObject({ status: 403 });
    setApiSecret('x'.repeat(43));
    await expect(api.getHealthProfile()).rejects.toMatchObject({ status: 403, code: 'profile_secret_invalid' });
    setApiSecret(secret);
    await expect(api.getHealthProfile()).resolves.toBeTruthy();
    expect(profile.name).toBe('Kiran');
  });

  it('keeps personal details across restarts and saves edited values', async () => {
    const { profile, secret } = await newProfile('Personal details');
    const saved = await api.saveHealthProfile({ profile: { birthYear: 1990, birthMonth: 3, sexForCalc: 'female', heightCm: 165, weightKg: 62, activity: 'low_active', goal: 'maintain' },
      safety: { pregnantOrBreastfeeding: false, eatingDisorder: false, clinicianDiet: false, dietInteractingMedicine: false }, consentVersion: CONSENT_VERSION });
    expect(saved.profile.mode).toBe('personalised');
    mockBackend = createEmbedded(driver, 'tok');
    setApiUser(profile.id);
    setApiSecret(secret);
    expect((await api.getHealthProfile()).profile).toMatchObject({ mode: 'personalised', birthYear: 1990, heightCm: 165, weightKg: 62 });
    const edited = await api.saveHealthProfile({ profile: { birthYear: 1991, birthMonth: null, weightKg: 64 } });
    expect(edited.profile).toMatchObject({ mode: 'personalised', birthYear: 1991, heightCm: 165, weightKg: 64 });
    expect(edited.profile.birthMonth).toBeUndefined();
    expect((await api.getHealthProfile()).profile).toEqual(edited.profile);
  });

  it('survives an app restart: the same file, migrated again, still has the data', async () => {
    await newProfile('Persist');
    await api.addItems(today(), [{ name: 'rice', quantity: 1, unit: 'katori' }]);
    const again = createEmbedded(driver, 'tok');
    const res = await again.request('GET', '/profiles', { authorization: 'Bearer tok' });
    expect(JSON.parse(res.body).profiles.map((p: { name: string }) => p.name)).toContain('Persist');
  });

  it('rejects a wrong token and an unknown route with the same errors as the hosted Worker', async () => {
    const res = await mockBackend.request('GET', '/profiles', { authorization: 'Bearer nope' });
    expect(res.status).toBe(401);
    const missing = await mockBackend.request('GET', '/nothing', { authorization: 'Bearer tok' });
    expect(missing.status).toBe(404);
    await expect(api.getDay('not-a-date')).rejects.toBeInstanceOf(ApiError);
  });

  it('deletes a profile and everything it owned', async () => {
    const { profile } = await newProfile('Gone');
    await api.addItems(today(), [{ name: 'toast', quantity: 2, unit: 'slice' }]);
    await api.deleteProfile();
    const left = driver.run('SELECT count(*) AS c FROM log_items WHERE user_id = ?1', [profile.id]).rows[0]!.c;
    expect(left).toBe(0);
    expect((await api.listProfiles()).map((p) => p.name)).not.toContain('Gone');
  });
});

describe('a voice call on the phone', () => {
  async function startCall() {
    await api.updateSettings({ vapiPublicKey: 'pk_test_key' });
    return api.startCall('manual');
  }

  it('hands Vapi an assistant that saves on the device: no server, no webhook, a tool that is not waited on', async () => {
    await newProfile('Caller');
    const started = await startCall();
    expect(started.publicKey).toBe('pk_test_key');
    const a = started.assistant as any;
    expect(JSON.stringify(a)).not.toMatch(/https?:\/\//);
    expect(a.server).toBeUndefined();
    expect(a.model.tools[0]).toMatchObject({ type: 'function', async: true });
    expect(a.model.tools[0].server).toBeUndefined();
    expect(a.clientMessages).toContain('tool-calls');
  });

  it('saves the confirmed list from the call, replaces it when corrected, and records the call', async () => {
    const { profile } = await newProfile('Talker');
    const started = await startCall();
    const bridge = new CallBridge({ callRowId: started.callId, localDate: started.localDate, deliver: deliverVapiMessage });
    bridge.vapiCallId = 'vapi-call-1';
    await api.callStarted(started.callId, 'vapi-call-1');

    await bridge.onMessage({ type: 'transcript', transcriptType: 'final', role: 'assistant', transcript: 'What did you have for breakfast?' });
    await bridge.onMessage({ type: 'transcript', transcriptType: 'partial', role: 'user', transcript: 'two idl' });
    await bridge.onMessage({ type: 'transcript', transcriptType: 'final', role: 'user', transcript: 'Two idlis and a cup of tea.' });
    // Vapi's client message: arguments as a JSON string, as the docs say they may be.
    await bridge.onMessage({
      type: 'tool-calls',
      toolCallList: [
        { id: 'tc1', function: { name: 'save_foods', arguments: JSON.stringify({ items: [{ name: 'idli', quantity: 2, unit: 'piece', meal: 'breakfast' }, { name: 'tea', quantity: 1, unit: 'cup', meal: 'breakfast' }] }) } },
      ],
    });
    let day = await api.getDay(started.localDate);
    expect(day.items.filter((i) => i.source === 'call').map((i) => i.rawName).sort()).toEqual(['idli', 'tea']);
    expect(day.items.every((i) => i.callId === 'vapi-call-1')).toBe(true);

    // The same call seen again in the conversation history: no second save.
    await bridge.onMessage({
      type: 'conversation-update',
      conversation: [{ role: 'assistant', tool_calls: [{ id: 'tc1', function: { name: 'save_foods', arguments: '{"items":[{"name":"idli","quantity":2,"unit":"piece"}]}' } }] }],
    });
    expect((await api.getDay(started.localDate)).items).toHaveLength(2);

    // A correction replaces what that call saved; it never doubles it.
    await bridge.onMessage({
      type: 'tool-calls',
      toolCallList: [{ id: 'tc2', function: { name: 'save_foods', arguments: { items: [{ name: 'idli', quantity: 3, unit: 'piece', meal: 'breakfast' }] } } }],
    });
    day = await api.getDay(started.localDate);
    expect(day.items.map((i) => [i.rawName, i.quantity])).toEqual([['idli', 3]]);

    await bridge.finish('assistant-ended-call');
    await bridge.finish('customer-ended-call');
    day = await api.getDay(started.localDate);
    const call = day.calls.find((c) => c.vapiCallId === 'vapi-call-1')!;
    expect(call.status).toBe('tool_saved');
    expect(call.endedReason).toBe('assistant-ended-call');
    const latest = await api.latestCall();
    expect(latest?.status).toBe('tool_saved');
    const row = driver.run('SELECT transcript, duration_seconds FROM calls WHERE user_id = ?1 AND vapi_call_id = ?2', [profile.id, 'vapi-call-1']).rows[0]!;
    expect(row.transcript).toBe('AI: What did you have for breakfast?\nUser: Two idlis and a cup of tea.');
    expect(typeof row.duration_seconds).toBe('number');
  });

  it('marks the day complete through the on-device bridge only after confirmation (switched on: it is off for now)', async () => {
    const was = FEATURES.dayCompletion;
    FEATURES.dayCompletion = true;
    try {
      await markThroughTheBridge();
    } finally {
      FEATURES.dayCompletion = was;
    }
  });

  it('does not mark the day through the on-device bridge while day marking is off, and the call is not disturbed', async () => {
    await newProfile('Off caller');
    const started = await startCall();
    const bridge = new CallBridge({ callRowId: started.callId, localDate: started.localDate, deliver: deliverVapiMessage });
    await bridge.onMessage({ type: 'tool-calls', toolCallList: [{ id: 'mark', function: { name: 'mark_day_complete', arguments: { confirmed: true } } }] });
    expect((await api.getDay(started.localDate)).status).toBeNull();
    await bridge.finish('assistant-ended-call');
  });

  async function markThroughTheBridge() {
    await newProfile('Complete caller');
    const started = await startCall();
    const bridge = new CallBridge({ callRowId: started.callId, localDate: started.localDate, deliver: deliverVapiMessage });
    const mark = (id: string, confirmed: boolean) => ({ type: 'tool-calls', toolCallList: [{ id, function: { name: 'mark_day_complete', arguments: { confirmed } } }] });
    await bridge.onMessage(mark('declined', false));
    expect((await api.getDay(started.localDate)).status).toBeNull();
    await bridge.onMessage(mark('confirmed', true));
    expect((await api.getDay(started.localDate)).status).toBe('complete');
    await api.setDayStatus(started.localDate, 'partial');
    await bridge.onMessage(mark('confirmed', true));
    expect((await api.getDay(started.localDate)).status).toBe('partial');
    await bridge.finish('assistant-ended-call');
  }

  it('finds the call by metadata when the save arrives before Vapi has named the call', async () => {
    await newProfile('Early');
    const started = await startCall();
    const bridge = new CallBridge({ callRowId: started.callId, localDate: started.localDate, deliver: deliverVapiMessage });
    await bridge.onMessage({ type: 'tool-calls', toolCallList: [{ function: { name: 'save_foods', arguments: { items: [{ name: 'rice', quantity: 1, unit: 'katori' }] } } }] });
    expect((await api.getDay(started.localDate)).items.map((i) => i.rawName)).toEqual(['rice']);
    await bridge.finish('assistant-ended-call');
    expect((await api.getDay(started.localDate)).calls[0]!.status).toBe('tool_saved');
  });

  it('records a call that ended with no list, with its transcript, so the app can offer the manual form', async () => {
    await newProfile('Silent');
    const started = await startCall();
    const bridge = new CallBridge({ callRowId: started.callId, localDate: started.localDate, deliver: deliverVapiMessage });
    bridge.vapiCallId = 'vapi-call-2';
    await api.callStarted(started.callId, 'vapi-call-2');
    await bridge.onMessage({ type: 'transcript', transcriptType: 'final', role: 'user', transcript: 'Sorry, never mind.' });
    await bridge.finish('customer-ended-call');
    const call = (await api.getDay(started.localDate)).calls.find((c) => c.vapiCallId === 'vapi-call-2')!;
    expect(call.status).toBe('no_list');
    expect(call.transcript).toContain('User: Sorry, never mind.');
  });

  it('rejects a save with a bad list without breaking the call, and reports it as no list', async () => {
    await newProfile('Garbled');
    const started = await startCall();
    const bridge = new CallBridge({ callRowId: started.callId, localDate: started.localDate, deliver: deliverVapiMessage });
    bridge.vapiCallId = 'vapi-call-3';
    await api.callStarted(started.callId, 'vapi-call-3');
    await bridge.onMessage({ type: 'tool-calls', toolCallList: [{ id: 't', function: { name: 'save_foods', arguments: '{"items":[{"name":"x","quantity":-1,"unit":"piece"}]}' } }] });
    await bridge.finish('assistant-ended-call');
    const day = await api.getDay(started.localDate);
    expect(day.items).toHaveLength(0);
    expect(day.calls.find((c) => c.vapiCallId === 'vapi-call-3')!.status).toBe('no_list');
  });
});


it('serves all nutrient totals and averages through the on-device API client', async () => {
  await newProfile('Range reports on device');
  const food = (await api.createFood({ displayName: 'Range vitamin food', baseUnit: 'serving', nutrients: { calories: 200, vitaminB12: 1.2, folate: 40, addedSugar: 0 } })).food;
  await api.addItems('2024-02-01', [{ name: food.displayName, quantity: 2, unit: 'serving' }]);
  await api.addItems('2024-02-29', [{ name: food.displayName, quantity: 1, unit: 'serving' }]);
  const report = await api.getRangeReport('2024-02-01', '2024-02-29');
  expect(report.nutrients).toHaveLength((await api.meta()).nutrients.length);
  expect(report.coverage).toMatchObject({ calendarDays: 29, loggedDays: 2, itemCount: 2 });
  expect(report.nutrients.find(n => n.nutrient === 'vitaminB12')).toMatchObject({ total: 3.6, meanPerLoggedDay: 1.8, missingItems: 0 });
  expect(report.nutrients.find(n => n.nutrient === 'addedSugar')?.total).toBe(0);
  expect(report.nutrients.find(n => n.nutrient === 'vitaminD')?.total).toBeNull();
});
