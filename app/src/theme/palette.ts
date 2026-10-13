/**
 * The app's colours: one neutral scale, one accent, three status tones.
 *
 * Colour carries meaning here and nothing else. Surfaces are neutral; the single green accent
 * marks the primary action, the active tab and "on track"; amber means "watch it" and red means
 * "problem". Categories (protein vs carbs…) are told apart by label, not by hue.
 *
 * Contrast, measured with the WCAG 2.x formula and enforced by `__tests__/palette.test.ts`: every
 * text role is at least 4.5:1 on every surface it is drawn on, `inputBorder` is at least 3:1 on the
 * surfaces fields sit on, and `textFaint` (chevrons, disabled labels) is at least 3:1.
 */

export interface Palette {
  /** Page background behind the cards. */
  bg: string;
  /** Cards, sheets, inputs. */
  surface: string;
  /** Wells inside a surface: input fill, progress tracks, segmented-control track. */
  surfaceMuted: string;
  /** Hairline dividers and card outlines. */
  border: string;
  /** Outlines of secondary buttons and chips: the label identifies them, the outline only frames them. */
  borderStrong: string;
  /** The outline of a text field: the only thing that marks where it ends, so it is 3:1 against its surface. */
  inputBorder: string;

  text: string;
  textSecondary: string;
  textMuted: string;
  textFaint: string;

  primary: string;
  primaryPressed: string;
  /** Tint behind selected chips, avatars and positive badges. */
  primarySoft: string;
  onPrimary: string;

  danger: string;
  dangerPressed: string;
  dangerSoft: string;
  /** Danger as text: meets 4.5:1 on its soft tint. */
  dangerText: string;
  onDanger: string;

  warning: string;
  warningSoft: string;
  warningText: string;

  /** Modal backdrop. */
  scrim: string;
  /** Press feedback on rows and tabs (the Android ripple). */
  ripple: string;
  /** The knob of a switch: white in both themes. */
  thumb: string;
  /** The shadow under the one floating button. */
  shadow: string;
}

export const lightPalette: Palette = {
  bg: '#F6F6F3',
  surface: '#FFFFFF',
  surfaceMuted: '#F0F0EC',
  border: '#E5E5DF',
  borderStrong: '#CFCFC7',
  inputBorder: '#8F8F89',

  text: '#161615',
  textSecondary: '#45453F',
  textMuted: '#6D6D67',
  textFaint: '#8A8A84',

  primary: '#17734B',
  primaryPressed: '#0F5C3B',
  primarySoft: '#E5F1EA',
  onPrimary: '#FFFFFF',

  danger: '#C6362C',
  dangerPressed: '#A82B22',
  dangerSoft: '#FBEBE9',
  dangerText: '#B42E25',
  onDanger: '#FFFFFF',

  warning: '#D9962B',
  warningSoft: '#FBF1DD',
  warningText: '#8F5A0B',

  scrim: 'rgba(12,14,12,0.48)',
  ripple: 'rgba(23,115,75,0.10)',
  thumb: '#FFFFFF',
  shadow: '#000000',
};

export const darkPalette: Palette = {
  bg: '#0D0E0D',
  surface: '#161817',
  surfaceMuted: '#1F2221',
  border: '#2B2F2D',
  borderStrong: '#3A3F3C',
  inputBorder: '#646460',

  text: '#F1F2EE',
  textSecondary: '#B7BAB3',
  textMuted: '#868A83',
  textFaint: '#6C6C68',

  primary: '#4CBF8A',
  primaryPressed: '#3AA676',
  primarySoft: '#14261D',
  onPrimary: '#06140D',

  danger: '#F0776E',
  dangerPressed: '#D9645B',
  dangerSoft: '#2D1715',
  dangerText: '#F0776E',
  onDanger: '#1C0907',

  warning: '#D9962B',
  warningSoft: '#2B2112',
  warningText: '#E3B25F',

  scrim: 'rgba(0,0,0,0.62)',
  ripple: 'rgba(76,191,138,0.16)',
  thumb: '#FFFFFF',
  shadow: '#000000',
};
