/**
 * The app's design tokens — one scale, namespaced per surface.
 *
 * `tokens` is the only export. Reach a colour as `tokens.<surface>.<role>` and you
 * are one hop from its hex value. Before this, the same colour was reachable three
 * ways — `brandGreen.base`, `authTheme.T.green`, and a literal — because each
 * surface re-exported this module under its own names. Those views are gone; the
 * per-surface modules now keep only what is genuinely theirs (radii, fonts,
 * gradient stops, status logic).
 *
 * The raw palettes below stay separate and private, because the surfaces
 * intentionally use different shades of the "same" hue (brand green #0f7a3d vs
 * report green #0e9b6d, etc.). **Do not merge them.**
 */

/** Neutrals shared across the light (auth + report) surfaces. */
const neutral = {
  white: '#ffffff',
} as const;

/** Auth/onboarding brand green scale (Nourish `AUTH_TOKENS`). */
const brandGreen = {
  base: '#0f7a3d',
  mid: '#1b9750',
  deep: '#0a4d27',
  dark: '#06351b',
  soft: '#e6f4ec',
  soft2: '#d6ecdf',
} as const;

/** Auth/onboarding surface neutrals (warm green-tinted grays). */
const authNeutral = {
  ink: '#0d1f16',
  inkSoft: '#48584f',
  inkMuted: '#8a988f',
  line: '#e3eae5',
  lineSoft: '#eef3f0',
  field: '#f5f8f6',
  bg: '#eaf0ec',
} as const;

/** Auth/onboarding status + feedback colors. */
const authStatus = {
  danger: '#d24b4b',
  dangerSoft: '#fcecec',
  warn: '#cf8a1a',
  warnSoft: '#fbf1dd',
  ok: '#0f9b54',
  /** Empty password-strength meter track. */
  strengthEmpty: '#cdd6d0',
} as const;

/** Weekly nutrition report accent blue. */
const reportBlue = {
  base: '#1769d6',
  soft: '#e7f0fc',
  deep: '#0a3a82',
} as const;

/** Weekly nutrition report health/"good" green — distinct from `brandGreen`. */
const reportGreen = {
  base: '#0e9b6d',
  deep: '#06624a',
  soft: '#dff5ec',
} as const;

/** Weekly nutrition report surface neutrals (cool blue-tinted grays). */
const reportNeutral = {
  ink: '#0c1b22',
  inkSoft: '#4a5d68',
  inkMuted: '#7a8a93',
  bg: '#f4f8fa',
  line: '#e3ebef',
  lineSoft: '#eef2f5',
} as const;

/** Weekly nutrition report status colors (warn/bad; "good" is `reportGreen`). */
const reportStatus = {
  warn: '#d98a16',
  warnSoft: '#fbf0db',
  bad: '#dc3545',
  badSoft: '#fbe5e7',
} as const;

/** Weekly report header gradient (deep blues). */
const reportHeaderGradient = ['#0d4ea8', '#0a3a82', '#062a63'] as const;

/** Macro chart accents (daily nutrition report cards). */
const macroAccent = {
  protein: '#3b82f6',
  carbs: '#f59e0b',
  fats: '#a855f7',
} as const;

/** Micro-nutrient card accents: icon / icon surface / deep text per nutrient. */
const microAccent = {
  sugar: '#f43f5e',
  sugarSurface: '#ffe4e6',
  sugarDeep: '#be123c',
  fiber: '#10b981',
  fiberSurface: '#dcfce7',
  fiberDeep: '#15803d',
  sodium: '#f97316',
  sodiumSurface: '#ffedd5',
  sodiumDeep: '#c2410c',
  statusGoodSurface: '#dcfce7',
  statusGoodText: '#15803d',
  statusWarnSurface: '#fef3c7',
  statusWarnText: '#b45309',
} as const;

/** Dark, continuous call-experience palette (see callTheme.ts for rationale). */
const callPalette = {
  // Surfaces (darkest → most elevated)
  background: '#0A0A0A',
  surface: '#111111',
  surfaceElevated: '#1A1A1A',
  surfaceAvatar: '#1E1E2E',
  border: '#222222',

  // Text
  textPrimary: '#F3F3F3',
  textSecondary: '#C9C9C9',
  textMuted: '#8B8B92',
  textFaint: '#555555',

  // Brand / AI accent (the avatar glyph + active-state accents)
  brand: '#7F77DD',
  brandSoft: '#2A2740',

  // Call actions
  accept: '#1D9E75',
  acceptSurface: '#0A2A1A',
  decline: '#E24B4A',
  declineSurface: '#2A0A0A',
  presence: '#1D9E75',

  // Status / feedback
  warning: '#D9A441',
  warningSurface: '#2A210A',

  // Transcript bubbles
  bubbleAssistant: '#1A1A1A',
  bubbleAssistantBorder: '#262626',
  bubbleUser: '#3A348F',
  bubbleUserBorder: '#4B45A8',
  onBubbleAssistant: '#ECECEC',
  onBubbleUser: '#FFFFFF',

  onAccent: '#FFFFFF',
  shadow: '#000000',
} as const;

/**
 * The Tailwind steps the app actually uses. Private: reach them through a semantic
 * name below. They exist as a layer because several *different* surface decisions
 * legitimately land on the same step — amber-600 tints the habit clock glyph, the
 * daily-report insight icon, and the "High" nutrient flag — and each of those wants
 * its own name without the hex being written three times.
 */
const tw = {
  emerald500: '#10b981',
  emerald600: '#059669',
  emerald700: '#047857',
  emerald800: '#065f46',
  teal700: '#0f766e',
  green400: '#4ade80',
  green500: '#22c55e',
  green600: '#16a34a',
  green50: '#f0fdf4',
  blue500: '#3b82f6',
  sky600: '#0284c7',
  violet600: '#7c3aed',
  amber400: '#fbbf24',
  amber600: '#d97706',
  amber50: '#fffbeb',
  yellow500: '#eab308',
  red400: '#f87171',
  red500: '#ef4444',
  red600: '#dc2626',
  red50: '#fef2f2',
  slate400: '#94a3b8',
  slate500: '#64748b',
  slate900: '#0f172a',
  slate100: '#f1f5f9',
  gray300: '#d1d5db',
  gray200: '#e5e7eb',
  gray400: '#9ca3af',
  gray500: '#6b7280',
  gray800: '#1f2937',
  gray900: '#111827',
  gray50: '#f9fafb',
} as const;

/**
 * The public scale. Member names are the ones each surface already used, so a
 * reader moving from `T.greenSoft` to `tokens.auth.greenSoft` sees the same word.
 */
export const tokens = {
  /** Auth + onboarding screens (light, warm green-tinted). */
  auth: {
    ink: authNeutral.ink,
    inkSoft: authNeutral.inkSoft,
    inkMuted: authNeutral.inkMuted,
    line: authNeutral.line,
    lineSoft: authNeutral.lineSoft,
    field: authNeutral.field,
    surface: neutral.white,
    bg: authNeutral.bg,
    green: brandGreen.base,
    greenMid: brandGreen.mid,
    greenDeep: brandGreen.deep,
    greenDark: brandGreen.dark,
    greenSoft: brandGreen.soft,
    greenSoft2: brandGreen.soft2,
    danger: authStatus.danger,
    dangerSoft: authStatus.dangerSoft,
    warn: authStatus.warn,
    warnSoft: authStatus.warnSoft,
    ok: authStatus.ok,
    strengthEmpty: authStatus.strengthEmpty,
    white: neutral.white,
    /** Card/sheet shadow on the auth + onboarding surfaces. */
    shadow: '#08140e',
    /** Flat fill the primary button gradient collapses to when disabled. */
    buttonDisabled: '#b4c5ba',
  },

  /** Weekly nutrition report (light, cool blue-tinted). */
  report: {
    ink: reportNeutral.ink,
    inkSoft: reportNeutral.inkSoft,
    inkMuted: reportNeutral.inkMuted,
    surface: neutral.white,
    bg: reportNeutral.bg,
    line: reportNeutral.line,
    lineSoft: reportNeutral.lineSoft,
    primary: reportBlue.base,
    primarySoft: reportBlue.soft,
    primaryDeep: reportBlue.deep,
    green: reportGreen.base,
    greenDeep: reportGreen.deep,
    greenSoft: reportGreen.soft,
    good: reportGreen.base,
    goodSoft: reportGreen.soft,
    warn: reportStatus.warn,
    warnSoft: reportStatus.warnSoft,
    bad: reportStatus.bad,
    badSoft: reportStatus.badSoft,
    headerGradient: reportHeaderGradient,
    /** Card shadow on the weekly-summary sheets and toast. */
    shadow: '#081420',
    /** A lighter card shadow — the filter bar and nutrient rows. */
    shadowSoft: '#0f1e28',
    /** Daily-report "open weekly summary" card. */
    cardBg: '#eaf2fc',
    cardLine: '#cfdcef',
    inkFaint: '#3f5b86',
    spinner: tw.sky600,
    insightIcon: tw.amber600,
    /** Micro-nutrient card hairline. */
    cardLineNeutral: tw.gray200,
  },

  /**
   * The food-log surface (meal cards, check-in card, macro card, day header).
   * A warm green-tinted scale that was declared THREE times in raw hex —
   * MealGroup's local `T`, MacrosCard's local `T`, and CheckinCard's
   * GREEN/LINE/INK consts — with the same values each time.
   */
  foodLog: {
    ink: '#16241c',
    inkSoft: '#52635a',
    inkMuted: authNeutral.inkMuted,
    line: '#e7ede9',
    lineSoft: '#f1f5f2',
    bg: '#eef2f0',
    surface: neutral.white,
    green: brandGreen.base,
    greenMid: brandGreen.mid,
    greenSoft: brandGreen.soft,
    /** Deliberately NOT brandGreen.deep (#0a4d27) — the day header runs darker. */
    greenDeep: '#0a5226',
    /** Top stop of the day-header gradient. */
    greenBright: '#14914a',
    good: '#0f9b54',
    goodSoft: '#e3f5ea',
    warn: '#d98a16',
    warnSoft: '#fbf0db',
    low: '#e0573e',
    lowSoft: '#fdeae3',
    purple: '#7c3aed',
    purpleSoft: '#f0e9fb',
    blue: '#2a64c4',
    blueSoft: '#e7eefb',
    amber: '#e08a16',
    amberSoft: '#fff1d9',
    shadow: '#102818',
    switchTrackOff: authStatus.strengthEmpty,
    switchThumb: neutral.white,
    // "your log may be out of date" banner
    staleBg: '#fffbeb',
    staleLine: '#fde68a',
    staleInk: '#b45309',
    staleInkSoft: '#92400e',
    staleIcon: '#d97706',
    headerGradient: ['#14914a', brandGreen.base, '#0a5226'],
  },

  /**
   * The dashboard and app chrome (AppBar, BottomNavigation, calendar, habit and
   * meal-slot cards). An emerald + slate scale, distinct from `foodLog`'s warm
   * greens and from `auth`'s brand green.
   *
   * It carries TWO near-identical neutral ramps on purpose: `ink`/`inkSoft`/
   * `inkMuted` are the slate ramp the chrome uses, and `calendar*` are the gray
   * ramp react-native-calendars was configured with. #0f172a vs #111827 and
   * #94a3b8 vs #6b7280 are one step apart — **do not merge them** without
   * re-checking the calendar against the rest of the chrome.
   */
  dashboard: {
    surface: neutral.white,
    green: tw.emerald600,
    greenDeep: tw.emerald700,
    greenDeepest: tw.emerald800,
    greenBright: tw.emerald500,
    /** Not a Tailwind step — the AppBar's own presence dot. */
    greenAccent: '#0ea371',
    teal: tw.teal700,
    ink: tw.slate900,
    inkSoft: tw.slate500,
    inkMuted: tw.slate400,
    /** AppBar hairline. */
    line: '#e4f1ea',
    /** Chip / avatar-well border. */
    lineTint: '#d5e8dd',
    /** Chip / avatar-well fill. */
    bgTint: '#f4faf7',
    /** BottomNavigation hairline. */
    navLine: '#dceadf',
    /** Back-chevron ink — a step off `ink`, kept as it was. */
    chevron: tw.gray800,
    calendarInk: tw.gray900,
    calendarInkMuted: tw.gray500,
    calendarInkDisabled: tw.gray300,
  },

  /**
   * Icon accents shared by the habit screens. Tailwind steps, used only to tint
   * glyphs — no surfaces are painted with these.
   */
  icon: {
    green: tw.emerald600,
    blue: tw.blue500,
    amber: tw.amber600,
    violet: tw.violet600,
    red: tw.red500,
    greenBright: tw.emerald500,
    /** Placeholder text and inactive glyphs. */
    muted: tw.gray400,
    /** One step darker than `muted`; the unselected reminder-type glyph. */
    mutedStrong: tw.gray500,
    onAccent: neutral.white,
  },

  /**
   * Nutrient flag chips and trend bars (NutritionCard, NutritionDetailDrawer).
   * The four bar colours were declared twice — once in NutritionCard's FLAG_CONFIG
   * and again in the drawer's local getBarColor switch.
   */
  nutrientFlag: {
    lowBar: tw.red400,
    lowBadge: tw.red50,
    lowText: tw.red600,
    okBar: tw.green400,
    okBadge: tw.green50,
    okText: tw.green600,
    highBar: tw.amber400,
    highBadge: tw.amber50,
    highText: tw.amber600,
    noneBar: tw.gray300,
    noneBadge: tw.gray50,
    noneText: tw.gray400,
    /** Pinned-nutrient marker + the loading spinner on the nutrient lists. */
    pin: tw.blue500,
    /** Track behind an inline nutrient bar. */
    track: tw.slate100,
    /** Refresh glyph on the all-nutrients card. */
    refresh: tw.gray500,
  },

  /** The daily-report progress ring's four bands plus its empty track. */
  progressRing: {
    good: tw.green500,
    warn: tw.yellow500,
    bad: tw.red500,
    info: tw.blue500,
    track: tw.gray300,
  },

  /** Weekly insight badge. */
  insight: {
    /** Not a Tailwind step; the badge's own green. */
    positive: '#13961a',
    negative: tw.red600,
    neutral: tw.amber600,
  },

  /**
   * The settings/diagnostics screens — Profile, Meal schedule, Reminder health,
   * MealReminderSettings. These predate the Nourish design system and were never
   * restyled: a plain white-on-off-white look with its own material-ish green and
   * a `#1a1a1a`/`#666`/`#999` ink ramp. Named here so the values stop being
   * retyped, NOT endorsed — restyling them onto `auth`/`foodLog` is a visual
   * change and therefore not part of this refactor.
   */
  settings: {
    bg: '#f8faf8',
    surface: neutral.white,
    ink: '#1a1a1a',
    inkSoft: '#666666',
    inkMuted: '#999999',
    inkFaint: '#555555',
    line: tw.gray200,
    shadow: '#000000',
    disabled: '#aaaaaa',
    disabledInk: '#bbbbbb',
    switchTrackOff: '#cccccc',
    switchTrackOn: '#81c784',
    switchThumbOff: '#f4f3f4',
    green: '#2e7d32',
    greenBg: '#f1f8f1',
    greenLine: '#d7ebd7',
    /**
     * Reminder-health row status. `statusOk` and `statusError` happen to equal
     * callPalette.accept / .decline; they are kept separate because this is a
     * light diagnostics list, not the call surface.
     */
    statusOk: '#1d9e75',
    statusWarn: '#c9821b',
    statusError: '#e24b4a',
    statusNa: '#9aa0a6',
    /** "Reminders are degraded" banner. */
    degradedBg: '#fdf2e2',
    degradedLine: '#f0c98a',
    degradedInk: '#8a5a12',
  },

  /** The dark, continuous call experience. */
  call: callPalette,

  /** Macro chart accents. */
  macro: macroAccent,

  /** Micro-nutrient card accents. */
  micro: microAccent,
} as const;
