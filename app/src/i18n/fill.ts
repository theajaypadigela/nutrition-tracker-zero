import { formatNumber } from '@/utils/format';

export type FillParams = Record<string, string | number | null | undefined>;

const NUMERIC = /^-?\d+(\.\d+)?$/;

/** A number the way the report prints it: thousands separators, one decimal at most, none from 100 up. */
export function printNumber(value: number): string {
  if (!Number.isFinite(value)) return '';
  return Number.isInteger(value) || Math.abs(value) >= 100 ? formatNumber(value) : formatNumber(value, 1);
}

/** A change with its sign, as a person reads it: "+0.5", "−1.2" (a true minus sign), and nothing for zero. A string, so `fill` leaves it alone. */
export function signedNumber(value: number): string {
  if (!Number.isFinite(value) || value === 0) return '0';
  return `${value > 0 ? '+' : '\u2212'}${printNumber(Math.abs(value))}`;
}

/**
 * Fills the `{name}` holes of a string from the strings table. Numbers (and strings that are only a number, as the
 * Worker sends some) are printed with `printNumber`; a hole with no value is left empty, never "undefined".
 */
export function fill(template: string, params: FillParams = {}): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const v = params[key];
    if (v === undefined || v === null) return '';
    if (typeof v === 'number') return printNumber(v);
    return NUMERIC.test(v) ? printNumber(Number(v)) : v;
  });
}
