/**
 * Every user-facing string of the personal-targets and report modules, in one table
 * (WEEKLY_BREAKDOWN_PLAN.md 9.4, 11.6). Copy can change here without touching a screen, can be translated, and is
 * checked by `__tests__/copy.test.ts`: no moralising or alarming words, no diagnosis, the standard disclaimer on
 * every screen that shows a target, and no digit in anything a person in low-pressure mode can see.
 *
 * Wording rules (plan 5.8): "target", "reference", "limit", "average", "logged". Never "good", "bad", "clean",
 * "cheat", "guilt", "fail", "off track", "needs attention", "streak", "perfect". No instruction to eat less or
 * more. The safety-check questions are the one place that names conditions, so people can recognise themselves.
 */

import { ON_DEVICE } from '@/config/local';

/**
 * The words that depend on where the data lives. With the Worker on a server the data is "on our server" and a recovery code
 * matters on a new phone; with the Worker inside the app (`ON_DEVICE`) it never leaves the phone, and a new phone starts empty.
 * Telling a person their health answers sit on a server when they do not would be false, so each setting has its own text and
 * its own consent version (a change to what is stored or where changes the version and asks again).
 */
export const whereDataLives = (onDevice: boolean) =>
  onDevice
    ? {
        consentVersion: '2026-10-v2',
        storedBody:
          'Those answers and your weigh-ins, on this phone only, behind a secret that only this phone holds. They are not sent anywhere. Your answer to the safety question is never stored.',
        recoveryBody: 'This code unlocks your personal targets if the app ever asks for it on this phone. It is shown once. Keep it somewhere safe.',
        switchProfile: 'Your data stays on this phone. This phone stops ringing for this account until you log back in.',
        // The foods list is the person's own here: nobody else adds to it or sees it.
        addItemsNote: 'Foods you have not entered values for are saved anyway and count once you add them.',
        unitConversionNote: (unit: string) => `Applies to all your items in ${unit} for this food.`,
        pendingNotice: 'Once you fill in the food values or unit conversion, they count here automatically.',
        foodAdded: (n: number) => `${n} item${n === 1 ? '' : 's'} now count${n === 1 ? 's' : ''}.`,
        editorSubtitle: 'Your foods',
        editorNotice: 'Values you enter fix all past and future logs of this food. Use a label or a trusted source.',
        uncachedEmpty: 'Every food you have logged has its values and units.',
        uncachedLead: 'Foods you logged that have no values yet. Fill one in and it counts, including your past logs.',
        foodsSubtitle: (n: number | null) => (n === null ? 'Your foods' : `${n} food${n === 1 ? '' : 's'}`),
        unitUnknown: (food: string, base: string, unit: string) => `${food} is stored per ${base}; how much one ${unit} is has not been set yet.`,
        notCounted: 'Not counted until its values are added',
        // How many people logged it: only you, on the phone, so nothing to count.
        whoLogged: (_people: number, _trailing = false) => '',
        saveAnywayBody: 'Values you save fix all past and future logs of this food.',
        deleteHealthBody:
          'Your answers, weigh-ins, targets, care-team numbers and day marks are removed from this phone now. Your food log and the daily targets you typed yourself stay.',
        deleteProfileBody: 'Everything is removed from this phone now: your food log, call history, targets, health data and the foods you added.',
      }
    : {
        consentVersion: '2026-10-v1',
        storedBody:
          'Those answers and your weigh-ins, on our server, behind a secret that only your phone holds. Your answer to the safety question is never stored.',
        recoveryBody: 'This code unlocks your personal targets on a new phone or after a reinstall. It is shown once. Keep it in a password manager.',
        switchProfile: 'Your data stays on the server. This phone stops ringing for this account until you log back in.',
        addItemsNote: 'Foods nobody has entered values for are saved anyway and count once someone adds them.',
        unitConversionNote: (unit: string) => `Applies to everyone's items in ${unit} for this food.`,
        pendingNotice: 'Once someone fills in the food values or unit conversion, they count here automatically.',
        foodAdded: (n: number) => `${n} item${n === 1 ? '' : 's'} now count${n === 1 ? 's' : ''}, for everyone who logged it.`,
        editorSubtitle: 'Shared with everyone',
        editorNotice: 'Values you enter are shared with everyone and fix all past and future logs of this food. Use a label or a trusted source.',
        uncachedEmpty: 'Every food anyone has logged has its values and units.',
        uncachedLead: 'Foods that people logged but nobody has entered values for yet. Fill one in and it counts for everyone, including their past logs.',
        foodsSubtitle: (n: number | null) => (n === null ? 'Shared by everyone' : `${n} shared food${n === 1 ? '' : 's'}`),
        unitUnknown: (food: string, base: string, unit: string) => `${food} is stored per ${base}; nobody has said how much one ${unit} is yet.`,
        notCounted: 'Not counted until someone adds its values',
        whoLogged: (people: number, trailing = false) => `${trailing ? ' · ' : ''}${people} ${people === 1 ? 'person' : 'people'}${trailing ? '' : ' · '}`,
        saveAnywayBody: 'Values you save are shared with everyone and fix all past and future logs of this food.',
        deleteHealthBody:
          'Your answers, weigh-ins, targets, care-team numbers and day marks are removed now, and from backups within 30 days. Your food log and the daily targets you typed yourself stay.',
        deleteProfileBody:
          'Everything is removed now, and from backups within 30 days: your food log, call history, targets and health data. Foods you added stay in the shared list without your name.',
      };

/** The wording for this build: the Worker on a server, or inside the app. */
export const where = whereDataLives(ON_DEVICE);

/** The version of the consent text. A change to what is stored or who sees it changes this and asks again. */
export const CONSENT_VERSION = where.consentVersion;
export const DISCLAIMER_ID = 'estimates-v1';

export const strings = {
  disclaimer: {
    id: DISCLAIMER_ID,
    /** The one-line footer of every screen with a target, a score or a projection. */
    footer: 'Estimates from what you logged, not medical advice.',
    howWeCalculate: 'How we calculate this',
    /** The full text, on the consent and targets screens. */
    full: 'This app gives general information based on what you log and published reference values. It does not diagnose, treat or prevent any condition and cannot replace advice from a doctor or dietitian. Talk to one before changing your diet if you are pregnant or breastfeeding, have a medical condition, take regular medicines, or have had an eating disorder.',
    projection: 'A rough guide. Real results vary a lot from person to person.',
    reference: 'General reference, not personal',
    referenceLong: 'General reference, not personal: values for a typical adult on a 2,000 kcal diet.',
  },

  health: {
    card: {
      title: 'Make your targets personal',
      body: 'About 2 minutes. Skip any time.',
      action: 'Start',
      dismiss: 'Not now',
    },
    intro: {
      title: 'Personal targets',
      lead: 'Your calorie and nutrient targets can be worked out for you, instead of one fixed set for everyone.',
      asks: {
        title: 'What we ask',
        body: 'Your birth year, the sex used for calculations, your height and weight, how active you are, and your goal. Every question can be skipped.',
      },
      why: {
        title: 'Why',
        body: 'Each answer changes a number or a message. Nothing else is asked.',
      },
      stored: {
        title: 'What is stored',
        body: where.storedBody,
      },
      who: {
        title: 'Who else sees it',
        body: 'Nobody. The daily voice call never receives any of it. The call itself is handled by Vapi and the speech and language services it uses, as before.',
      },
      consent: 'I have read what is stored and why.',
      continue: 'Continue',
      skip: 'Skip for now',
    },
    safety: {
      title: 'Before we set targets',
      lead: 'Does any of this apply to you right now?',
      pregnant: 'I am pregnant or breastfeeding',
      eatingDisorder: 'I have, or have had, an eating disorder',
      clinician:
        'A doctor or dietitian has given me a specific diet or calorie target (for example for diabetes treated with insulin or tablets, kidney, heart or liver disease, cancer treatment, or after weight-loss surgery)',
      none: 'None of these',
      preferNot: 'I would rather not say',
      medicineTitle: 'Separately',
      medicine:
        'I take a medicine that can interact with food (for example blood thinners such as warfarin, lithium, or some blood-pressure tablets)',
      medicineHint:
        'This does not change your targets. It only turns off advice about vitamin K, potassium and sodium.',
      continue: 'Continue',
      note: 'Your answers here are used once to decide what we can offer. They are not stored.',
    },
    about: {
      title: 'About you',
      birthYear: 'Birth year',
      birthMonth: 'Birth month (optional)',
      birthMonthHint: 'Only sharpens the age-band edges.',
      sexTitle: 'Sex used for calculations',
      sexHint: 'Reference values differ for female and male bodies. Which should we use?',
      female: 'Female',
      male: 'Male',
      average: 'Prefer not to say: use the average of both',
      height: 'Height',
      weight: 'Weight',
      weightHint: 'Your best estimate is fine.',
      isThatRight: 'Is that right? Please check it.',
      continue: 'Continue',
    },
    under19: {
      title: 'Personal targets are for adults',
      body: 'Personal targets are for adults 19 and over, because the reference values and equations we use are for adults. You can still log food.',
      action: 'Back to the app',
    },
    activity: {
      title: 'How active are you?',
      lead: 'Pick the habit that fits best. If you are between two, choose the lower one; your weight trend will show if that is too low.',
      note: 'People cannot reliably place themselves in these groups, so your target is shown as a range.',
      inactive: {
        title: 'Inactive',
        body: 'Mostly sitting or light chores; little planned exercise.',
      },
      low_active: {
        title: 'Low active',
        body: 'Regular walking or light exercise on most days.',
      },
      active: {
        title: 'Active',
        body: 'Regular exercise, or a job on your feet.',
      },
      very_active: {
        title: 'Very active',
        body: 'Hard physical work or heavy training on most days.',
      },
      stepsHelper: 'I know my daily steps',
      stepsHint: 'This only picks a card for you. Step counts are not a precise way to measure activity.',
      continue: 'Continue',
    },
    goal: {
      title: 'What is your goal?',
      general_health: {
        title: 'Eat well',
        body: 'General health: targets for the nutrients, with your energy as a guide.',
      },
      maintain: { title: 'Maintain weight', body: 'Keep your weight steady.' },
      lose: {
        title: 'Lose weight',
        body: 'A gradual, bounded change in energy.',
      },
      gain: { title: 'Gain weight', body: 'A modest surplus, gradually.' },
      build_muscle: {
        title: 'Build muscle',
        body: 'A small surplus and more protein.',
      },
      notOffered: 'Not offered for your height and weight.',
      paceTitle: 'Pace',
      gentle: 'Gentle',
      standard: 'Standard',
      faster: 'Faster',
      paceNote: 'Your weight changes more slowly as time passes, and your body adapts. A rough guide only.',
      continue: 'Continue',
    },
    pattern: {
      title: 'How do you eat?',
      lead: 'This only decides which nutrients to watch more closely.',
      omnivore: 'Everything',
      pescatarian: 'Fish but no meat',
      eggetarian: 'Eggs but no meat or fish',
      vegetarian: 'Vegetarian (dairy, no eggs)',
      vegan: 'Vegan',
      referenceTitle: 'Reference values',
      referenceHint: 'The tables the targets are read from.',
      soon: 'Coming later',
      referenceNotes: {
        nasem: 'The tables used in the US and Canada. Sodium is limited to 2,300 mg a day.',
        icmr_nin:
          'The tables used in India (ICMR-NIN, 2020). A lower sodium limit, and iron, zinc and vitamin B12 read against the average requirement.',
      },
      continue: 'Continue',
    },
    review: {
      title: 'Your targets',
      lead: 'Here is what we worked out. Nothing is saved until you press Save.',
      energy: 'Energy',
      protein: 'Protein',
      fibre: 'Fibre',
      sodium: 'Sodium',
      rangeNote:
        'Your real needs could be anywhere in this range. After three or four weeks, your weight trend tells you more than this number does.',
      hideNumbers: 'Hide numbers',
      hideNumbersHint: 'No calorie, weight or score numbers on any screen. You can change this any time in Settings.',
      save: 'Save my targets',
      saving: 'Saving…',
      estimatesDisagree: 'The estimates disagree more than usual for your body size.',
      underweight: 'Your BMI is under 18.5. A doctor or dietitian can help you find a healthy weight and plan.',
      goalHeld:
        'You chose to lose weight, which is not offered for your height and weight, so your target keeps your weight steady.',
    },
    how: {
      title: 'How we calculate this',
      intro:
        'Every number here comes from published reference values and equations. Nothing is guessed by a model, and nothing here is medical advice.',
      energy: {
        title: 'Energy',
        body: 'The 2023 equation from the US National Academies, for your age, height, weight and activity. It is an estimate for someone whose weight is steady, with a typical error of about 240 to 340 kcal either side, so it is shown as a range. People cannot reliably place themselves in an activity group, and the equation comes from studies in high-income countries. Your weight trend over three or four weeks tells you more than this number does.',
      },
      goal: {
        title: 'Losing or gaining weight',
        body: 'A gradual change in energy, kept inside limits: a loss never goes below a floor of 1,200 kcal (women) or 1,500 kcal (men), never more than a quarter of your estimate, and never faster than about 1% of your body weight a week. Real change is slower than a simple sum suggests, because your body adapts.',
      },
      macros: {
        title: 'Protein, fat, carbohydrate and fibre',
        body: 'Protein is set per kilogram of body weight, higher for a loss goal, for building muscle and for older adults. Fat is about 30% of your energy, and carbohydrate is what is left, never under 130 g. Fibre is 14 g for every 1,000 kcal, and at least 25 g. Total sugars have no target: no authority limits them. Saturated fat and added sugars are limits of 10% of your energy each.',
      },
      minerals: {
        title: 'Sodium, potassium, vitamins and minerals',
        body: 'Sodium is a limit of 2,300 mg a day. Potassium and the rest are reference intakes for your sex and age band from the US National Academies. Iron is 1.8 times higher if you eat no meat, because iron from plants is absorbed less well. Some reference values are an Adequate Intake, an observed typical intake, so falling short of one says little about what you need.',
      },
      // The India set (ICMR-NIN, 2020): the same energy equation, its own protein allowance, fibre, limits and tables.
      india: {
        macros: {
          title: 'Protein, fat, carbohydrate and fibre',
          body: 'Protein is set per kilogram of body weight, higher for a loss goal, for building muscle and for older adults, and never under the Indian allowance of 0.83 g per kilogram. Fat is about 30% of your energy, inside the usual 15% to 35%, and carbohydrate is what is left, never under 130 g. Fibre is 15 g for every 1,000 kcal, and at least 25 g. Total sugars have no target. Saturated fat is a limit of 10% of your energy and added sugars of 5%.',
        },
        minerals: {
          title: 'Sodium, potassium, vitamins and minerals',
          body: "Sodium is a limit of 2,000 mg a day, about 5 g of salt. Potassium and the rest are reference intakes for your sex and age (19 to 59, or 60 and over) from India's ICMR-NIN tables of 2020. For iron, zinc and vitamin B12 the target is the Estimated Average Requirement, the level at which about half of people would still need more, because ICMR's own model diets do not reach the full allowance. Iron has no extra allowance for a plant-based diet: ICMR's figure already assumes about 8% absorption. Some reference values are an Adequate Intake, an observed typical intake, so falling short of one says little about what you need.",
        },
      },
      limits: {
        title: 'What this cannot know',
        body: 'It does not see supplements, fortified foods, sunlight, cooking oil or most restaurant meals. Logged amounts usually run a little low. Vitamins vary a lot from day to day, so they are judged over four weeks, not one.',
      },
      tags: 'Each target is tagged: R a reference value from a standards body, E an estimate with known error, G guidance from a professional body, A a design choice that no standard dictates.',
    },
    referenceOnly: {
      title: 'No personal targets',
      body: 'We are not setting personal targets for you. You can still log food, and the app shows what you logged.',
      careTeam: 'If a doctor or dietitian gave you numbers, you can add them and see your logs against them.',
      careTeamAction: 'Add my care-team numbers',
      talk: 'A doctor or dietitian can help with what is right for you.',
      done: 'Done',
    },
    recovery: {
      title: 'Save your recovery code',
      body: where.recoveryBody,
      warn: 'If you lose it, your personal data cannot be reached and you would start again with a new profile.',
      notStored:
        'This phone could not keep the code in its secure storage, so you will need to type it the next time you open the app. Save it now.',
      share: 'Save or share the code',
      saved: 'I have saved it',
      entryTitle: 'Enter your recovery code',
      entryBody: 'This profile has a recovery code. Enter it to unlock your personal targets on this phone.',
      entryField: 'Recovery code',
      entryAction: 'Unlock',
      entryWrong: "That is not this profile's code. Check it and try again.",
      startOver: 'I do not have it',
      claimAction: 'Set up a new code',
      claimRefused:
        'This profile already has a code, so a new one cannot be set up. Without the code, your personal targets cannot be reached from this phone.',
      claimClosed:
        'A new code cannot be set up from the app. Ask the person who runs the app to issue you one, then enter it above.',
      startOverBody:
        'Without the code, your personal targets cannot be reached from this phone. Your food log is unaffected.',
    },
    targets: {
      title: 'Your targets',
      subtitle: 'And how we calculate them',
      recommended: 'Recommended',
      custom: 'Custom',
      careTeam: 'From your care team',
      reset: 'Reset to recommended',
      change: 'Change',
      edit: 'Change your targets',
      editHint: 'Set your own number for any target, higher or lower than recommended.',
      recommendedValue: 'Recommended: {value}',
      groups: {
        energy: 'Energy',
        macros: 'Macros and fibre',
        limits: 'Keep in check',
        minerals: 'Vitamins and minerals',
      },
      evidence: {
        R: 'A reference value from a standards body',
        E: 'An estimate, with known error',
        G: 'Guidance from a professional body',
        A: 'A design choice, not a standard',
      },
      sources: 'Sources',
      weightTrend: 'Your weight trend is a better guide than this number.',
      staleWeight: 'Based on your weight in {month}.',
      checkIn:
        'You have been on a weight-loss target for a while. Time to check in: continue, keep your weight steady, or talk to a doctor or dietitian.',
      checkInAction: 'Check in',
      locked: 'Your recovery code is needed to see your personal targets on this phone.',
      empty: 'No personal targets yet.',
      setUp: 'Set up personal targets',
    },
    settings: {
      section: 'Personal targets',
      profile: 'Personal targets',
      profileSet: 'Edit your answers',
      profileNone: 'Make your targets personal',
      targets: 'Your targets',
      targetsHint: 'And how we calculate them',
      hideNumbers: 'Hide numbers',
      hideNumbersHint: 'No calorie, weight or score numbers anywhere',
      export: 'Export my health data',
      deleteHealth: 'Delete my health data',
      deleteHealthTitle: 'Delete your health data?',
      deleteHealthBody: where.deleteHealthBody,
      deleteProfile: 'Delete this profile',
      deleteProfileTitle: 'Delete this profile?',
      deleteProfileBody: where.deleteProfileBody,
      cancel: 'Cancel',
      confirm: 'Delete',
      unlock: 'Unlock with your recovery code',
    },
  },

  /**
   * The weekly report (plan 5, 7.8). Text with `{name}` holes is filled by `fill()` from the numbers the Worker sends;
   * the Worker never sends words, so copy changes here without a deploy.
   */
  report: {
    title: 'Report',
    week: {
      this: 'This week',
      last: 'Last week',
      ago: '{n} weeks ago',
      previous: 'Previous week',
      next: 'Next week',
    },
    basedOn: 'Based on {n} of 7 days',
    todayNote: 'Today is not counted until it is over.',
    /** What the four labels of the confidence rule say (plan 7.6). "Good" is a word the copy rules ban, so it reads "Solid". */
    confidence: {
      good: 'Solid',
      fair: 'Fair',
      rough: 'Rough',
      insufficient: 'Not enough data',
    },
    confidenceLabel: 'How sure: {level}',
    /** For the screen reader: what each mark under a day means. */
    dayState: {
      valid: 'logged',
      confirmed: 'marked complete',
      partial: 'looks incomplete',
      empty: 'not logged',
      skipped: 'left out',
      in_progress: 'today, not counted until it is over',
      future: 'not yet',
    },
    pending: {
      one: '1 item is waiting for a food value and is not counted.',
      many: '{n} items are waiting for food values and are not counted.',
      action: 'Open Pending',
    },
    notEnough: {
      none: 'You have not logged a finished day yet. A summary needs at least {min}.',
      some: 'You logged {n} of 7 days. A summary needs at least {min}. What follows is what you logged so far, with no verdicts.',
      one: 'You logged 1 of 7 days. A summary needs at least {min}. What follows is what you logged so far, with no verdicts.',
    },
    generic:
      'Compared with a general reference for a typical adult. Make your targets personal to compare with your own.',
    referenceOnly: 'No personal targets, so these are amounts only.',
    referenceOnlyCareTeam: 'Bars are drawn against the numbers you typed from your care team.',
    locked: 'Your recovery code is needed to see your personal report on this phone.',
    unlock: 'Unlock',
    stoodOut: 'What stood out',
    nothingStoodOut: 'Nothing stood out this week.',
    loading: 'Loading your week…',

    /** What an insight says (plan 5.6). One per id; a few ids have a variant for the singular or a note. */
    insights: {
      low_intake:
        'On {n} days you logged under {floor} kcal. If that is what you ate, a doctor or dietitian can help you eat enough. If meals are missing, adding them gives a better picture.',
      underweight: 'Your BMI is under 18.5. A doctor or dietitian can help you find a healthy weight and plan.',
      rapid_loss:
        'Your weight has been dropping faster than the usual 0.5 to 1% a week. Slowing down is usually safer; a doctor or dietitian can advise.',
      weight_vs_plan: 'Your trend weight changed {d} kg in {w} weeks; your plan expects about {e} kg.',
      few_days: 'You logged {n} of 7 days. A summary needs at least {min}.',
      incomplete_days: '{day} looks incomplete (about {kcal} kcal). Is that everything you ate?',
      incomplete_days_more: '{day} and {more} other days look incomplete. Is that everything you ate?',
      pending_items: '{n} items are waiting for food values and are not counted.',
      pending_items_one: '1 item is waiting for a food value and is not counted.',
      partial_data: 'Some foods have no {nutrient} value, so this is a minimum.',
      implausible_day: "{day}'s total is about {kcal} kcal. Check the quantities?",
      energy_above: 'You logged about {mean} kcal a day, {pct}% above your target of {target}. Logs usually run low.',
      energy_below: 'You logged about {mean} kcal a day, {pct}% below your target of {target}. Logs usually run low.',
      energy_near: 'You logged within 10% of your target on {k} of {n} days.',
      protein_gap: 'Protein averaged {mean} g a day against a target of {target} g.',
      sodium_over: 'Sodium averaged {mean} mg a day against a limit of {limit} mg.',
      sodium_over_least: 'Sodium was at least {mean} mg a day against a limit of {limit} mg.',
      sodium_sources: 'Most came from {sources}.',
      fibre_low: 'Fibre averaged {mean} g a day against a target of {target} g.',
      potassium_low_sodium_high:
        'Potassium (from fruit, vegetables and pulses) helps balance sodium. Yours was {mean} mg against {target} mg.',
      mineral_gap: '{nutrient} averaged {mean} {unit} a day against a reference of {reference} {unit}.',
      mineral_note_iron: 'Supplements and fortified foods may not be in your log.',
      mineral_note_zinc: 'Supplements and fortified foods may not be in your log.',
      vitamin_window:
        'Over the last four weeks, {nutrient} averaged {mean} {unit} a day against a reference of {reference} {unit}. Vitamins vary a lot from day to day, so this is a rough estimate.',
      vitamin_note_vitaminD: 'Sunlight and supplements are not counted here.',
      weekend_pattern: 'Weekend days averaged {pct}% {direction} energy than weekdays.',
      target_met: '{nutrient} reached your target on every logged day.',
      improving: '{nutrient} is up from {from} to {to} {unit} a day over four weeks.',
      check_amounts: '{quantity} {unit} of {name} on {day} looks unusual. Is that right?',
      check_amounts_more: '{quantity} {unit} of {name} on {day}, and {more} other amounts, look unusual. Are they right?',
    },
    insightActions: {
      incomplete_days: 'Open the day',
      implausible_day: 'Open the day',
      check_amounts: 'Open the day',
      pending_items: 'Open Pending',
      sodium_over: 'See sources',
      partial_data: 'See details',
      vitamin_window: 'See the four-week view',
    },

    /** What was logged, per day that counts, before any judgement (plan 5.2): energy and the macronutrients, and earlier weeks. */
    intake: {
      title: 'Logged per day',
      basis: 'Average of the {n} days that count',
      basisOne: 'The 1 day that counts',
      soFar: 'Logged so far, per day that counts',
      none: 'No finished day to average yet.',
      atLeast: 'at least {value}',
      notEnough: 'Not enough data',
      share: '{pct}% of energy',
      trend: 'Compared with your last {weeks} weeks: {list}.',
      trendMixed: 'Compared with earlier weeks: {list}.',
      higher: '{name} higher',
      lower: '{name} lower',
      same: '{name} about the same',
      trendSoon: 'Comparisons with earlier weeks appear after three weeks with at least three counted days each.',
      note: 'Logged amounts usually run a little low.',
    },

    /** What is missing or uncertain in the week's figures (plan 7.4, 7.7, 7.8). */
    quality: {
      title: 'What is missing or uncertain',
      gaps: '{n} foods behind this week are missing values this report uses: {pct}% of what you logged.',
      gapsOne: '1 food behind this week is missing values this report uses: {pct}% of what you logged.',
      gapsNames: 'The largest: {names}.',
      gapsMissing: 'Missing most often: {list}.',
      gapsAction: 'Fill in values',
      gapsNone: 'Every food behind this week has the values this report uses.',
      amountsTitle: 'Amounts worth a check',
      amountsHint: 'A call can mishear an amount. Each one still counts until you change it.',
      amount: '{quantity} {unit} of {name}, {day}',
      why: {
        large_energy: 'about {kcal} kcal in one item',
        many_servings: 'more helpings than usual',
        large_weight: 'a lot for one item',
      } as Record<string, string>,
      amountAction: 'Open the day',
      sources: 'Where the numbers come from: {list}.',
      source: {
        label: 'pack labels {pct}%',
        database: 'food databases {pct}%',
        recipe: 'recipes {pct}%',
        estimate: 'guesses {pct}%',
        none: 'not recorded {pct}%',
      } as Record<string, string>,
      sourcesHint: 'A guess or an unrecorded source makes every figure rougher. Say where a food\'s numbers come from when you edit it.',
    },

    energy: {
      title: 'Energy',
      logged: 'You logged about {mean} kcal a day',
      none: 'No finished day to average yet.',
      aboutRange: 'about {target} kcal ({low} to {high})',
      exact: '{target} kcal',
      band: 'Within 10% of {target} on {k} of {n} days',
      logsLow: 'Logs usually run low; your weight is the better guide.',
      careTeam: 'The target is the number your care team gave you.',
      target: 'Target',
      chart: 'Energy by day against the target of {target} kcal',
    },

    groups: {
      getEnough: 'Get enough',
      getEnoughHint: 'Judged on the days you logged',
      keepInCheck: 'Keep in check',
      amountsOnly: 'Amounts only',
      sugarNote: 'Total sugars include the sugars in fruit and milk, and no authority sets a limit for them.',
    },

    line: {
      noFigure: 'No figure',
      loggedSoFar: 'Logged so far',
      atLeast: 'at least {value}',
      perDay: 'a day',
      target: 'target {value}',
      yourTarget: 'your target {value}',
      careTeamTarget: 'care-team target {value}',
      limit: 'limit {value}',
      reference: 'reference {value}',
      average: 'average requirement {value}',
      range: 'usual range {low} to {high}',
      noReference: 'no reference',
      daysMet: '{k} of {n} days',
      daysWithin: 'within it on {k} of {n} days',
      percent: '{pct}%',
      percentOf: 'of reference',
      shareOfEnergy: '{pct}% of energy',
      notEnough: 'Not enough data: foods with a value cover {pct}% of what you logged.',
      partial: 'Some foods have no value, so this is a minimum.',
      a11y: '{name}, {value} a day',
    },

    /** The words for how a nutrient reads against its reference. Never "good" or "bad" (plan 5.4, 5.8). */
    assessment: {
      onTarget: 'On target',
      withinLimit: 'Within the limit',
      nearTarget: 'Near your target',
      aLittleLow: 'A little low',
      belowTarget: 'Below target',
      belowYourTarget: 'Below your target',
      aboveLimit: 'Above the limit',
      aboveYourTarget: 'Above your target',
      wellAbove: 'Well above the limit',
      inRange: 'In the usual range',
      aboveRange: 'Above the usual range',
      belowRange: 'Below the usual range',
      notEnough: 'Not enough data',
      someMissing: 'Some foods have no value',
      amountOnly: 'Amount only',
    },

    kindHint: {
      limit: 'A limit: stay at or under',
      range: 'A usual range, as a share of energy',
      energy: 'An estimate, not a target to hit',
      amount: 'No reference: shown, not judged',
      minimum: 'A reference: aim to reach at least',
    },

    /** The weight line of the weekly view, the weigh-in sheet and its prompt (plan 5.7, 6.2, 6.6, Phase 5). */
    weight: {
      title: 'Weight',
      latest: '{kg} kg',
      trend: 'Trend {kg} kg',
      noTrend: "The trend smooths out one day's water, so a single weigh-in barely moves it.",
      rateDown: 'The trend is falling by about {rate} kg a week.',
      rateUp: 'The trend is rising by about {rate} kg a week.',
      rateFlat: 'The trend is steady.',
      rateSoon: 'A weekly rate appears after three weeks of weigh-ins.',
      noise: 'Weight moves up and down by about {noise} kg from day to day, so the trend is the better guide.',
      plan: 'Over {w} weeks your trend weight changed {d} kg. Your plan expects a change of about {low} to {high} kg.',
      chart: 'Weight trend, from {from} to {to}',
      add: 'Add a weigh-in',
      empty: 'No weigh-ins yet. Add one to see your trend.',
      history: 'Last weeks',
      weighIns: '{n} weigh-ins',
      weighInsOne: '1 weigh-in',
    },
    weighIn: {
      title: 'Add a weigh-in',
      lead: 'Your best estimate is fine. A weigh-in only moves your targets when it differs from the weight they used by 3% or 2 kg, whichever is more.',
      weight: 'Weight',
      kg: 'kg',
      lb: 'lb',
      st: 'st + lb',
      stones: 'Stones',
      pounds: 'Pounds',
      save: 'Save weigh-in',
      saving: 'Saving…',
      check: 'Please check the weight.',
      largeTitle: 'Is that right?',
      largeBody: 'That is quite different from the day before.',
      yes: 'Yes, save it',
      saved: 'Weigh-in saved.',
      changed: 'Your targets were updated.',
      because: 'because your weight changed',
      calories: 'Calories {from} to {to}',
      protein: 'Protein {from} g to {to} g',
    },
    weighPrompt: {
      title: 'Update your weight?',
      body: 'It has been a while since your last weigh-in. Skip it if you like: nothing changes if you do.',
      action: 'Update',
      dismiss: 'Not now',
    },
    calibration: {
      title: 'Experimental',
      lead: 'Your logs and your weight trend over the last four weeks suggest you may use about {kcal} kcal a day, give or take {unc}. Your targets use {current}.',
      logsLow: 'Logs usually run low, so the real figure is probably higher.',
      notApplied: 'This is a rough, unproven estimate, so nothing was changed.',
    },
    fourWeek: {
      title: 'Vitamins over four weeks',
      hint: 'These vary a lot from day to day, so they are judged over four weeks, not one.',
      window: 'Last four weeks',
      notEnough: 'Not enough logged days in the last four weeks to compare.',
      open: 'Four-week view',
    },

    score: {
      title: 'Nutrient mix',
      about: 'about {n}',
      atLeast: 'at least {n}',
      of: 'out of 100',
      basedOn: 'Based on {n} of 7 days',
      explain:
        'How well the mix of what you logged, per calorie, matches your reference intakes. It is a summary of what you logged, not an assessment of your health.',
      disclaimer: 'A summary of the foods you logged against reference intakes. It is not a measure of your health.',
      notMeasured:
        'It does not measure how much you ate: the energy card and the amounts above do that. It does not predict anything about your health.',
      higher: 'Higher than your last four weeks',
      lower: 'Lower than your last four weeks',
      same: 'About the same as your last four weeks',
      range: 'Leaving out any one day, it would be between {low} and {high}.',
      exact: 'Exactly {value} out of 100, from {points} of {outOf} points.',
      parts: 'What it is made of',
      part: '{points} of {outOf}',
      unknownPart: 'Not enough data',
      partCoverage: 'foods with a value cover {pct}%',
      unknownNote:
        'The parts without enough data earn nothing, so this is a minimum. Filling in food values raises it.',
      names: {
        protein: 'Protein',
        fibre: 'Fibre',
        potassium: 'Potassium',
        calcium: 'Calcium',
        iron: 'Iron',
        magnesium: 'Magnesium',
        zinc: 'Zinc',
        sodium: 'Sodium',
        saturated_fat: 'Saturated fat',
        added_sugars: 'Added sugars',
      } as Record<string, string>,
      history: 'Last eight weeks',
      historyGap: 'a week with fewer than 3 logged days is left blank',
      withheld: {
        off: 'The score is turned off.',
        few_days: 'Not enough days to give a score yet.',
        unknown_foods: 'No score yet: some foods are still unknown. Open Pending to sort that out.',
        incomplete_days: 'No score yet: some days look incomplete.',
        thin_data: 'Not enough nutrient data to score. It fills in as the foods you eat most get their values.',
        low_intake: 'No score is shown next to a very low logged intake.',
        generic: 'A score needs personal targets.',
        reference_only: 'No score is shown without personal targets.',
        numbers_hidden: 'Numbers are hidden.',
      },
      open: 'See the parts',
      close: 'Close',
    },

    detail: {
      subtitleWeek: 'This week',
      subtitleFour: 'Last four weeks',
      average: 'Average per logged day',
      averageLeast: 'At least, per logged day',
      basedOn: 'based on {n} days',
      basedOnOne: 'based on 1 day',
      daily: 'This week, day by day',
      leftOut: 'left out',
      highest: 'Highest day',
      lowest: 'Lowest day',
      daysMet: 'Met the target on {k} of {n} days',
      daysWithin: 'Within the limit on {k} of {n} days',
      sources: 'Top sources this week',
      sourcesNone: 'No logged food has a value for this yet.',
      how: 'How this target is calculated',
      data: 'Data',
      dataAll: 'Every food you logged has a value for this.',
      dataSome: 'Foods with a value cover {pct}% of what you logged.',
      setTarget: 'Set target',
      setReference: 'Set reference',
      history: 'Last eight weeks, as a share of the target',
      compared: 'Compared with earlier weeks',
      trendHigher: 'Higher than your last {weeks} weeks, which averaged {previous} a day.',
      trendLower: 'Lower than your last {weeks} weeks, which averaged {previous} a day.',
      trendSame: 'About the same as your last {weeks} weeks ({previous} a day).',
      reference: 'General reference',
      yourTarget: 'Your target',
      careTeam: 'From your care team',
      recommended: 'Recommended',
    },

    sentence: {
      fewDays: '{n} logged days so far. A week needs at least {min} to be compared with a reference.',
      fewDaysOne: '1 logged day so far. A week needs at least {min} to be compared with a reference.',
      meetsLimit: '{name} averaged {least}{mean} a day, within {ref}.',
      meetsMinimum: '{name} averaged {least}{mean} a day, in line with {ref}.',
      close: '{name} averaged {mean} a day, a little under {ref}.',
      below: '{name} averaged {mean} a day, below {ref}.',
      over: '{name} averaged {least}{mean} a day, above {ref}.',
      wellOver: '{name} averaged {least}{mean} a day, well above {ref}.',
      inRange: '{name} averaged {mean} a day, inside the usual range of {low} to {high}.',
      aboveRange: '{name} averaged {least}{mean} a day, above the usual range of {low} to {high}.',
      belowRange: '{name} averaged {least}{mean} a day, below the usual range of {low} to {high}.',
      unknownLow:
        'Too few of the foods you logged have a {lower} value to say anything. Adding values to the foods you eat most fixes that.',
      unknownSome: 'Some foods have no {lower} value, so {mean} a day is a minimum and the week cannot be called low.',
      amount: '{name} is shown, not judged: no authority sets a reference for it.',
      fourWeeks: '{name} varies a lot from day to day, so it is judged over four weeks, not one.',
      noReference: 'No reference is set for {lower}. Set one to compare.',
      energyReference:
        'Calories are compared with a general reference only. Make your targets personal to see how the week compares.',
      noFigure: 'No logged day has a {lower} value, so there is no figure for it.',
      refGeneric: 'the general reference of {value}',
      refTarget: 'your target of {value}',
      refCareTeam: 'your care-team target of {value}',
      refLimit: 'the limit of {value}',
      refYourLimit: 'your limit of {value}',
      // The Indian set judges iron, zinc and vitamin B12 against the Estimated Average Requirement, and says so.
      refAverage: 'the average requirement of {value}',
    },

    all: {
      title: 'All nutrients',
      subtitle: 'Averages over the days you logged',
      search: 'Search vitamins, minerals, macros…',
      filters: {
        all: 'All',
        onTarget: 'On target',
        worthALook: 'Worth a look',
        notJudged: 'Not judged',
      },
      count: '{n} nutrients',
      countOne: '1 nutrient',
      amount: 'Amount',
      percent: '%',
      noMatches: 'No matches',
      tryAnother: 'Try a different search.',
      emptyGroup: 'Nothing in this group for the week.',
      loading: 'Loading nutrients…',
      groups: {
        energy_and_macros: 'Energy and macros',
        get_enough: 'Get enough',
        keep_in_check: 'Keep in check',
        vitamins_and_minerals: 'Vitamins and minerals',
      },
      link: 'All nutrients',
      linkHint: 'Every nutrient, day by day',
      targetsLink: 'Your targets',
      targetsHint: 'And how we calculate them',
      goalsLink: 'Daily targets',
      goalsHint: 'Set the numbers the reports compare against',
      note: 'Logged amounts usually run a little low.',
    },
  },

  /** Marking a day (plan 7.2): it is complete, it looks incomplete, or leave it out of the reports. */
  day: {
    mark: 'Mark this day',
    marked: {
      complete: 'Marked complete',
      partial: 'Marked incomplete',
      skip: 'Left out',
    },
    sheet: {
      title: 'Mark this day',
      lead: 'This only changes how the day counts in your weekly figures. Nothing is deleted.',
      complete: 'It is complete',
      completeHint: 'Count this day, even if it has little or nothing logged.',
      partial: 'It looks incomplete',
      partialHint: 'Leave it out of the weekly figures until you add what is missing.',
      skip: 'Leave this day out',
      skipHint: 'Illness, travel, a festival, or a day you do not want counted.',
      clear: 'Clear the mark',
      current: 'Current mark',
    },
    open: 'Open the day',
    /** A past day the weekly figures leave out because it looks incomplete (plan 7.2, 7.8). */
    incomplete: {
      title: 'This day looks incomplete',
      low: 'About {kcal} kcal is logged, so it is left out of your weekly figures. Is that everything you ate?',
      marked: 'You marked this day incomplete. It is left out of your weekly figures until you add what is missing.',
      complete: 'It is complete',
      leaveOut: 'Leave this day out',
      clear: 'Clear the mark',
    },
  },

  /** A logged item's amount (plan 7.7): what it comes to, and when it is worth a second look. */
  item: {
    weight: 'about {value} {unit}',
    check: 'Check the amount',
    checkHint: {
      large_energy: 'More energy than one dish usually has. A misheard amount?',
      many_servings: 'More helpings than usual. A misheard amount?',
      large_weight: 'A lot for one item. A misheard amount?',
    } as Record<string, string>,
  },

  /** Checking and sourcing the numbers of a food (plan 7.4), and the list of foods that lack values. */
  food: {
    /** What the Worker found, worded here from its id and numbers. Hard rules refuse a save; the rest ask. */
    issues: {
      sugar_over_carbs: 'Sugars ({sugar} g) are more than carbohydrate ({carbs} g). Sugars are part of carbohydrate.',
      fibre_over_carbs: 'Fibre ({fiber} g) is more than carbohydrate ({carbs} g). Fibre is part of carbohydrate.',
      sat_fat_over_fat: 'Saturated fat ({saturatedFat} g) is more than total fat ({fat} g).',
      added_over_sugar: 'Added sugars ({addedSugar} g) are more than total sugars ({sugar} g).',
      macros_over_100g:
        'Protein, carbohydrate and fat add up to {total} g in {base}, which cannot be much more than 100 g.',
      calories_over_900: '{calories} kcal in {base} is more than pure fat has, about 900. Please check the number.',
      sodium_over_40000:
        '{sodium} mg of sodium in {base} is more than pure salt has, about 39,000. Please check the number.',
      calories_vs_macros:
        'Protein, carbohydrate and fat suggest about {expected} kcal, but the calories say {calories}. Labels can differ a little. Please check the calories.',
      serving_calories_high: '{calories} kcal in one {base} is a lot. Is that right?',
      serving_sodium_high: '{sodium} mg of sodium in one {base} is a lot. Is that right?',
      serving_nutrient_high:
        '{nutrient}: {value} {nutrientUnit} in one {base} is more than ten times the daily reference of {reference} {nutrientUnit}. Is that right?',
      unit_weight_implausible: 'One {unit} comes to {amount} g (or ml) here. Is that right?',
      raw_serving_unit:
        'These numbers are for raw or dry food, but a {unit} is usually measured cooked. Enter the raw amount that goes into one {unit}, or add the cooked dish as a food of its own.',
      // Asked by the app itself, because an empty field is saved as 0.
      all_empty: 'Every value is empty, so this food will count as 0 calories and 0 of everything. Is that right?',
      calories_empty: 'Calories are 0, but protein, carbohydrate and fat suggest about {expected} kcal. Please check the calories.',
    } as Record<string, string>,
    checkTitle: 'Please check before saving',
    refused: 'These numbers cannot all be true, so the food was not saved.',
    saveAnyway: 'Save anyway',
    saveAnywayTitle: 'Save with these warnings?',
    saveAnywayBody: where.saveAnywayBody,
    fixFirst: 'Fix the numbers that cannot be true to save.',
    /** Raw or as eaten (plan 7.7): the commonest way for a portion to be wrong is dry rice's numbers logged by the cooked katori. */
    form: {
      title: 'The numbers are for the food',
      hint: 'Cooked rice has about a third of the energy of dry rice, gram for gram. Logs are of food as eaten.',
      as_eaten: 'As eaten',
      raw: 'Raw or dry, before cooking',
      unsure: 'Not sure',
      label: { as_eaten: 'As eaten', raw: 'Raw or dry' } as Record<string, string>,
    },
    conversion: {
      inGrams: '1 {unit} = {amount} {measure}',
      rawNote:
        'This food\'s numbers are for it raw or dry. A {unit} is usually measured cooked, so enter how much raw food goes into one {unit}.',
    },
    source: {
      title: 'Where do these numbers come from?',
      hint: 'It helps people tell a label from a guess.',
      label: 'A pack label',
      database: 'A food database',
      recipe: 'A recipe I worked out',
      estimate: 'A guess',
      unsure: 'Not sure',
      reviewed: 'Numbers last saved {date}',
      none: 'No source recorded',
    },
    gaps: {
      title: 'Foods with gaps',
      intro:
        'Foods you ate in the last four weeks that are missing values the weekly view uses. Filling these in, starting at the top, lets more of your week count.',
      share: '{pct}% of what you logged',
      missing: 'Missing: {list}',
      complete: '{pct}% of the energy you logged is from foods that have every value.',
      empty: 'Every food you logged has the values the weekly view needs.',
      action: 'Fill in values',
      loading: 'Looking at what you logged…',
      eaten: 'logged {n} times',
      eatenOne: 'logged once',
    },
  },

  /**
   * Entering a food's values (the food form): by hand, or by pasting what a chat assistant wrote. The prompt and the data format
   * are built in `utils/foodData.ts` from the nutrients the Worker serves; only the words are here, one sentence to a string.
   */
  foodEntry: {
    modes: { manual: 'Enter manually', paste: 'Paste data' },
    saveAndLog: 'Add food and log it',
    fields: {
      title: 'Nutrients per {base}',
      titleNoBase: 'Nutrients',
      hint: 'Fill in what you know. A field left empty is saved as 0.',
      hintEdit: 'Fill in what you know. A field left empty is saved as 0, except the ones marked Unknown: nobody has given those a value, and they stay unknown until you do.',
      unknown: 'Unknown',
      filled: '{n} of {total} filled',
      placeholder: '0',
      groups: { label: 'On a pack label', minerals: 'Minerals', vitamins: 'Vitamins', other: 'Other' },
    },
    errors: { number: 'Enter a number', tooLarge: 'The most allowed is {max}' },
    paste: {
      copyTitle: 'Get the data from an assistant',
      copyBody:
        'Copy the prompt, paste it into ChatGPT, Gemini, Claude or any assistant, and tell it which food. It answers in the format this app reads.',
      copy: 'Copy prompt',
      copied: 'Prompt copied',
      copyError: 'Could not copy the prompt. Show it, then press and hold the text to copy it.',
      showPrompt: 'Show the prompt',
      hidePrompt: 'Hide the prompt',
      pasteTitle: 'Paste its answer',
      pasteBody: 'Paste the whole reply. The form fills in, and you check the numbers before saving.',
      placeholder: "Paste the assistant's reply here",
      fromClipboard: 'Paste from clipboard',
      noClipboard: 'There is nothing on the clipboard to paste.',
      fill: 'Fill in the form',
      clear: 'Clear',
      problems: 'This could not be read',
      problemsMore: '{n} more problems are not shown.',
      problemsHint: 'Fix them in the box, or ask the assistant to answer again with the prompt.',
      skipped: 'Left out, because this app does not track them: {list}.',
      filledOne: 'Filled in 1 value from the pasted data. Check it below, then save.',
      filled: 'Filled in {n} values from the pasted data. Check them below, then save.',
      nameKept: 'The data is for "{pasted}", but the name stays "{name}".',
    },
    dataIssues: {
      empty: 'Nothing has been pasted yet.',
      no_data: "No nutrition data was found. Copy the assistant's whole reply, starting at the opening { of the data.",
      syntax: 'The data is cut off or has a typing slip on line {line}, near "{near}": expected {expected}. Ask the assistant to answer again, or fix that spot.',
      several: 'The data holds {count} foods. Paste one food at a time.',
      bad_number: '"{field}" should be a number, but it says "{value}".',
      negative: '"{field}" cannot be below 0, but it says {value}.',
      too_large: '"{field}" is too large ({value}). The most allowed is {max}.',
      wrong_unit: '"{field}" is in a different unit than the app reads. Use {expected} instead.',
      bad_per: '"per" says "{value}", which the app does not have. It must be one of: {allowed}.',
      bad_form: '"form" says "{value}". It must be "as_eaten" or "raw".',
      no_values: 'No nutrient values were found. Expect fields like {examples}.',
    },
    /** The text copied into an assistant. The rules are one line each; `utils/foodData.ts` joins them with the format. */
    prompt: {
      intro: 'Give the nutrition facts of the food named on the last line. Reply with one JSON object, in exactly the format below.',
      rules: [
        'Reply with the JSON object only, in a code block, with no other words.',
        'Every nutrient is a plain number with no unit and no quotes. Use a dot for decimals.',
        'Use 0 for a nutrient the food does not contain or that you do not know. Never write null, text or a range.',
        'Fields ending in _g are in grams, _mg in milligrams and _mcg in micrograms. calories_kcal is in kilocalories.',
        '"form" is "as_eaten" for food as it is eaten (cooked or ready to eat) and "raw" for raw or dry food before cooking.',
        '"source" is always "estimate".',
      ],
      perAny: '"per" is the amount of food all the numbers are for. It must be exactly one of: {list}.',
      perFixed: 'Set "per" to "{unit}" and give every number for that amount of the food.',
      formatLead: 'Use exactly these fields:',
      exampleName: 'the name of the food',
      examplePer: 'one of the per values above',
      foodLabel: 'Food:',
      foodPlaceholder: 'write the food and the amount here',
    },
  },

  /** The log screen: pick a meal, pick foods (your own first), set the amounts, add. */
  log: {
    title: 'Log food',
    meal: 'Meal',
    mealClear: 'Tap again to log without a meal',
    noMealHint: 'No meal chosen: these are listed under Other.',
    groupOther: 'Other',
    searchPrompt: 'Search or add a food',
    searchLabel: 'Search foods or add a new one',
    usual: 'Your usual {meal}',
    usualAny: 'Your most logged foods',
    common: 'Common at {meal}',
    commonAny: 'Common foods',
    toAdd: 'To add',
    toAddCount: '{n} to add',
    empty: 'Nothing here yet. Tap a food above, or search for one.',
    noValues: 'No values yet',
    unitNotSetUp: 'Unit not set up',
    loadFailed: 'Your own foods could not be loaded, so this list may not be yours yet.',
    retry: 'Try again',
    addOne: 'Add 1 item',
    addMany: 'Add {n} items',
    addOneTo: 'Add 1 item to {meal}',
    addManyTo: 'Add {n} items to {meal}',
    addNone: 'Add items',
    pickOne: 'Add at least one food.',
    checkAmounts: 'Check the highlighted amounts.',
    quantity: 'Quantity',
    quantityError: 'Must be above 0',
    decrease: 'Decrease the amount of {name}',
    increase: 'Increase the amount of {name}',
    remove: 'Remove {name}',
    unitOf: 'Unit for {name}: {unit}',
    addedFood: '"{name}" is added to your foods and to this list.',
    picker: {
      title: 'Choose a food',
      subtitleMeal: 'For {meal}',
      subtitleNone: 'No meal chosen',
      search: 'Search foods',
      also: 'Also logged by you',
      all: 'All foods',
      moreHint: 'Search to find the rest.',
      usually: 'Usually {amount}',
      none: 'No match for "{query}"',
      noneBody: 'Add it as a new food, and it will be here next time.',
      add: 'Add new food item',
      addNamed: 'Add "{query}" as a new food item',
      addHint: 'Enter its nutrition values, or paste them.',
      withoutValues: 'Log "{query}" without values',
      withoutValuesHint: 'It is saved, and counts once its values are added.',
    },
    units: {
      title: 'Unit',
      forFood: 'Set up for this food',
      all: 'All units',
      other: 'Something else',
      otherPlaceholder: 'e.g. ladle, handful',
      use: 'Use',
    },
  },

  /** The profile's look: follow the phone, or always light or dark (Settings). */
  appearance: {
    title: 'Appearance',
    hint: "System follows your phone's light or dark setting.",
    system: 'System',
    light: 'Light',
    dark: 'Dark',
  },

  /** What a person in low-pressure mode can see. No digit in any of it (plan 11.6). */
  lowPressure: {
    todayTitle: 'Foods and meals',
    todayBody: 'Numbers are hidden. You can show them again in Settings.',
    reportTitle: 'This week',
    reportBody: 'Numbers are hidden. Here is what stood out.',
    nothing: 'Nothing stood out this week.',
    basedOn: 'Based on the days you logged.',
    energyHidden: 'Energy and amounts are hidden.',
    insights: {
      low_intake:
        'On several days you logged very little. If that is what you ate, a doctor or dietitian can help you eat enough. If meals are missing, adding them gives a better picture.',
      underweight: 'A doctor or dietitian can help you find a healthy weight and plan.',
      rapid_loss:
        'Your weight has been dropping quickly. Slowing down is usually safer; a doctor or dietitian can advise.',
      few_days: 'You logged only a few days. A summary needs more.',
      incomplete_days: 'Some days look incomplete. Is that everything you ate?',
      pending_items: 'Some items are waiting for food values and are not counted.',
      partial_data: 'Some foods have no value for a nutrient, so this is a minimum.',
      fibre_low: 'Fibre was on the low side this week.',
      sodium_over: 'Sodium was above the usual limit this week.',
      check_amounts: 'Some amounts look unusual. Worth a check?',
    } as Record<string, string>,
    dayIncomplete: 'Very little is logged, so it is left out of your weekly figures. Is that everything you ate?',
  },
} as const;

/** The disease and condition names the safety question must use; every other string avoids them (plan 8.4). */
export const SAFETY_CHECK_STRINGS: readonly string[] = [
  strings.health.safety.clinician,
  strings.health.safety.medicine,
  strings.health.safety.medicineHint,
];

/**
 * The standard disclaimer has to say what the app does NOT do ("does not diagnose, treat or prevent any condition"), which
 * the stores require (plan 8.5). It is the one string that uses those verbs, and only to deny them.
 */
export const DISCLAIMER_STRINGS: readonly string[] = [strings.disclaimer.full];
