/**
 * Wall-clock ↔ epoch conversion in an IANA zone (ported from the old app's reminder time
 * module; DST-safe two-pass offset correction). Pure: no RN or Notifee imports.
 */

type ZonedParts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

const FORMATTERS = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let fmt = FORMATTERS.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    FORMATTERS.set(timeZone, fmt);
  }
  return fmt;
}

export function epochToZonedParts(epochMs: number, timeZone: string): ZonedParts {
  const lookup: Record<string, string> = {};
  for (const p of formatter(timeZone).formatToParts(new Date(epochMs))) {
    if (p.type !== 'literal') lookup[p.type] = p.value;
  }
  const hour = Number(lookup.hour);
  return {
    year: Number(lookup.year),
    month: Number(lookup.month),
    day: Number(lookup.day),
    hour: hour === 24 ? 0 : hour,
    minute: Number(lookup.minute),
    second: Number(lookup.second),
  };
}

function offsetMs(epochMs: number, timeZone: string): number {
  const p = epochToZonedParts(epochMs, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(epochMs / 1000) * 1000;
}

export function zonedWallTimeToEpoch(
  wall: { year: number; month: number; day: number; hour: number; minute: number },
  timeZone: string,
): number {
  const guess = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, 0);
  const o0 = offsetMs(guess, timeZone);
  const t1 = guess - o0;
  const o1 = offsetMs(t1, timeZone);
  if (o1 === o0) return t1;
  const t2 = guess - o1;
  return offsetMs(t2, timeZone) === o1 ? t2 : t1;
}

export function parseCallTime(hhmm: string | null | undefined): { hour: number; minute: number } | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm ?? '');
  return m ? { hour: Number(m[1]), minute: Number(m[2]) } : null;
}

/** Next epoch strictly after `fromEpoch` at which the daily call time occurs in `timeZone`. */
export function nextDailyOccurrence(
  time: { hour: number; minute: number },
  fromEpoch: number,
  timeZone: string,
): number {
  const base = epochToZonedParts(fromEpoch, timeZone);
  for (let offset = 0; offset <= 2; offset++) {
    const day = new Date(Date.UTC(base.year, base.month - 1, base.day) + offset * 86_400_000);
    const epoch = zonedWallTimeToEpoch(
      { year: day.getUTCFullYear(), month: day.getUTCMonth() + 1, day: day.getUTCDate(), ...time },
      timeZone,
    );
    if (epoch > fromEpoch) return epoch;
  }
  // Unreachable for valid zones; fall back to 24h later.
  return fromEpoch + 86_400_000;
}
