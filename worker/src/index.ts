import { requireAppToken } from './auth';
import { HttpError, errorResponse } from './http';
import { getUser } from './db/queries';
import { Router, type Ctx } from './router';
import { registerCalls } from './routes/calls';
import { registerDays } from './routes/days';
import { registerFoods } from './routes/foods';
import { registerItems } from './routes/items';
import { registerMaintenance } from './routes/maintenance';
import { registerMeta } from './routes/meta';
import { registerProfiles } from './routes/profiles';
import { registerSettings } from './routes/settings';
import { registerUncached } from './routes/uncached';

const router = new Router();
registerMeta(router);
registerProfiles(router);
registerSettings(router);
registerCalls(router);
registerDays(router);
registerItems(router);
registerFoods(router);
registerUncached(router);
registerMaintenance(router);

async function handle(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const match = router.match(req.method, url.pathname);
  if (match === null) throw new HttpError(404, 'not_found', 'No such route');
  if (match === 'method') throw new HttpError(405, 'method_not_allowed', 'Method not allowed');

  const ctx: Ctx = { req, env, url, params: match.params, user: null };
  const { auth } = match.route;
  if (auth !== 'none') {
    await requireAppToken(req, env);
    const userId = req.headers.get('x-user-id');
    if (auth === 'user' && !userId) throw new HttpError(400, 'user_required', 'X-User-Id header is required');
    if (userId) {
      ctx.user = await getUser(env.DB, userId);
      // Optional on shared routes (used only for added_by); required and must exist on user routes.
      if (!ctx.user && auth === 'user') throw new HttpError(404, 'unknown_user', 'Profile not found');
    }
  }
  return match.route.handler(ctx);
}

export default {
  async fetch(req, env): Promise<Response> {
    try {
      return await handle(req, env);
    } catch (err) {
      if (err instanceof HttpError) return errorResponse(err);
      console.error(JSON.stringify({ evt: 'error', path: new URL(req.url).pathname.replace(/\/vapi\/webhook\/[^/]+/, '/vapi/webhook/:token'), name: err instanceof Error ? err.name : 'unknown', message: err instanceof Error ? err.message.slice(0, 200) : '' }));
      return errorResponse(new HttpError(500, 'internal', 'Something went wrong'));
    }
  },
} satisfies ExportedHandler<Env>;
