import { readFileSync } from 'fs';
import { join } from 'path';
import { darkPalette, lightPalette, type Palette } from '@/theme/palette';

/** WCAG 2.x relative luminance and contrast ratio. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

type Role = keyof Palette;
const SURFACES: Role[] = ['bg', 'surface', 'surfaceMuted'];

describe.each([
  ['light', lightPalette],
  ['dark', darkPalette],
])('%s palette contrast', (_name, p) => {
  it.each(SURFACES.flatMap(surface => (['text', 'textSecondary', 'textMuted'] as Role[]).map(role => [role, surface] as const)))(
    '%s is readable (4.5:1) on %s',
    (role, surface) => {
      expect(contrast(p[role], p[surface])).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each([
    ['primary', 'surface'],
    ['primary', 'bg'],
    ['primary', 'primarySoft'],
    ['onPrimary', 'primary'],
    ['dangerText', 'dangerSoft'],
    ['dangerText', 'surface'],
    ['dangerText', 'bg'],
    ['onDanger', 'danger'],
    ['warningText', 'warningSoft'],
    ['warningText', 'surface'],
  ] as [Role, Role][])('%s is readable (4.5:1) on %s', (fg, bg) => {
    expect(contrast(p[fg], p[bg])).toBeGreaterThanOrEqual(4.5);
  });

  it('field outlines are 3:1 against the surfaces fields sit on', () => {
    expect(contrast(p.inputBorder, p.surface)).toBeGreaterThanOrEqual(3);
    expect(contrast(p.inputBorder, p.bg)).toBeGreaterThanOrEqual(3);
  });

  it('faint text (disabled labels, chevrons) is 3:1 on cards and on muted fills', () => {
    expect(contrast(p.textFaint, p.surface)).toBeGreaterThanOrEqual(3);
    expect(contrast(p.textFaint, p.surfaceMuted)).toBeGreaterThanOrEqual(3);
  });
});

/** Reads `<color name="x">#RRGGBB</color>` (or #AARRGGBB) values out of an Android colours file. */
function readColors(relativePath: string): Record<string, string> {
  const xml = readFileSync(join(__dirname, '..', relativePath), 'utf8');
  return Object.fromEntries([...xml.matchAll(/<color name="([a-z_]+)">(#[0-9A-Fa-f]{6,8})<\/color>/g)].map(m => [m[1]!, m[2]!.toUpperCase()]));
}

/**
 * The native incoming-call screen and the pre-JS window colours are drawn by Android, not React
 * Native, so they cannot read palette.ts. Each native colour is a palette role under another name;
 * this fails if either file drifts.
 */
describe.each([
  ['light', 'android/app/src/main/res/values/colors.xml', lightPalette],
  ['dark', 'android/app/src/main/res/values-night/colors.xml', darkPalette],
] as const)('native %s colours match the palette', (_name, file, p) => {
  const native = readColors(file);
  const expected: Record<string, string> = {
    app_background: p.bg,
    app_accent: p.primary,
    call_background: p.bg,
    call_surface: p.surface,
    call_avatar: p.primarySoft,
    call_border: p.border,
    call_text_primary: p.text,
    call_text_secondary: p.textSecondary,
    call_text_muted: p.textMuted,
    call_brand: p.primary,
    // The brand colour at 20% alpha, in Android's #AARRGGBB order.
    call_brand_ring: `#33${p.primary.slice(1)}`,
    call_accept: p.primary,
    call_on_accept: p.onPrimary,
    call_decline: p.danger,
    call_on_decline: p.onDanger,
  };

  it.each(Object.entries(expected))('%s', (name, hex) => {
    expect([name, native[name]]).toEqual([name, hex.toUpperCase()]);
  });

  it('keeps the call buttons legible', () => {
    expect(contrast(p.onPrimary, p.primary)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(p.onDanger, p.danger)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(p.text, p.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(p.textMuted, p.bg)).toBeGreaterThanOrEqual(4.5);
  });
});
