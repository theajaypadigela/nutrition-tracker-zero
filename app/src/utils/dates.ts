/** 'YYYY-MM-DD' for an instant in an IANA zone (Hermes ships Intl with time zones). */
export function localDateIn(tz: string, at: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function formatDay(date: string, today: string): string {
  if (date === today) return 'Today';
  if (date === addDays(today, -1)) return 'Yesterday';
  const d = new Date(`${date}T12:00:00Z`);
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(d);
}

/**
 * The title and subtitle of a day's screen: "Today" / "Sunday, October 11", "Yesterday" /
 * "Saturday, October 10", or "Wednesday" / "October 7" for anything older.
 */
export function dayHeading(date: string, today: string): { title: string; subtitle: string } {
  const at = new Date(`${date}T12:00:00Z`);
  const part = (opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('en-US', { ...opts, timeZone: 'UTC' }).format(at);
  const monthDay = part({ month: 'long', day: 'numeric' });
  const sameYear = date.slice(0, 4) === today.slice(0, 4);
  if (date === today || date === addDays(today, -1)) {
    return { title: date === today ? 'Today' : 'Yesterday', subtitle: `${part({ weekday: 'long' })}, ${monthDay}` };
  }
  return { title: part({ weekday: 'long' }), subtitle: sameYear ? monthDay : `${monthDay}, ${date.slice(0, 4)}` };
}

/** 'YYYY-MM' of a 'YYYY-MM-DD' date. */
export function monthOf(date: string): string {
  return date.slice(0, 7);
}

/** The month `n` months after `month` (before, if `n` is negative), both as 'YYYY-MM'. */
export function addMonths(month: string, n: number): string {
  const [year, mon] = month.split('-').map(Number);
  const index = year! * 12 + (mon! - 1) + n;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

/** "October 2026" */
export function monthLabel(month: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${month}-15T12:00:00Z`),
  );
}

/** The first and last date of a month. */
export function monthBounds(month: string): { from: string; to: string } {
  return { from: `${month}-01`, to: addDays(`${addMonths(month, 1)}-01`, -1) };
}

/**
 * A month laid out as Monday-first weeks (the app's weeks start on Monday). `null` pads the cells
 * that belong to the neighbouring months, so every row has seven entries.
 */
export function monthWeeks(month: string): (string | null)[][] {
  const { from, to } = monthBounds(month);
  const lead = (new Date(`${from}T12:00:00Z`).getUTCDay() + 6) % 7;
  const length = Number(to.slice(8));
  const cells: (string | null)[] = [...Array<null>(lead).fill(null), ...Array.from({ length }, (_, i) => addDays(from, i))];
  while (cells.length % 7 !== 0) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
}

/** "Wednesday, October 7" */
export function fullDayLabel(date: string): string {
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${date}T12:00:00Z`),
  );
}

/** Monday of the week containing `date`. */
export function weekStart(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  const offset = (d.getUTCDay() + 6) % 7;
  return addDays(date, -offset);
}

export function formatClock(hhmm: string | null): string {
  if (!hhmm) return 'Not set';
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h! >= 12 ? 'PM' : 'AM';
  const hour = h! % 12 === 0 ? 12 : h! % 12;
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
}
