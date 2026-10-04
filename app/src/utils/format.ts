export function formatNumber(value: number, digits = 0): string {
  const f = 10 ** digits;
  const rounded = Math.round(value * f) / f;
  return rounded.toLocaleString('en-US', { maximumFractionDigits: digits });
}

export function formatQuantity(quantity: number, unit: string): string {
  const q = Number.isInteger(quantity) ? String(quantity) : String(Math.round(quantity * 100) / 100);
  return `${q} ${unit}`;
}

export function capitalize(s: string): string {
  return s ? s[0]!.toUpperCase() + s.slice(1) : s;
}
