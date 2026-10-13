import type { UserRow } from './db/queries';

/**
 * `none`: open. `app`: the shared app token. `user`: plus an existing X-User-Id. `secret`: plus the profile's own
 * secret, for health data (WEEKLY_BREAKDOWN_PLAN.md 8.3.2): the shared token alone is not enough.
 */
export type Auth = 'none' | 'app' | 'user' | 'secret';

export interface Ctx {
  req: Request;
  env: Env;
  url: URL;
  params: Record<string, string>;
  /** Set for `user` and `secret` routes (X-User-Id resolved), optionally for `app` routes when the header is present. */
  user: UserRow | null;
  /** The request carried this profile's valid secret. Always true on `secret` routes; computed, never required, on `user` routes. */
  unlocked: boolean;
}

export type Handler = (ctx: Ctx) => Promise<Response> | Response;

interface Route {
  method: string;
  segments: string[];
  auth: Auth;
  handler: Handler;
}

export interface Match {
  route: Route;
  params: Record<string, string>;
}

/** Minimal path router: literal segments and `:param` segments, no wildcards. */
export class Router {
  private routes: Route[] = [];

  add(method: string, path: string, auth: Auth, handler: Handler): this {
    this.routes.push({ method, segments: split(path), auth, handler });
    return this;
  }

  /** Returns the match, or `'method'` when the path exists under another method, or null. */
  match(method: string, pathname: string): Match | 'method' | null {
    const parts = split(pathname);
    let pathMatched = false;
    for (const route of this.routes) {
      const params = matchSegments(route.segments, parts);
      if (!params) continue;
      if (route.method !== method) {
        pathMatched = true;
        continue;
      }
      return { route, params };
    }
    return pathMatched ? 'method' : null;
  }
}

function split(path: string): string[] {
  return path.split('/').filter(Boolean);
}

function matchSegments(pattern: string[], parts: string[]): Record<string, string> | null {
  if (pattern.length !== parts.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < pattern.length; i++) {
    const p = pattern[i]!;
    const v = parts[i]!;
    if (p.startsWith(':')) {
      try {
        params[p.slice(1)] = decodeURIComponent(v);
      } catch {
        return null;
      }
    } else if (p !== v) {
      return null;
    }
  }
  return params;
}
