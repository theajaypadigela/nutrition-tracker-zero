/**
 * The food editor (WEEKLY_BREAKDOWN_PLAN.md 7.4, Phase 4): numbers are checked as they are typed, numbers that cannot all be true block the
 * save, a probable typo asks first, and the person says where the numbers came from. Every nutrient is in view, an empty one is saved as 0,
 * and a food can be filled by pasting what a chat assistant wrote. The Worker's own checks are tested in the Worker; here the screen is
 * rendered with the API replaced and driven through its inputs.
 */
import React from 'react';
import { Alert } from 'react-native';
import TestRenderer, { act, type ReactTestInstance } from 'react-test-renderer';

jest.mock('@react-navigation/native', () => {
  const nav = { navigate: jest.fn(), goBack: jest.fn(), canGoBack: jest.fn(() => true) };
  return { useNavigation: () => nav, useIsFocused: () => true, useRoute: jest.fn(() => ({ params: {} })), useFocusEffect: jest.fn(), __nav: nav };
});
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/state/MetaContext', () => ({ useMeta: jest.fn() }));
jest.mock('@/services/clipboard', () => ({ copyText: jest.fn(() => true), pasteText: jest.fn(async () => '') }));
jest.mock('@/api/client', () => {
  // Plain assignments, not parameter properties: a jest.mock factory may not reference Babel's helpers.
  class ApiError extends Error {
    status: number;
    code: string;
    details: Record<string, unknown>;
    constructor(status: number, code: string, message: string, details: Record<string, unknown> = {}) {
      super(message);
      this.status = status;
      this.code = code;
      this.details = details;
    }
  }
  const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));
  return { ApiError, errorMessage, api: { checkFood: jest.fn(), createFood: jest.fn(), updateFood: jest.fn(), getFood: jest.fn(), addAlias: jest.fn(), removeAlias: jest.fn(), removeUnit: jest.fn() } };
});

import { api, ApiError } from '@/api/client';
import { copyText, pasteText } from '@/services/clipboard';
import { fieldName } from '@/utils/foodData';
import { checkFood as workerCheck } from '../../worker/src/domain/quality/foodChecks';
import type { Food, FoodCheck, FoodIssue, Meta } from '@/api/types';
import FoodEditorScreen from '@/screens/FoodEditorScreen';
import { useMeta } from '@/state/MetaContext';
import { ThemeProvider } from '@/theme';
import metaJson from './fixtures/meta.json';

const META = { units: [], meals: [], baseUnits: ['piece', 'katori', '100 g', '100 ml'], ...(metaJson as object) } as unknown as Meta;
const NUTRIENT_COUNT = META.nutrients.length;
const rn = jest.requireMock('@react-navigation/native') as { __nav: Record<string, jest.Mock>; useRoute: jest.Mock };
const nav = rn.__nav;
const api_ = api as unknown as Record<string, jest.Mock>;

const issue = (id: string, params: FoodIssue['params'], severity: FoodIssue['severity'], nutrient?: string): FoodIssue => ({ id, severity, params, ...(nutrient ? { nutrient } : {}) });
const TYPO = issue('calories_vs_macros', { calories: 500, expected: 50 }, 'warning', 'calories');
const IMPOSSIBLE = issue('sugar_over_carbs', { sugar: 14, carbs: 10 }, 'error', 'sugar');

async function render() {
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(
      <ThemeProvider>
        <FoodEditorScreen />
      </ThemeProvider>,
    );
  });
  return tree;
}

const textOf = (n: ReactTestInstance) => [n.props.children].flat(Infinity).filter(c => typeof c === 'string' || typeof c === 'number').join('');
const all = (tree: TestRenderer.ReactTestRenderer) => tree.root.findAll((n: ReactTestInstance) => (n.type as unknown) === 'Text').map(textOf).join('\n');
const byId = (tree: TestRenderer.ReactTestRenderer, id: string) => tree.root.findAll((n: ReactTestInstance) => n.props.testID === id);
const type = async (tree: TestRenderer.ReactTestRenderer, id: string, text: string) => {
  const input = byId(tree, id).find(n => typeof n.props.onChangeText === 'function');
  if (!input) throw new Error(`no input with testID ${id}`);
  await act(async () => {
    input.props.onChangeText(text);
  });
};
/** Lets the debounce run out and the check it starts finish. */
const settle = async () => {
  await act(async () => {
    jest.advanceTimersByTime(600);
  });
  await act(async () => {
    await Promise.resolve();
  });
};
const pressable = (tree: TestRenderer.ReactTestRenderer, id: string) =>
  tree.root.findAll((n: ReactTestInstance) => n.props.testID === id && typeof n.type !== 'string' && n.props.accessibilityRole !== undefined)[0];
const press = async (tree: TestRenderer.ReactTestRenderer, id: string) => {
  const node = pressable(tree, id);
  if (!node || typeof node.props.onPress !== 'function') throw new Error(`nothing pressable (or it is disabled) with testID ${id}`);
  await act(async () => {
    await node.props.onPress();
  });
};

const FOOD: Food = {
  id: 'f1',
  name: 'idli',
  displayName: 'Idli',
  baseUnit: 'piece',
  nutrients: { calories: 50, protein: 2, carbs: 10, fat: 0.2 } as Food['nutrients'],
  aliases: [],
  units: [],
  source: 'label',
  reviewedAt: '2026-10-01T08:00:00.000Z',
};

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  (useMeta as jest.Mock).mockReturnValue(META);
  rn.useRoute.mockReturnValue({ params: { name: 'Idli' } });
  api_.checkFood.mockResolvedValue({ errors: [], warnings: [] });
  api_.createFood.mockResolvedValue({ food: FOOD, resolvedCount: 0, warnings: [] });
  api_.updateFood.mockResolvedValue({ food: FOOD, resolvedCount: 0, repended: 0, warnings: [] });
  api_.getFood.mockResolvedValue(FOOD);
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(() => {
  jest.useRealTimers();
});

describe('the fields', () => {
  it('shows every nutrient at once, in groups, with nothing behind a "more" button', async () => {
    const t = all(await render());
    for (const name of ['Calories', 'Protein', 'Carbs', 'Fat', 'Saturated fat', 'Fiber', 'Sugar', 'Added sugars', 'Sodium']) expect(t).toContain(name);
    for (const name of ['Calcium', 'Iron', 'Potassium', 'Magnesium', 'Zinc']) expect(t).toContain(name);
    for (const name of ['Vitamin A', 'Vitamin B12', 'Vitamin C', 'Vitamin D', 'Vitamin E', 'Vitamin K', 'Folate']) expect(t).toContain(name);
    expect(t).not.toContain('More nutrients');
    for (const group of ['On a pack label', 'Minerals', 'Vitamins']) expect(t.toLowerCase()).toContain(group.toLowerCase());
  });

  it('names the amount once it is chosen, and says just "Nutrients" before', async () => {
    const tree = await render();
    expect(all(tree)).toContain('Nutrients');
    expect(all(tree)).not.toContain('Nutrients per');
    await pickPiece(tree);
    expect(all(tree)).toContain('Nutrients per 1 piece');
  });

  it('keeps a unit\'s note with the name, so the unit column holds only the unit', async () => {
    const tree = await render();
    expect(all(tree)).toContain('Folate (DFE)');
    const folate = byId(tree, 'nutrient-folate').find(n => typeof n.props.accessibilityLabel === 'string')!;
    expect(folate.props.accessibilityLabel).toBe('Folate (DFE) (mcg)');
  });

  it('says that a field left empty is saved as 0, and shows a 0 where the number goes, with no field required', async () => {
    const tree = await render();
    expect(all(tree)).toContain('Fill in what you know. A field left empty is saved as 0.');
    const calories = byId(tree, 'nutrient-calories').find(n => typeof n.props.onChangeText === 'function')!;
    expect(calories.props.placeholder).toBe('0');
    expect(all(tree)).not.toContain('Calories *');
    expect(all(tree)).not.toContain('Required');
  });

  it('counts the fields that hold a value, for the whole food and for each group', async () => {
    const tree = await render();
    expect(all(tree)).toContain(`0 of ${NUTRIENT_COUNT} filled`);
    await type(tree, 'nutrient-calories', '39');
    await type(tree, 'nutrient-protein', '1.9');
    await type(tree, 'nutrient-iron', '0.2');
    await type(tree, 'nutrient-zinc', '0'); // a typed 0 is not a value
    expect(all(tree)).toContain(`3 of ${NUTRIENT_COUNT} filled`);
    expect(all(tree)).toContain('2 of 9 filled'); // the pack label
    expect(all(tree)).toContain('1 of 5 filled'); // the minerals
    expect(all(tree)).toContain('0 of 7 filled'); // the vitamins
  });

  it('lets a group fold away to save scrolling, and keeps one with a mistake in it open', async () => {
    const tree = await render();
    const toggle = async (group: string) =>
      act(async () => {
        byId(tree, `group-${group}`).find(n => typeof n.props.onPress === 'function')!.props.onPress();
      });
    await toggle('vitamins');
    expect(byId(tree, 'nutrient-vitaminD')).toHaveLength(0);
    expect(byId(tree, 'nutrient-calories').length).toBeGreaterThan(0);
    await toggle('vitamins');
    expect(byId(tree, 'nutrient-vitaminD').length).toBeGreaterThan(0);

    // a mistake typed into a group that is then folded opens it again when the save finds it
    await type(tree, 'food-name', 'Test idli');
    await pickPiece(tree);
    await type(tree, 'nutrient-iron', 'lots');
    await toggle('minerals');
    expect(byId(tree, 'nutrient-iron')).toHaveLength(0);
    await press(tree, 'save-food');
    expect(byId(tree, 'nutrient-iron').length).toBeGreaterThan(0);
    expect(all(tree)).toContain('Enter a number');
    expect(api_.createFood).not.toHaveBeenCalled();
  });
});

describe('checking the numbers as they are typed (plan 7.4)', () => {
  it('asks the Worker once the numbers sit still, with only the numbers typed, and only after a base unit is chosen', async () => {
    const tree = await render();
    await type(tree, 'nutrient-calories', '500');
    await settle();
    expect(api_.checkFood).not.toHaveBeenCalled(); // no base unit yet
    await act(async () => {
      tree.root.findAll((n: ReactTestInstance) => n.props.label === '1 piece' && typeof n.props.onPress === 'function')[0]!.props.onPress();
    });
    await type(tree, 'nutrient-protein', '2');
    await type(tree, 'nutrient-carbs', '10');
    await type(tree, 'nutrient-fat', '0.2');
    await settle();
    expect(api_.checkFood).toHaveBeenCalledTimes(1); // one call for the burst of typing, not one per key
    expect(api_.checkFood).toHaveBeenCalledWith({ baseUnit: 'piece', nutrients: { calories: 500, protein: 2, carbs: 10, fat: 0.2 }, form: null, units: [] });
  });

  it('shows a probable typo as a question above the Save button, and does not block it', async () => {
    api_.checkFood.mockResolvedValue({ errors: [], warnings: [TYPO] });
    const tree = await render();
    await pickPiece(tree);
    await type(tree, 'nutrient-calories', '500');
    await settle();
    expect(byId(tree, 'food-warnings').length).toBeGreaterThan(0);
    expect(all(tree)).toContain('Please check before saving');
    expect(all(tree)).toContain('Protein, carbohydrate and fat suggest about 50 kcal, but the calories say 500.');
    expect(pressable(tree, 'save-food')!.props.disabled).toBeFalsy();
  });

  it('blocks the save when the numbers cannot all be true, and says why', async () => {
    api_.checkFood.mockResolvedValue({ errors: [IMPOSSIBLE], warnings: [] });
    const tree = await render();
    await pickPiece(tree);
    await type(tree, 'nutrient-calories', '80');
    await settle();
    expect(byId(tree, 'food-errors').length).toBeGreaterThan(0);
    expect(all(tree)).toContain('Sugars (14 g) are more than carbohydrate (10 g). Sugars are part of carbohydrate.');
    expect(pressable(tree, 'save-food')!.props.disabled).toBe(true);
    expect(api_.createFood).not.toHaveBeenCalled();
  });

  it('says nothing, and asks nothing, when no number is typed', async () => {
    const tree = await render();
    await pickPiece(tree);
    await settle();
    expect(api_.checkFood).not.toHaveBeenCalled();
    expect(byId(tree, 'food-warnings')).toHaveLength(0);
  });

  it('keeps the save usable when the check itself cannot be reached', async () => {
    api_.checkFood.mockRejectedValue(new Error('offline'));
    const tree = await render();
    await pickPiece(tree);
    await type(tree, 'nutrient-calories', '50');
    await settle();
    expect(byId(tree, 'food-errors')).toHaveLength(0);
    expect(pressable(tree, 'save-food')!.props.disabled).toBeFalsy();
  });
});

async function pickPiece(tree: TestRenderer.ReactTestRenderer) {
  await act(async () => {
    tree.root.findAll((n: ReactTestInstance) => n.props.label === '1 piece' && typeof n.props.onPress === 'function')[0]!.props.onPress();
  });
}
const fill = async (tree: TestRenderer.ReactTestRenderer) => {
  await type(tree, 'food-name', 'Test idli');
  await pickPiece(tree);
  await type(tree, 'nutrient-calories', '500');
  await type(tree, 'nutrient-protein', '2');
};

/** Every nutrient as a save sends it: what was typed, and 0 for the rest. */
const zeroed = (typed: Record<string, number>) => Object.fromEntries(META.nutrients.map(n => [n.key, typed[n.key] ?? 0]));

describe('saving', () => {
  it('re-checks the numbers as they will be saved (the empty ones as 0), then saves them with their source', async () => {
    const tree = await render();
    await fill(tree);
    await act(async () => {
      tree.root.findAll((n: ReactTestInstance) => n.props.testID === 'source-label' && typeof n.props.onPress === 'function')[0]!.props.onPress();
    });
    await press(tree, 'save-food');
    expect(api_.checkFood).toHaveBeenLastCalledWith({ baseUnit: 'piece', nutrients: zeroed({ calories: 500, protein: 2 }), form: null, units: [] });
    expect(api_.createFood).toHaveBeenCalledWith({ displayName: 'Test idli', baseUnit: 'piece', nutrients: zeroed({ calories: 500, protein: 2 }), source: 'label' });
    expect(nav.goBack).toHaveBeenCalled();
  });

  it('saves every field left empty as 0, not as unknown: a person fills in only what they know', async () => {
    const tree = await render();
    await fill(tree);
    await press(tree, 'save-food');
    const sent = api_.createFood.mock.calls[0]![0].nutrients as Record<string, unknown>;
    expect(Object.keys(sent).sort()).toEqual(META.nutrients.map(n => n.key).sort());
    expect(Object.values(sent).every(v => typeof v === 'number')).toBe(true); // never null
    expect(sent).toMatchObject({ calories: 500, protein: 2, carbs: 0, vitaminB12: 0, zinc: 0 });
  });

  it('asks nothing about the calories and macros when the macros were left empty: a few numbers are enough', async () => {
    // the Worker would compare 500 kcal with 8 kcal from protein alone; the macros were not typed, so it is not a claim
    api_.checkFood.mockResolvedValue({ errors: [], warnings: [TYPO] });
    const tree = await render();
    await fill(tree);
    await press(tree, 'save-food');
    expect((Alert.alert as jest.Mock).mock.calls.map(c => c[0])).toEqual(['Food added']); // no question first: it went straight through
    expect(api_.createFood).toHaveBeenCalledTimes(1);
    expect(byId(tree, 'food-warnings')).toHaveLength(0);
  });

  it('asks before saving a probable typo, and saves only if the person says so', async () => {
    api_.checkFood.mockResolvedValue({ errors: [], warnings: [TYPO] });
    const tree = await render();
    await fill(tree);
    // every macro is typed now, so the comparison with the calories is a claim
    await type(tree, 'nutrient-carbs', '10');
    await type(tree, 'nutrient-fat', '0.2');
    await press(tree, 'save-food');
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    const [title, body, buttons] = (Alert.alert as jest.Mock).mock.calls[0]!;
    expect(title).toBe('Save with these warnings?');
    expect(body).toContain('suggest about 50 kcal, but the calories say 500');
    expect(body).toContain('shared with everyone');
    expect(api_.createFood).not.toHaveBeenCalled();
    expect(buttons.map((b: { text: string }) => b.text)).toEqual(['Cancel', 'Save anyway']);
    await act(async () => {
      await buttons[1].onPress();
    });
    expect(api_.createFood).toHaveBeenCalledTimes(1);
  });

  it('asks before saving a food with nothing in it: it would count as nothing', async () => {
    const tree = await render();
    await type(tree, 'food-name', 'Mystery');
    await pickPiece(tree);
    await press(tree, 'save-food');
    expect(api_.createFood).not.toHaveBeenCalled();
    const [title, body, buttons] = (Alert.alert as jest.Mock).mock.calls[0]!;
    expect(title).toBe('Save with these warnings?');
    expect(body).toContain('Every value is empty, so this food will count as 0 calories and 0 of everything. Is that right?');
    await act(async () => {
      await buttons[1].onPress();
    });
    expect(api_.createFood).toHaveBeenCalledWith({ displayName: 'Mystery', baseUnit: 'piece', nutrients: zeroed({}) });
  });

  it('asks about calories left empty beside protein, carbohydrate and fat: they would count as nothing', async () => {
    const tree = await render();
    await type(tree, 'food-name', 'Test idli');
    await pickPiece(tree);
    await type(tree, 'nutrient-protein', '5');
    await type(tree, 'nutrient-carbs', '20');
    await type(tree, 'nutrient-fat', '2');
    await press(tree, 'save-food');
    const [title, body] = (Alert.alert as jest.Mock).mock.calls[0]!;
    expect(title).toBe('Save with these warnings?');
    expect(body).toContain('Calories are 0, but protein, carbohydrate and fat suggest about 118 kcal. Please check the calories.');
    expect(api_.createFood).not.toHaveBeenCalled();
  });

  it('still refuses a typed value that is not a number, and says which field', async () => {
    const tree = await render();
    await fill(tree);
    await type(tree, 'nutrient-fiber', 'a lot');
    await press(tree, 'save-food');
    expect(api_.createFood).not.toHaveBeenCalled();
    expect(all(tree)).toContain('Enter a number');
    expect(all(tree)).toContain('Check the highlighted fields.');
  });

  it('takes the footer note away with the last highlighted field, and not before', async () => {
    const tree = await render();
    await fill(tree);
    await type(tree, 'nutrient-fiber', 'a lot');
    await type(tree, 'nutrient-sodium', 'plenty');
    await press(tree, 'save-food');
    expect(all(tree)).toContain('Check the highlighted fields.');
    await type(tree, 'nutrient-fiber', '3');
    expect(all(tree)).toContain('Check the highlighted fields.'); // one is still wrong
    await type(tree, 'nutrient-sodium', '120');
    expect(all(tree)).not.toContain('Check the highlighted fields.');
    expect(all(tree)).not.toContain('Enter a number');
  });

  it('leaves a different footer note alone when a field is fixed', async () => {
    api_.createFood.mockRejectedValue(new Error('The server said no'));
    const tree = await render();
    await fill(tree);
    await type(tree, 'nutrient-fiber', 'a lot');
    await press(tree, 'save-food'); // the field is wrong: nothing is sent
    await type(tree, 'nutrient-fiber', '3');
    await press(tree, 'save-food'); // now it is sent, and the server refuses
    expect(all(tree)).toContain('The server said no');
    await type(tree, 'nutrient-fiber', '4');
    expect(all(tree)).toContain('The server said no');
  });

  it('reads a decimal comma, as a phone set to a comma language types it', async () => {
    const tree = await render();
    await fill(tree);
    await type(tree, 'nutrient-fat', '0,2');
    await press(tree, 'save-food');
    expect(api_.createFood.mock.calls[0]![0].nutrients).toMatchObject({ fat: 0.2 });
  });

  it('leaves the source out when the person is not sure', async () => {
    const tree = await render();
    await fill(tree);
    await press(tree, 'save-food');
    expect(api_.createFood.mock.calls[0]![0]).not.toHaveProperty('source');
  });

  it('does not save when the final check finds numbers that cannot be true, even if the live check had not run', async () => {
    api_.checkFood.mockResolvedValue({ errors: [IMPOSSIBLE], warnings: [] });
    const tree = await render();
    await fill(tree);
    // the button is enabled until the live check has answered; the final check is what stops the save
    await press(tree, 'save-food');
    expect(api_.createFood).not.toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(byId(tree, 'food-errors').length).toBeGreaterThan(0);
  });

  it('shows what the Worker refused, when its own rules catch what the check did not', async () => {
    api_.createFood.mockRejectedValue(new ApiError(400, 'invalid_nutrients', 'These values cannot all be true: sugar_over_carbs', { issues: [IMPOSSIBLE] }));
    const tree = await render();
    await fill(tree);
    await press(tree, 'save-food');
    const t = all(tree);
    expect(t).toContain('These numbers cannot all be true, so the food was not saved.');
    expect(t).toContain('Sugars (14 g) are more than carbohydrate (10 g).');
    expect(nav.goBack).not.toHaveBeenCalled();
  });

  it('still saves when the final check cannot be reached: the Worker applies its own rules', async () => {
    const tree = await render();
    await fill(tree);
    api_.checkFood.mockRejectedValue(new Error('offline'));
    await press(tree, 'save-food');
    expect(api_.createFood).toHaveBeenCalledTimes(1);
  });
});

describe('editing a food', () => {
  beforeEach(() => rn.useRoute.mockReturnValue({ params: { foodId: 'f1' } }));

  it('shows where the numbers came from and when they were last saved', async () => {
    const tree = await render();
    const t = all(tree);
    expect(t).toContain('Where do these numbers come from?');
    expect(t).toContain('Numbers last saved 2026-10-01');
    expect(byId(tree, 'source-label').some(n => n.props.selected === true)).toBe(true);
  });

  it('sends the source only when it was changed', async () => {
    const tree = await render();
    await press(tree, 'save-food');
    expect(api_.updateFood.mock.calls[0]![1]).not.toHaveProperty('source');
    await act(async () => {
      tree.root.findAll((n: ReactTestInstance) => n.props.testID === 'source-estimate' && typeof n.props.onPress === 'function')[0]!.props.onPress();
    });
    await press(tree, 'save-food');
    expect(api_.updateFood.mock.calls[1]![1]).toMatchObject({ source: 'estimate' });
  });

  it('can clear the source with "Not sure"', async () => {
    const tree = await render();
    await act(async () => {
      tree.root.findAll((n: ReactTestInstance) => n.props.testID === 'source-unsure' && typeof n.props.onPress === 'function')[0]!.props.onPress();
    });
    await press(tree, 'save-food');
    expect(api_.updateFood.mock.calls[0]![1]).toMatchObject({ source: null });
  });

  it('says so when no source was ever recorded', async () => {
    api_.getFood.mockResolvedValue({ ...FOOD, source: null, reviewedAt: null });
    expect(all(await render())).toContain('No source recorded');
  });

  it('shows a conversion of a per-100 g food in grams', async () => {
    api_.getFood.mockResolvedValue({ ...FOOD, baseUnit: '100 g', units: [{ unit: 'katori', servings: 1.5 }, { unit: 'piece', servings: 0.25 }] });
    const t = all(await render());
    expect(t).toContain('1 katori = 150 g');
    expect(t).toContain('1 piece = 25 g');
  });
});

describe('raw or as eaten (plan 7.7)', () => {
  const choose = async (tree: TestRenderer.ReactTestRenderer, id: string) =>
    act(async () => {
      tree.root.findAll((n: ReactTestInstance) => n.props.testID === id && typeof n.props.onPress === 'function')[0]!.props.onPress();
    });

  it('asks whether the numbers are for the food as eaten or raw, and says why it matters', async () => {
    const t = all(await render());
    expect(t).toContain('The numbers are for the food');
    expect(t).toContain('Cooked rice has about a third of the energy of dry rice, gram for gram.');
    expect(t).toContain('Raw or dry, before cooking');
  });

  it('checks and saves the choice with the numbers', async () => {
    const tree = await render();
    await fill(tree);
    await choose(tree, 'form-raw');
    await settle();
    expect(api_.checkFood).toHaveBeenLastCalledWith(expect.objectContaining({ form: 'raw' }));
    await press(tree, 'save-food');
    expect(api_.createFood.mock.calls[0]![0]).toMatchObject({ form: 'raw' });
  });

  it('leaves it out when the person is not sure, and on an edit sends it only when it changed', async () => {
    const created = await render();
    await fill(created);
    await press(created, 'save-food');
    expect(api_.createFood.mock.calls[0]![0]).not.toHaveProperty('form');

    rn.useRoute.mockReturnValue({ params: { foodId: 'f1' } });
    api_.getFood.mockResolvedValue({ ...FOOD, form: 'as_eaten', units: [{ unit: 'katori', servings: 1.5 }] });
    const tree = await render();
    expect(byId(tree, 'form-as_eaten').some(n => n.props.selected === true)).toBe(true);
    await press(tree, 'save-food');
    expect(api_.updateFood.mock.calls[0]![1]).not.toHaveProperty('form');
    await choose(tree, 'form-raw');
    await settle();
    // the conversions already stored go with the check, so a katori of a raw food is asked about before saving
    expect(api_.checkFood).toHaveBeenLastCalledWith(expect.objectContaining({ form: 'raw', units: [{ unit: 'katori', servings: 1.5 }] }));
    await press(tree, 'save-food');
    expect(api_.updateFood.mock.calls[1]![1]).toMatchObject({ form: 'raw' });
  });

  it('words the Worker\'s question about a raw food in a cooked helping', async () => {
    api_.checkFood.mockResolvedValue({ errors: [], warnings: [issue('raw_serving_unit', { unit: 'katori' }, 'warning')] });
    const tree = await render();
    await fill(tree);
    await settle();
    expect(all(tree)).toContain('These numbers are for raw or dry food, but a katori is usually measured cooked.');
  });
});

describe('editing a food that has unknown or zero values', () => {
  beforeEach(() => rn.useRoute.mockReturnValue({ params: { foodId: 'f1' } }));
  const input = (tree: TestRenderer.ReactTestRenderer, id: string) => byId(tree, id).find(n => typeof n.props.onChangeText === 'function')!;
  /** A food from before empty meant 0: only these four are known; iron and zinc say so. */
  const OLD: Food = { ...FOOD, nutrients: { ...FOOD.nutrients, iron: null, zinc: 0, calcium: 12 } as Food['nutrients'] };

  it('shows an unknown value and a zero as an empty field, and says which are unknown, not 0', async () => {
    api_.getFood.mockResolvedValue(OLD);
    const tree = await render();
    expect(input(tree, 'nutrient-calories').props.value).toBe('50');
    expect(input(tree, 'nutrient-calcium').props.value).toBe('12');
    expect(input(tree, 'nutrient-iron').props.value).toBe('');
    expect(input(tree, 'nutrient-zinc').props.value).toBe('');
    expect(byId(tree, 'nutrient-iron').find(n => n.props.placeholder !== undefined)!.props.placeholder).toBe('Unknown'); // nobody has given it a value
    expect(byId(tree, 'nutrient-zinc').find(n => n.props.placeholder !== undefined)!.props.placeholder).toBe('0'); // it is known to be 0
    expect(all(tree)).toContain('except the ones marked Unknown');
  });

  it('keeps what nobody knows unknown when it is saved, so saving one value does not rewrite the rest of a shared food', async () => {
    const tree = await render();
    await type(tree, 'nutrient-iron', '2.5'); // the one value the person knew
    await press(tree, 'save-food');
    const sent = api_.updateFood.mock.calls[0]![1].nutrients as Record<string, number | null>;
    expect(Object.keys(sent)).toHaveLength(NUTRIENT_COUNT);
    expect(sent).toMatchObject({ calories: 50, protein: 2, carbs: 10, fat: 0.2, iron: 2.5 });
    // everything else was unknown and is still empty: still unknown, never 0
    for (const key of META.nutrients.map(n => n.key).filter(k => !['calories', 'protein', 'carbs', 'fat', 'iron'].includes(k))) expect([key, sent[key]]).toEqual([key, null]);
  });

  it('turns a value that was there and is emptied into 0: empty means 0 for what is known', async () => {
    const tree = await render();
    await type(tree, 'nutrient-protein', '');
    await press(tree, 'save-food');
    const sent = api_.updateFood.mock.calls[0]![1].nutrients as Record<string, number | null>;
    expect(sent).toMatchObject({ calories: 50, protein: 0, carbs: 10, fat: 0.2 });
    expect(sent.iron).toBeNull();
  });

  it('asks the Worker about the numbers with the unknown ones left unknown, so they are never read as 0', async () => {
    const tree = await render();
    await press(tree, 'save-food');
    const asked = api_.checkFood.mock.calls.at(-1)![0].nutrients as Record<string, number | null>;
    expect(asked).toMatchObject({ calories: 50, protein: 2, iron: null, vitaminB12: null });
  });

  it('does not ask "is that right?" about a food whose only values are the ones it had', async () => {
    const tree = await render();
    await press(tree, 'save-food');
    expect((Alert.alert as jest.Mock).mock.calls.map(c => c[0])).not.toContain('Save with these warnings?');
  });

  it('shows no Unknown marks for a food every value of which is known', async () => {
    api_.getFood.mockResolvedValue({ ...FOOD, nutrients: Object.fromEntries(META.nutrients.map(n => [n.key, 1])) as Food['nutrients'] });
    const tree = await render();
    expect(all(tree)).not.toContain('except the ones marked Unknown');
    expect(byId(tree, 'nutrient-iron').find(n => n.props.placeholder !== undefined)!.props.placeholder).toBe('0');
  });

  it('keeps the fields unknown when the unit it is per changes: the numbers are per the new unit, and what nobody knew is still unknown', async () => {
    const tree = await render();
    await act(async () => {
      tree.root.findAll((n: ReactTestInstance) => n.props.label === '1 katori' && typeof n.props.onPress === 'function')[0]!.props.onPress();
    });
    await press(tree, 'save-food');
    // the "change the unit?" question comes first; the person says yes
    const [, , buttons] = (Alert.alert as jest.Mock).mock.calls.at(-1)!;
    await act(async () => {
      await buttons[1].onPress();
    });
    const patch = api_.updateFood.mock.calls[0]![1];
    expect(patch.baseUnit).toBe('katori');
    expect(patch.nutrients.iron).toBeNull(); // sent as null, so the old numbers (for the old unit) are not left behind
  });
});

describe('the Worker\'s own rules, not a mock of them', () => {
  // `checkFood` answers with the Worker's real checks, so what the screen does with a partly filled food is what the app does.
  beforeEach(() => {
    rn.useRoute.mockReturnValue({ params: {} });
    api_.checkFood.mockImplementation(async (input: any) => workerCheck({ baseUnit: input.baseUnit, nutrients: input.nutrients, units: input.units, form: input.form }));
  });

  it('saves a food with its fibre and sugars filled in and its carbohydrate left empty', async () => {
    const tree = await render();
    await type(tree, 'food-name', 'Moong cheela');
    await pickPiece(tree);
    await type(tree, 'nutrient-calories', '100');
    await type(tree, 'nutrient-fiber', '3');
    await type(tree, 'nutrient-sugar', '2');
    await press(tree, 'save-food');
    expect(api_.createFood).toHaveBeenCalledTimes(1);
    expect(api_.createFood.mock.calls[0]![0].nutrients).toMatchObject({ calories: 100, fiber: 3, sugar: 2, carbs: 0 });
    expect(byId(tree, 'food-errors')).toHaveLength(0);
    expect(pressable(tree, 'save-food')!.props.disabled).toBeFalsy();
  });

  it('saves a pasted food with "carbs_g": null beside a fibre, which is the same case', async () => {
    const tree = await render();
    await type(tree, 'food-name', 'Moong cheela');
    await act(async () => {
      tree.root.findAll((n: ReactTestInstance) => n.props.accessibilityLabel === 'Paste data' && typeof n.props.onPress === 'function')[0]!.props.onPress();
    });
    await type(tree, 'paste-box', '{"per": "piece", "calories_kcal": 100, "carbs_g": null, "fiber_g": 3}');
    await press(tree, 'fill-form');
    await press(tree, 'save-food');
    expect(api_.createFood).toHaveBeenCalledTimes(1);
  });

  it('still blocks numbers that cannot be true when both were typed: sugars above the carbohydrate', async () => {
    const tree = await render();
    await type(tree, 'food-name', 'Syrup');
    await pickPiece(tree);
    await type(tree, 'nutrient-calories', '80');
    await type(tree, 'nutrient-carbs', '10');
    await type(tree, 'nutrient-sugar', '14');
    await press(tree, 'save-food');
    expect(api_.createFood).not.toHaveBeenCalled();
    expect(all(tree)).toContain('Sugars (14 g) are more than carbohydrate (10 g).');
  });
});

describe('pressing Save', () => {
  beforeEach(() => rn.useRoute.mockReturnValue({ params: {} }));

  it('cannot be done twice: the button is busy from the first press until the numbers are checked, so one food is made once', async () => {
    let answer!: (v: FoodCheck) => void;
    api_.checkFood.mockImplementation(() => new Promise<FoodCheck>(resolve => (answer = resolve)));
    const tree = await render();
    await fill(tree);
    const save = pressable(tree, 'save-food')!;
    let first!: Promise<void>;
    await act(async () => {
      first = save.props.onPress();
    });
    expect(pressable(tree, 'save-food')!.props.disabled).toBe(true);
    expect(pressable(tree, 'save-food')!.props.onPress).toBeUndefined();
    await act(async () => {
      answer({ errors: [], warnings: [] });
      await first;
    });
    expect(api_.createFood).toHaveBeenCalledTimes(1);
  });

  it('is pressable again when the numbers cannot be true, so they can be fixed', async () => {
    api_.checkFood.mockResolvedValue({ errors: [IMPOSSIBLE], warnings: [] });
    const tree = await render();
    await fill(tree);
    await press(tree, 'save-food');
    await act(async () => {
      tree.root.findAll((n: ReactTestInstance) => n.props.testID === 'form-raw' && typeof n.props.onPress === 'function')[0]!.props.onPress();
    });
    await settle();
    api_.checkFood.mockResolvedValue({ errors: [], warnings: [] });
    await type(tree, 'nutrient-calories', '501');
    await settle();
    expect(pressable(tree, 'save-food')!.props.disabled).toBeFalsy();
  });

  it('shows a mistake until it is fixed, and no longer: typing in the field clears its message', async () => {
    const tree = await render();
    await fill(tree);
    await type(tree, 'nutrient-fiber', 'a lot');
    await press(tree, 'save-food');
    expect(all(tree)).toContain('Enter a number');
    await type(tree, 'nutrient-fiber', '3');
    expect(all(tree)).not.toContain('Enter a number');
  });

  it('clears the name\'s message when it is typed, and the unit\'s when it is chosen', async () => {
    const tree = await render();
    await press(tree, 'save-food');
    expect(all(tree)).toContain('Enter a name');
    expect(all(tree)).toContain('Pick what the values are per');
    await type(tree, 'food-name', 'Idli');
    expect(all(tree)).not.toContain('Enter a name');
    await pickPiece(tree);
    expect(all(tree)).not.toContain('Pick what the values are per');
  });

  it('goes back to the fields when something in them is wrong, if the person was on the paste half, where it could not be seen', async () => {
    const tree = await render();
    await type(tree, 'food-name', 'Idli');
    await pickPiece(tree);
    await type(tree, 'nutrient-fiber', 'a lot');
    await act(async () => {
      tree.root.findAll((n: ReactTestInstance) => n.props.accessibilityLabel === 'Paste data' && typeof n.props.onPress === 'function')[0]!.props.onPress();
    });
    expect(byId(tree, 'paste-box').length).toBeGreaterThan(0);
    await press(tree, 'save-food');
    expect(byId(tree, 'paste-box')).toHaveLength(0);
    expect(byId(tree, 'nutrient-fiber').length).toBeGreaterThan(0);
    expect(all(tree)).toContain('Enter a number');
  });
});

describe('pasting data', () => {
  const REPLY = '```json\n{\n  "name": "Dal",\n  "per": "katori",\n  "form": "as_eaten",\n  "source": "estimate",\n  "calories_kcal": 150,\n  "protein_g": 9,\n  "carbs_g": 20,\n  "fat_g": 3,\n  "fiber_g": 4,\n  "iron_mg": 2.5,\n  "vitamin_b12_mcg": null\n}\n```';
  const field = (tree: TestRenderer.ReactTestRenderer, id: string) => byId(tree, id).find(n => typeof n.props.onChangeText === 'function')!.props.value as string;
  const goPaste = async (tree: TestRenderer.ReactTestRenderer) =>
    act(async () => {
      tree.root.findAll((n: ReactTestInstance) => n.props.accessibilityLabel === 'Paste data' && typeof n.props.onPress === 'function')[0]!.props.onPress();
    });
  const chosen = (tree: TestRenderer.ReactTestRenderer, label: string) =>
    tree.root.findAll((n: ReactTestInstance) => n.props.label === label && n.props.selected === true).length > 0;

  beforeEach(() => rn.useRoute.mockReturnValue({ params: {} }));

  it('offers two ways to enter a food, and starts with typing', async () => {
    const tree = await render();
    expect(all(tree)).toContain('Enter manually');
    expect(all(tree)).toContain('Paste data');
    expect(byId(tree, 'paste-box')).toHaveLength(0);
    expect(byId(tree, 'nutrient-calories').length).toBeGreaterThan(0);
    await goPaste(tree);
    expect(byId(tree, 'paste-box').length).toBeGreaterThan(0);
    expect(byId(tree, 'nutrient-calories')).toHaveLength(0);
  });

  describe('the prompt', () => {
    it('copies a ready-to-use prompt that carries the food and asks for every field the app reads', async () => {
      rn.useRoute.mockReturnValue({ params: { name: 'Masala dosa' } });
      const tree = await render();
      await goPaste(tree);
      await press(tree, 'copy-prompt');
      expect(copyText).toHaveBeenCalledTimes(1);
      const prompt = (copyText as jest.Mock).mock.calls[0]![0] as string;
      expect(prompt.endsWith('Food: Masala dosa')).toBe(true);
      for (const n of META.nutrients) expect(prompt).toContain(`"${fieldName(n)}": 0`);
      for (const name of ['calories_kcal', 'protein_g', 'saturated_fat_g', 'sodium_mg', 'vitamin_b12_mcg', 'folate_mcg', 'zinc_mg']) expect(prompt).toContain(`"${name}": 0`);
      expect(prompt).toContain('Use 0 for a nutrient the food does not contain or that you do not know.');
      expect(prompt).toContain('exactly one of: piece, katori, 100 g, 100 ml');
    });

    it('says it is copied, and says so if the phone will not copy', async () => {
      const tree = await render();
      await goPaste(tree);
      expect(all(tree)).toContain('Copy prompt');
      await press(tree, 'copy-prompt');
      expect(all(tree)).toContain('Prompt copied');
      (copyText as jest.Mock).mockReturnValueOnce(false);
      await press(tree, 'copy-prompt');
      expect(all(tree)).toContain('Could not copy the prompt.');
    });

    it('can be read before it is copied, and carries the unit already chosen', async () => {
      const tree = await render();
      await pickPiece(tree);
      await goPaste(tree);
      expect(byId(tree, 'prompt-text')).toHaveLength(0);
      await press(tree, 'toggle-prompt');
      const shown = byId(tree, 'prompt-text')[0]!;
      expect([shown.props.children].flat().join('')).toContain('Set "per" to "piece"');
      expect(all(tree)).toContain('Hide the prompt');
    });
  });

  describe('filling the form', () => {
    it('fills the name, what it is per, how it is eaten, where it came from and the numbers, then shows them to check', async () => {
      const tree = await render();
      await goPaste(tree);
      await type(tree, 'paste-box', REPLY);
      await press(tree, 'fill-form');
      // back on the form, filled in
      expect(byId(tree, 'paste-box')).toHaveLength(0);
      expect(field(tree, 'food-name')).toBe('Dal');
      expect(chosen(tree, '1 katori')).toBe(true);
      expect(byId(tree, 'form-as_eaten').some(n => n.props.selected === true)).toBe(true);
      expect(byId(tree, 'source-estimate').some(n => n.props.selected === true)).toBe(true);
      expect(field(tree, 'nutrient-calories')).toBe('150');
      expect(field(tree, 'nutrient-iron')).toBe('2.5');
      expect(field(tree, 'nutrient-vitaminB12')).toBe(''); // it said it did not know: empty, so 0
      expect(all(tree)).toContain('Filled in 7 values from the pasted data. Check them below, then save.');
      expect(all(tree)).toContain(`6 of ${NUTRIENT_COUNT} filled`); // seven were mentioned, but a null is not a value
    });

    it('makes the same food as typing the same numbers', async () => {
      const typed = await render();
      await fill(typed);
      await type(typed, 'food-name', 'Dal');
      await act(async () => {
        typed.root.findAll((n: ReactTestInstance) => n.props.label === '1 katori' && typeof n.props.onPress === 'function')[0]!.props.onPress();
      });
      for (const [id, v] of [['calories', '150'], ['protein', '9'], ['carbs', '20'], ['fat', '3'], ['fiber', '4'], ['iron', '2.5']]) await type(typed, `nutrient-${id}`, v!);
      // protein was 2 from `fill`; it is 9 now
      await act(async () => {
        typed.root.findAll((n: ReactTestInstance) => n.props.testID === 'form-as_eaten' && typeof n.props.onPress === 'function')[0]!.props.onPress();
        typed.root.findAll((n: ReactTestInstance) => n.props.testID === 'source-estimate' && typeof n.props.onPress === 'function')[0]!.props.onPress();
      });
      await press(typed, 'save-food');
      const typedCall = api_.createFood.mock.calls[0]![0];

      api_.createFood.mockClear();
      const pasted = await render();
      await goPaste(pasted);
      await type(pasted, 'paste-box', REPLY);
      await press(pasted, 'fill-form');
      await press(pasted, 'save-food');
      expect(api_.createFood.mock.calls[0]![0]).toEqual(typedCall);
    });

    it('keeps the name the person typed: items are matched by it, so pasted data only fills an empty name', async () => {
      rn.useRoute.mockReturnValue({ params: { name: 'My dal' } });
      const tree = await render();
      await goPaste(tree);
      await type(tree, 'paste-box', REPLY);
      await press(tree, 'fill-form');
      expect(field(tree, 'food-name')).toBe('My dal');
      expect(all(tree)).toContain('The data is for "Dal", but the name stays "My dal".');
    });

    it('only changes the fields the data mentions, so what was typed before stays', async () => {
      const tree = await render();
      await type(tree, 'nutrient-zinc', '1.2');
      await type(tree, 'nutrient-calories', '999');
      await goPaste(tree);
      await type(tree, 'paste-box', '{"calories_kcal": 40, "per": "piece"}');
      await press(tree, 'fill-form');
      expect(field(tree, 'nutrient-calories')).toBe('40');
      expect(field(tree, 'nutrient-zinc')).toBe('1.2');
      expect(chosen(tree, '1 piece')).toBe(true);
    });

    it('names what the data had that the app does not track, and does not mind', async () => {
      const tree = await render();
      await goPaste(tree);
      await type(tree, 'paste-box', '{"calories_kcal": 40, "caffeine_mg": 90}');
      await press(tree, 'fill-form');
      expect(all(tree)).toContain('Filled in 1 value from the pasted data.');
      expect(all(tree)).toContain('Left out, because this app does not track them: caffeine_mg.');
    });

    it('fills straight from the clipboard, and says when there is nothing on it', async () => {
      const tree = await render();
      await goPaste(tree);
      await press(tree, 'paste-clipboard');
      expect(all(tree)).toContain('There is nothing on the clipboard to paste.');
      (pasteText as jest.Mock).mockResolvedValueOnce(REPLY);
      await press(tree, 'paste-clipboard');
      expect(field(tree, 'nutrient-protein')).toBe('9');
      expect(field(tree, 'food-name')).toBe('Dal');
    });
  });

  describe('data that cannot be read', () => {
    it('says what is wrong, in a list, and fills nothing', async () => {
      const tree = await render();
      await goPaste(tree);
      await type(tree, 'paste-box', '{"per": "bowlful", "calories_kcal": "lots", "sodium_g": 1, "protein_g": -3}');
      await press(tree, 'fill-form');
      expect(byId(tree, 'paste-box').length).toBeGreaterThan(0); // still on the paste step, with the text where it was
      const problems = all(tree);
      expect(problems).toContain('This could not be read');
      expect(problems).toContain('"per" says "bowlful", which the app does not have. It must be one of: piece, katori, 100 g, 100 ml.');
      expect(problems).toContain('"calories_kcal" should be a number, but it says "lots".');
      expect(problems).toContain('"sodium_g" is in a different unit than the app reads. Use sodium_mg instead.');
      expect(problems).toContain('"protein_g" cannot be below 0, but it says -3.');
      expect(problems).toContain('Fix them in the box, or ask the assistant to answer again with the prompt.');
      // nothing was filled
      await act(async () => {
        tree.root.findAll((n: ReactTestInstance) => n.props.accessibilityLabel === 'Enter manually' && typeof n.props.onPress === 'function')[0]!.props.onPress();
      });
      expect(field(tree, 'nutrient-calories')).toBe('');
      expect(chosen(tree, '1 piece')).toBe(false);
    });

    it('says where a reply is cut off', async () => {
      const tree = await render();
      await goPaste(tree);
      await type(tree, 'paste-box', '{\n  "name": "Dal"\n  "calories_kcal": 150\n}');
      await press(tree, 'fill-form');
      expect(all(tree)).toContain('The data is cut off or has a typing slip on line 3');
    });

    it('says when the text has no data in it', async () => {
      const tree = await render();
      await goPaste(tree);
      await type(tree, 'paste-box', 'Sorry, I cannot help with that.');
      await press(tree, 'fill-form');
      expect(all(tree)).toContain('No nutrition data was found.');
    });

    it('does not offer to fill from an empty box, and clears the problems when the text is changed or cleared', async () => {
      const tree = await render();
      await goPaste(tree);
      expect(byId(tree, 'fill-form').find(n => n.props.accessibilityRole === 'button')!.props.disabled).toBe(true);
      await type(tree, 'paste-box', 'nothing useful');
      await press(tree, 'fill-form');
      expect(byId(tree, 'paste-problems').length).toBeGreaterThan(0);
      await type(tree, 'paste-box', '{"calories_kcal": 5}');
      expect(byId(tree, 'paste-problems')).toHaveLength(0);
      await type(tree, 'paste-box', 'nothing useful');
      await press(tree, 'fill-form');
      await press(tree, 'paste-clear');
      expect(byId(tree, 'paste-problems')).toHaveLength(0);
      expect(field(tree, 'paste-box')).toBe('');
    });

    it('lists the first few problems and counts the rest', async () => {
      const tree = await render();
      await goPaste(tree);
      const wrong = Array.from({ length: 8 }, (_, i) => `"x${i}": 1`).join(', ');
      const fields = ['protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'sugar_g', 'iron_mg', 'zinc_mg'].map(f => `"${f}": "n"`).join(', ');
      await type(tree, 'paste-box', `{${wrong}, ${fields}}`);
      await press(tree, 'fill-form');
      expect(all(tree)).toContain('2 more problems are not shown.');
    });
  });
});

describe('opened from the log screen', () => {
  const CREATED: Food = { ...FOOD, id: 'new1', name: 'khaman', displayName: 'Khaman' };
  beforeEach(() => {
    rn.useRoute.mockReturnValue({ params: { name: 'Khaman', forLog: { date: '2026-10-13' } } });
    api_.createFood.mockResolvedValue({ food: CREATED, resolvedCount: 0, warnings: [] });
  });

  it('starts from the name that was searched for, and says it will log the food', async () => {
    const tree = await render();
    expect(byId(tree, 'food-name').find(n => typeof n.props.onChangeText === 'function')!.props.value).toBe('Khaman');
    expect(pressable(tree, 'save-food')!.props.accessibilityLabel).toBe('Add food and log it');
  });

  it('goes back to the log screen with the new food, ready to log, and does not stop to say it was added', async () => {
    const tree = await render();
    await pickPiece(tree);
    await type(tree, 'nutrient-calories', '60');
    await type(tree, 'nutrient-protein', '4');
    await press(tree, 'save-food');
    expect(api_.createFood).toHaveBeenCalledTimes(1);
    expect(nav.navigate).toHaveBeenCalledWith(
      'AddItems',
      { date: '2026-10-13', addedFood: { foodId: 'new1', name: 'Khaman', quantity: 1, unit: 'piece', units: ['piece'] } },
      { merge: true, pop: true },
    );
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(nav.goBack).not.toHaveBeenCalled();
  });
});

it('keeps a failed edit load from creating a new food and offers retry', async () => {
  rn.useRoute.mockReturnValue({ params: { foodId: FOOD.id } });
  api_.getFood.mockRejectedValueOnce(new Error('Could not load food'));
  const tree = await render();
  expect(all(tree)).toContain('Retry');
  expect(pressable(tree, 'save-food')?.props.onPress).toBeUndefined();
  expect(api_.createFood).not.toHaveBeenCalled();
  const retry = tree.root.findAll(n => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function' && n.findAll(c => (c.type as unknown) === 'Text').some(c => textOf(c) === 'Retry'))[0]!;
  await act(async () => retry.props.onPress());
  expect(all(tree)).toContain('Also called');
  expect(api_.getFood).toHaveBeenCalledTimes(2);
});
