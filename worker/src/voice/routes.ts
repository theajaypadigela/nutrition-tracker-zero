import { badRequest, conflict, json, notFound, nowIso, readJson } from '../http';
import { callJson, loadIndex, type CallRow } from '../db/queries';
import { parseItemList, prepareItems } from '../domain/items';
import { localDateIn, localTimeIn } from '../domain/time';
import type { LoggedItem } from '../vapi/prompt';
import type { Ctx, Router } from '../router';
import { asObject, positiveInt, trimmedString } from '../validate';
import { voiceProvider } from './registry';
import { markConfirmedDay, saveConfirmedFoods } from './save';

async function ownCall(c: Ctx): Promise<CallRow> {
  const id = positiveInt(c.params.id, 'id');
  const row = await c.env.DB.prepare('SELECT * FROM calls WHERE id = ?1 AND user_id = ?2').bind(id, c.user!.id).first<CallRow>();
  if (!row) throw notFound('Call not found');
  if (!row.provider_call_id) throw conflict('legacy_call', 'This call uses the preserved provider lifecycle');
  return row;
}

export function registerVoiceRoutes(router: Router): void {
  router.add('GET', '/voice/config', 'user', c => {
    const provider = voiceProvider(c.env);
    return json({ provider: provider.id, configured: provider.configured(c.env, c.user!) });
  });
  // Also works for an on-device profile: it authenticates the installation without uploading local meals or health data.
  router.add('POST', '/voice/credentials', 'app', async c => {
    const provider = voiceProvider(c.env);
    if (!provider.credentials) throw conflict('voice_credentials_unavailable', 'This provider does not use temporary credentials');
    return json(await provider.credentials(c.env));
  });
  router.add('GET', '/voice/connect', 'app', async c => {
    const provider = voiceProvider(c.env);
    if (!provider.connect) throw conflict('voice_proxy_unavailable', 'This provider does not use a voice proxy');
    return provider.connect(c.req, c.env);
  });
  router.add('POST', '/voice/calls/start', 'user', async c => {
    const body = asObject(await readJson(c.req));
    const kind = body.kind ?? 'manual';
    if (!['scheduled', 'retry', 'test', 'manual'].includes(kind as string)) throw badRequest('Invalid call kind');
    const provider = voiceProvider(c.env);
    if (!provider.configured(c.env, c.user!)) throw conflict('voice_not_configured', `Configure ${provider.id} before starting a call`);
    const at = new Date();
    const localDate = localDateIn(c.user!.timezone, at);
    const logged = await c.env.DB.prepare('SELECT raw_name, quantity, unit, meal FROM log_items WHERE user_id = ?1 AND local_date = ?2 ORDER BY created_at, id')
      .bind(c.user!.id, localDate).all<LoggedItem>();
    const now = nowIso();
    const row = await c.env.DB.prepare(`INSERT INTO calls (user_id, local_date, kind, status, created_at, updated_at, voice_provider)
      VALUES (?1, ?2, ?3, 'queued', ?4, ?4, ?5) RETURNING id`)
      .bind(c.user!.id, localDate, kind, now, provider.id).first<{ id: number }>();
    try {
      const session = provider.prepare({ env: c.env, url: c.url, user: c.user!, callId: row!.id, localDate,
        localTime: localTimeIn(c.user!.timezone, at), alreadyLogged: logged.results });
      if (session.providerCallId) await c.env.DB.prepare('UPDATE calls SET provider_call_id = ?2 WHERE id = ?1').bind(row!.id, session.providerCallId).run();
      return json({ callId: row!.id, localDate, provider: provider.id, ...session }, 201);
    } catch (e) {
      await c.env.DB.prepare("UPDATE calls SET status = 'failed', error = 'Provider configuration failed' WHERE id = ?1").bind(row!.id).run();
      throw e;
    }
  });
  router.add('POST', '/voice/calls/:id/started', 'user', async c => {
    const call = await ownCall(c);
    await c.env.DB.prepare("UPDATE calls SET status = CASE status WHEN 'queued' THEN 'called' ELSE status END, updated_at = ?2 WHERE id = ?1")
      .bind(call.id, nowIso()).run();
    return json({ ok: true });
  });
  router.add('POST', '/voice/calls/:id/tools', 'user', async c => {
    const call = await ownCall(c);
    if (call.ended_reason) throw conflict('call_ended', 'This call has already ended');
    const body = asObject(await readJson(c.req));
    const id = trimmedString(body.id, 'id', 1, 200);
    if (body.name !== 'save_foods' && body.name !== 'mark_day_complete') return json({ error: 'Unknown function' });
    const processed = JSON.parse(call.processed_tool_call_ids) as { id: string; n: number }[];
    const prior = processed.find(p => p.id === id);
    if (prior) return json({ result: body.name === 'mark_day_complete' ? 'Day marked complete' : `Saved ${prior.n} items` });
    let args = body.arguments;
    if (typeof args === 'string') { try { args = JSON.parse(args); } catch { return json({ error: 'Invalid function arguments. Correct the list and retry.' }); } }
    if (body.name === 'mark_day_complete') {
      if (asObject(args).confirmed !== true) return json({ error: 'Ask whether to mark the day complete and wait for an explicit yes before retrying.' });
      return json({ result: await markConfirmedDay(c.env.DB, c.user!.id, call, id) });
    }
    const parsed = parseItemList(asObject(args).items);
    if ('error' in parsed) return json({ error: `${parsed.error} Correct the list and retry save_foods.` });
    const items = prepareItems(await loadIndex(c.env.DB), parsed.items);
    return json({ result: await saveConfirmedFoods(c.env.DB, c.user!.id, call, id, items) });
  });
  router.add('POST', '/voice/calls/:id/ended', 'user', async c => {
    const call = await ownCall(c);
    if (call.ended_reason) return json({ call: callJson(call) });
    const body = asObject(await readJson(c.req));
    const reason = trimmedString(body.reason, 'reason', 1, 100);
    if (!['customer-ended-call', 'assistant-ended-call', 'pipeline-error', 'max-duration'].includes(reason)) throw badRequest('Invalid end reason');
    const transcript = typeof body.transcript === 'string' ? body.transcript.slice(0, 100000) : null;
    const duration = typeof body.durationSeconds === 'number' && Number.isFinite(body.durationSeconds)
      ? Math.min(86400, Math.max(0, Math.round(body.durationSeconds))) : null;
    const row = await c.env.DB.prepare(`UPDATE calls SET status = CASE WHEN status = 'tool_saved' THEN status
      WHEN status = 'failed' OR ?2 = 'pipeline-error' THEN 'failed' ELSE 'no_list' END,
      ended_reason = ?2, transcript = ?3, duration_seconds = ?4, updated_at = ?5 WHERE id = ?1 AND ended_reason IS NULL RETURNING *`)
      .bind(call.id, reason, transcript, duration, nowIso()).first<CallRow>();
    return json({ call: callJson(row ?? call) });
  });
}
