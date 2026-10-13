import { hasProfileSecret, requireAppToken, requireProfileSecret } from './auth';
import { HttpError, errorResponse, logSafe } from './http';
import { getUser } from './db/queries';
import { purgeOldTranscripts } from './maintenance';
import { Router, type Ctx } from './router';
import { parseUrl } from './url';
import { registerAuth } from './routes/auth';
import { registerCalls } from './routes/calls';
import { registerDays } from './routes/days';
import { registerFoods } from './routes/foods';
import { registerItems } from './routes/items';
import { registerMaintenance } from './routes/maintenance';
import { registerMeta } from './routes/meta';
import { registerProfile } from './routes/profile';
import { registerReports } from './routes/reports';
import { registerProfiles } from './routes/profiles';
import { registerSettings } from './routes/settings';
import { registerUncached } from './routes/uncached';

const router = new Router();
registerMeta(router);
registerAuth(router);
registerProfiles(router);
registerProfile(router);
registerReports(router);
registerSettings(router);
registerCalls(router);
registerDays(router);
registerItems(router);
registerFoods(router);
registerUncached(router);
registerMaintenance(router);

async function handle(req: Request, env: Env): Promise<Response> {
  const url = parseUrl(req.url);
  const match = router.match(req.method, url.pathname);
  if (match === null) throw new HttpError(404, 'not_found', 'No such route');
  if (match === 'method') throw new HttpError(405, 'method_not_allowed', 'Method not allowed');

  const ctx: Ctx = { req, env, url, params: match.params, user: null, unlocked: false };
  const { auth } = match.route;
  if (auth !== 'none') {
    await requireAppToken(req, env);
    const userId = req.headers.get('x-user-id');
    const needsUser = auth === 'user' || auth === 'secret';
    if (needsUser && !userId) throw new HttpError(400, 'user_required', 'X-User-Id header is required');
    if (userId) {
      ctx.user = await getUser(env.DB, userId);
      // Optional on shared routes (used only for added_by); required and must exist on user routes.
      if (!ctx.user && needsUser) throw new HttpError(404, 'unknown_user', 'Profile not found');
    }
    if (ctx.user && auth === 'secret') {
      await requireProfileSecret(req, ctx.user.secret_hash);
      ctx.unlocked = true;
    } else if (ctx.user && auth === 'user') {
      // Hardening (plan 8.3.2, Phase 6), off until the deployment says every friend has updated and claimed a secret: then every
      // profile route needs the profile's secret, not only the health ones. A profile still without one is locked rather than left
      // open, and can no longer claim one (the claim needs this check too): anyone holding the shared token could otherwise claim it
      // first. The owner of the deployment issues it a code instead (docs/BREACH_RUNBOOK.md).
      if ((env.REQUIRE_SECRET as string) === '1') {
        await requireProfileSecret(req, ctx.user.secret_hash);
        ctx.unlocked = true;
      } else ctx.unlocked = await hasProfileSecret(req, ctx.user.secret_hash);
    }
  }
  return match.route.handler(ctx);
}

export default {
  /** The daily run (wrangler.jsonc triggers): transcripts are emptied after 30 days (plan 8.3.3). */
  async scheduled(_event, env, ctx): Promise<void> {
    ctx.waitUntil(
      purgeOldTranscripts(env.DB).then(
        (emptied) => console.log(JSON.stringify({ evt: 'purge', transcripts: emptied })),
        (err) => console.error(JSON.stringify({ evt: 'error', path: 'scheduled/purge', message: err instanceof Error ? logSafe(err.message) : '' })),
      ),
    );
  },
  async fetch(req, env): Promise<Response> {
    try {
      return await handle(req, env);
    } catch (err) {
      if (err instanceof HttpError) return errorResponse(err);
      console.error(JSON.stringify({ evt: 'error', path: parseUrl(req.url).pathname.replace(/\/vapi\/webhook\/[^/]+/, '/vapi/webhook/:token'), name: err instanceof Error ? err.name : 'unknown', message: err instanceof Error ? logSafe(err.message) : '' }));
      return errorResponse(new HttpError(500, 'internal', 'Something went wrong'));
    }
  },
} satisfies ExportedHandler<Env>;
