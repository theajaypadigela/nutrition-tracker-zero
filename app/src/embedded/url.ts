/**
 * The few URL members the Worker reads (`pathname`, `origin`, `searchParams.get`), for the addresses the app builds itself
 * (`http://on-device/path?a=b`). Hermes's own `URL` throws on all of them. Not a general parser: it refuses anything else.
 */
class Params {
  private readonly pairs: [string, string][] = [];

  constructor(query: string) {
    for (const part of query.split('&')) {
      if (!part) continue;
      const eq = part.indexOf('=');
      const raw = eq === -1 ? [part, ''] : [part.slice(0, eq), part.slice(eq + 1)];
      this.pairs.push([decode(raw[0]!), decode(raw[1]!)]);
    }
  }

  get(name: string): string | null {
    return this.pairs.find(([k]) => k === name)?.[1] ?? null;
  }

  getAll(name: string): string[] {
    return this.pairs.filter(([k]) => k === name).map(([, v]) => v);
  }

  has(name: string): boolean {
    return this.pairs.some(([k]) => k === name);
  }
}

const decode = (s: string) => decodeURIComponent(s.replace(/\+/g, ' '));

export class OnDeviceUrl {
  readonly origin: string;
  readonly pathname: string;
  readonly search: string;
  readonly searchParams: Params;

  constructor(raw: string) {
    const m = /^(https?:\/\/[^/?#]+)([^?#]*)(\?[^#]*)?(#.*)?$/i.exec(raw);
    if (!m) throw new TypeError(`Invalid URL: ${raw.slice(0, 40)}`);
    this.origin = m[1]!;
    this.pathname = m[2] || '/';
    this.search = m[3] && m[3] !== '?' ? m[3] : '';
    this.searchParams = new Params(this.search.slice(1));
  }
}
