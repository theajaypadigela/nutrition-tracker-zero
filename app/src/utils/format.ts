export function formatNumber(value: number, digits = 0): string {
  const f = 10 ** digits;
  const rounded = Math.round(value * f) / f;
  return rounded.toLocaleString('en-US', { maximumFractionDigits: digits });
}

/** 4 · 0.4 · 16 · 180: one decimal at most below 100, none from 100 up. */
export function formatAmount(value: number): string {
  if (value >= 100) return value.toFixed(0);
  return String(Math.round(value * 10) / 10);
}

export function formatQuantity(quantity: number, unit: string): string {
  const q = Number.isInteger(quantity) ? String(quantity) : String(Math.round(quantity * 100) / 100);
  return `${q} ${unit}`;
}

export function capitalize(s: string): string {
  return s ? s[0]!.toUpperCase() + s.slice(1) : s;
}

/** Up to two initials for an avatar ("Asha Rao" → "AR"). */
export function initialsOf(name: string | null | undefined): string {
  const trimmed = name?.trim();
  if (!trimmed) return '';
  return trimmed
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() ?? '')
    .join('');
}
