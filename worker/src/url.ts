/**
 * `new URL(...)`, behind a seam. A deployed Worker never changes it. The app runs this same code under Hermes (app/src/embedded),
 * whose built-in `URL` throws on `pathname` and `searchParams`, so the app swaps in a small parser for the one shape of address it
 * builds itself.
 */
let make = (raw: string): URL => new URL(raw);

export const parseUrl = (raw: string): URL => make(raw);

export function setUrlFactory(factory: (raw: string) => URL): void {
  make = factory;
}
