/**
 * Copy rules for every user-facing string of the personal-targets and report modules (WEEKLY_BREAKDOWN_PLAN.md 5.8, 8.4,
 * 11.6): no moralising or alarming words, no diagnosis, the standard disclaimer on every screen that shows a target, a
 * score or a projection, and no digit in anything a person in low-pressure mode can see.
 */
import * as fs from 'fs';
import * as path from 'path';
import {
  CONSENT_VERSION,
  DISCLAIMER_ID,
  DISCLAIMER_STRINGS,
  SAFETY_CHECK_STRINGS,
  strings,
  whereDataLives,
} from '@/i18n/strings';

/** Every string in the table, with its path. */
function flatten(value: unknown, trail: string[] = []): { path: string; text: string }[] {
  if (typeof value === 'string') return [{ path: trail.join('.'), text: value }];
  if (value && typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => flatten(v, [...trail, k]));
  return [];
}

const ALL = flatten(strings);
const MORALISING =
  /\b(good|bad|clean|cheat|guilt|guilty|fail|failed|failure|off track|needs attention|streak|perfect|excellent|poor|diagnos\w*|deficient|deficiency|at risk|prescri\w*|cure)\b/i;
// Disease names, and "treat", are for the one question that must name conditions so people recognise themselves.
const CONDITIONS = /\b(diabet\w*|anaemi\w*|anemi\w*|obes\w*|cancer|hypertension|treatment|treat|treats|treated)\b/i;

/** The strings that break a rule, as `path: text`, so a failure names them (jest's expect takes no message). */
const offenders = (rule: (text: string) => boolean, from = ALL) =>
  from.filter(s => rule(s.text)).map(s => `${s.path}: ${s.text}`);

describe('the strings table', () => {
  it('has a lot of strings, and every one is a plain sentence or label', () => {
    expect(ALL.length).toBeGreaterThan(120);
    expect(offenders(t => t.trim() !== t || t.length === 0 || /\s{2,}/.test(t))).toEqual([]);
  });

  it('moralises, diagnoses and alarms nowhere', () => {
    // The standard disclaimer is exempt: it must say what the app does not do (it denies diagnosing and treating).
    expect(offenders(t => !DISCLAIMER_STRINGS.includes(t) && MORALISING.test(t))).toEqual([]);
    expect(
      offenders(t => /\b(good|bad|clean|cheat|guilt|streak|perfect|fail\w*|off track|needs attention)\b/i.test(t)),
    ).toEqual([]);
  });

  it('names a condition only in the safety question, which has to (plan 3.4)', () => {
    expect(
      offenders(t => !SAFETY_CHECK_STRINGS.includes(t) && !DISCLAIMER_STRINGS.includes(t) && CONDITIONS.test(t)),
    ).toEqual([]);
    // The question itself does name them: if it stopped, people could not recognise themselves in it.
    expect(strings.health.safety.clinician).toMatch(/diabetes/);
  });

  it('never tells a person what to eat or to eat less or more', () => {
    expect(
      offenders(t =>
        /\b(you should (eat|cut|avoid|skip)|eat (less|more|fewer)|cut (back|down) on|avoid (sugar|salt|fat))\b/i.test(
          t,
        ),
      ),
    ).toEqual([]);
  });

  it('has the standard disclaimer in its own words, once', () => {
    expect(strings.disclaimer.id).toBe(DISCLAIMER_ID);
    expect(DISCLAIMER_ID).toBe('estimates-v1'); // the Worker's `disclaimerId`
    expect(strings.disclaimer.footer).toBe('Estimates from what you logged, not medical advice.');
    expect(strings.disclaimer.full).toMatch(/does not diagnose, treat or prevent any condition/);
    expect(strings.disclaimer.full).toMatch(/pregnant or breastfeeding/);
    expect(strings.disclaimer.projection).toBe('A rough guide. Real results vary a lot from person to person.');
  });

  it('versions the consent text', () => {
    expect(CONSENT_VERSION).toMatch(/^\d{4}-\d{2}-v\d+$/);
  });

  describe('where the data lives', () => {
    const hosted = whereDataLives(false);
    const onPhone = whereDataLives(true);

    it('says the truth for each setting: a server, or this phone only', () => {
      expect(hosted.storedBody).toMatch(/on our server/);
      expect(onPhone.storedBody).toMatch(/on this phone only/);
      expect(onPhone.storedBody).not.toMatch(/server/i);
      expect(onPhone.recoveryBody).not.toMatch(/new phone|reinstall|server/i);
      expect(onPhone.switchProfile).not.toMatch(/server/i);
    });

    it('gives each setting its own consent version, since what is stored and where has changed', () => {
      expect(hosted.consentVersion).not.toBe(onPhone.consentVersion);
      for (const v of [hosted.consentVersion, onPhone.consentVersion]) expect(v).toMatch(/^\d{4}-\d{2}-v\d+$/);
    });

    it('never claims a server, a backup, other people or a shared list when the data is only on the phone', () => {
      const texts = Object.values(onPhone).flatMap(v => {
        if (typeof v === 'string') return [v];
        if (typeof v !== 'function') return [];
        const call = v as (...a: any[]) => string;
        return [call('mile', 'plate', 'bowl'), call(null), call(1), call(2)].filter(t => typeof t === 'string');
      });
      expect(texts.length).toBeGreaterThan(15);
      expect(texts.filter(t => /\b(server|backups?|everyone|someone|anyone|nobody|people|shared?)\b/i.test(t) && !/on this phone only/.test(t))).toEqual([]);
    });

    it('keeps both wordings inside the copy rules', () => {
      const both = [hosted, onPhone].flatMap(w =>
        Object.entries(w).flatMap(([k, v]) => (typeof v === 'string' && k !== 'consentVersion' ? [{ path: k, text: v }] : [])),
      );
      expect(offenders(t => MORALISING.test(t), both)).toEqual([]);
      expect(offenders(t => t.trim() !== t || /\s{2,}/.test(t), both)).toEqual([]);
    });
  });
});

describe('low-pressure mode (plan 8.2, 11.6)', () => {
  const low = flatten(strings.lowPressure);

  it('shows no digit anywhere a person with numbers hidden can see', () => {
    expect(low.length).toBeGreaterThan(8);
    expect(offenders(t => /\d/.test(t), low)).toEqual([]);
  });

  it('has a numberless wording for every insight the Worker lets through', () => {
    // The ids the Worker keeps in low-pressure mode (worker/src/domain/report/insights.ts).
    for (const id of [
      'low_intake',
      'underweight',
      'few_days',
      'incomplete_days',
      'pending_items',
      'partial_data',
      'check_amounts',
      'fibre_low',
      'sodium_over',
    ]) {
      expect(Object.keys(strings.lowPressure.insights)).toContain(id);
    }
  });
});

describe('the disclaimer on every screen that shows a target, a score or a projection (plan 8.5, 11.6)', () => {
  const root = path.join(__dirname, '..', 'src');
  const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');
  const screens: [string, string][] = [
    ['screens/TargetsScreen.tsx', 'disclaimer.footer'],
    ['screens/WeeklySummaryScreen.tsx', 'disclaimer.footer'],
    ['screens/ReportScreen.tsx', 'disclaimer.footer'],
    ['components/report/NutrientDetail.tsx', 'disclaimer.footer'],
    ['components/report/ScoreBreakdown.tsx', 'disclaimer.footer'],
    ['screens/GoalsScreen.tsx', 'disclaimer.reference'],
    ['screens/profile/ReviewScreen.tsx', 'disclaimer.full'],
    ['screens/profile/GoalStepScreen.tsx', 'disclaimer.projection'],
    ['screens/profile/HealthIntroScreen.tsx', 'disclaimer.full'],
    ['components/health/HowWeCalculate.tsx', 'disclaimer.full'],
  ];
  for (const [file, needle] of screens) {
    it(`${file} carries ${needle}`, () => {
      expect(read(file)).toContain(`strings.${needle}`);
    });
  }

  it('hard-codes none of the disclaimer wording in a screen: it comes from the table', () => {
    expect(screens.map(([file]) => file).filter(file => /not medical advice/.test(read(file)))).toEqual([]);
  });
});
