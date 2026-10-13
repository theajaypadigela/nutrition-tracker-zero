/**
 * The log screen: pick a meal, pick foods (the person's own first, for that meal), set the amounts, add them all. Rendered with the API
 * replaced and driven through its controls. The ranking itself is tested in `foodChoices.test.ts` and in the Worker; here it is the
 * behaviour a person sees: whose foods, for which meal, what happens when a food is not found, what is saved.
 */
import React from 'react';
import TestRenderer, { act, type ReactTestInstance } from 'react-test-renderer';

jest.mock('@react-navigation/native', () => {
  const react = jest.requireActual('react');
  const nav = { navigate: jest.fn(), goBack: jest.fn(), canGoBack: jest.fn(() => true), setParams: jest.fn() };
  return {
    useNavigation: () => nav,
    useIsFocused: () => true,
    useRoute: jest.fn(() => ({ params: {} })),
    useFocusEffect: (effect: () => void) => react.useEffect(effect, [effect]),
    __nav: nav,
  };
});
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/state/MetaContext', () => ({ useMeta: jest.fn() }));
jest.mock('@/api/client', () => ({
  api: { getFoodHistory: jest.fn(), listFoods: jest.fn(), addItems: jest.fn() },
  errorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)),
}));

import { api } from '@/api/client';
import type { Food, HistoryFood, Meal, MealHistory } from '@/api/types';
import { FoodPickerSheet } from '@/components/log/FoodPickerSheet';
import { UnitSheet } from '@/components/log/UnitSheet';
import AddItemsScreen from '@/screens/AddItemsScreen';
import { useMeta } from '@/state/MetaContext';
import { ThemeProvider } from '@/theme';

const META = {
  units: ['piece', 'slice', 'katori', 'bowl', 'plate', 'cup', 'glass', 'tbsp', 'tsp', 'serving', 'g', 'kg', 'ml', 'l'],
  baseUnits: ['piece', 'katori', '100 g'],
  meals: ['breakfast', 'lunch', 'snack', 'dinner'] as Meal[],
  nutrients: [],
};
const rn = jest.requireMock('@react-navigation/native') as { __nav: Record<string, jest.Mock>; useRoute: jest.Mock };
const nav = rn.__nav;
const api_ = api as unknown as Record<string, jest.Mock>;

const TODAY = '2026-10-13';
const at = (score: number, over: Partial<MealHistory> = {}): MealHistory => ({ days: Math.max(1, Math.round(score)), score, lastDate: '2026-10-12', quantity: 1, unit: 'piece', ...over });
function logged(name: string, meals: Partial<Record<Meal, MealHistory>>, over: Partial<HistoryFood> = {}): HistoryFood {
  const total = Object.values(meals).reduce((sum, m) => sum + m!.score, 0);
  return { foodId: null, name: name.toLowerCase(), displayName: name, days: 1, score: total, lastDate: '2026-10-12', quantity: 1, unit: 'piece', meals, ...over };
}
const food = (id: string, name: string, baseUnit: string, extra: Partial<Food> = {}): Food => ({
  id,
  name: name.toLowerCase(),
  displayName: name,
  baseUnit,
  nutrients: { calories: 100 },
  aliases: [],
  units: [],
  source: null,
  reviewedAt: null,
  ...extra,
});

/** A person who has breakfast of eggs (usually 2) and idli, lunch of rice and dal. */
const EGG_EATER: HistoryFood[] = [
  logged('Egg', { breakfast: at(8, { quantity: 2 }) }, { quantity: 2 }),
  logged('Idli', { breakfast: at(3, { quantity: 3 }) }, { quantity: 3, foodId: 'idli', name: 'idli' }),
  logged('Rice', { lunch: at(7, { quantity: 1, unit: 'katori' }) }, { unit: 'katori', foodId: 'rice', name: 'rice' }),
  logged('Dal', { lunch: at(5, { quantity: 1, unit: 'katori' }) }, { unit: 'katori', name: 'dal' }),
];
const FOODS = [food('idli', 'Idli', 'piece'), food('rice', 'Rice', 'katori', { units: [{ unit: 'bowl', servings: 2 }] })];

const textOf = (n: ReactTestInstance): string => [n.props.children].flat(Infinity).filter(c => typeof c === 'string' || typeof c === 'number').join('');
const all = (tree: TestRenderer.ReactTestRenderer) => tree.root.findAll((n: ReactTestInstance) => (n.type as unknown) === 'Text').map(textOf).join('\n');
const byId = (tree: TestRenderer.ReactTestRenderer, id: string) => tree.root.findAll((n: ReactTestInstance) => n.props.testID === id);
const pressable = (tree: TestRenderer.ReactTestRenderer, id: string) =>
  tree.root.findAll((n: ReactTestInstance) => n.props.testID === id && typeof n.type !== 'string' && n.props.accessibilityRole !== undefined)[0];
const press = async (tree: TestRenderer.ReactTestRenderer, id: string) => {
  const node = pressable(tree, id);
  if (!node || typeof node.props.onPress !== 'function') throw new Error(`nothing pressable (or it is disabled) with testID ${id}`);
  await act(async () => {
    await node.props.onPress();
  });
};
const type = async (tree: TestRenderer.ReactTestRenderer, id: string, text: string) => {
  const input = byId(tree, id).find(n => typeof n.props.onChangeText === 'function');
  if (!input) throw new Error(`no input with testID ${id}`);
  await act(async () => {
    input.props.onChangeText(text);
  });
};
const value = (tree: TestRenderer.ReactTestRenderer, id: string) => byId(tree, id).find(n => typeof n.props.onChangeText === 'function')!.props.value as string;
const labelled = (tree: TestRenderer.ReactTestRenderer, label: string) =>
  tree.root.findAll((n: ReactTestInstance) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0];
const mealSelected = (tree: TestRenderer.ReactTestRenderer) =>
  (['breakfast', 'lunch', 'snack', 'dinner'] as Meal[]).filter(m => pressable(tree, `meal-${m}`)!.props.accessibilityState.checked);

async function render(params: Record<string, unknown> = { date: TODAY }) {
  rn.useRoute.mockReturnValue({ params });
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(
      <ThemeProvider>
        <AddItemsScreen />
      </ThemeProvider>,
    );
  });
  return tree;
}
/** Whether a sheet is open: its own `visible`, since a closing sheet stays on screen until its animation ends. */
const isOpen = (tree: TestRenderer.ReactTestRenderer, sheet: React.ComponentType<any>) => tree.root.findAll((n: ReactTestInstance) => n.type === sheet)[0]!.props.visible === true;
/** A pressable shows up as more than one node (the component and what it wraps) with the same testID: one of each, in order. */
const uniqueBy = (nodes: ReactTestInstance[]) => {
  const seen = new Set<string>();
  return nodes.filter(n => !seen.has(n.props.testID) && seen.add(n.props.testID));
};
/** The foods the quick chips offer, in order. */
const chips = (tree: TestRenderer.ReactTestRenderer) =>
  uniqueBy(
    tree.root.findAll((n: ReactTestInstance) => typeof n.props.testID === 'string' && n.props.testID.startsWith('quick-') && typeof n.type !== 'string' && n.props.accessibilityRole === 'button'),
  ).map(n => n.props.accessibilityLabel as string);
/** The rows to add, as "name amount unit". */
const rowsOf = (tree: TestRenderer.ReactTestRenderer) =>
  tree.root
    .findAll((n: ReactTestInstance) => typeof n.props.testID === 'string' && /^row-r\d+$/.test(n.props.testID) && typeof n.type === 'string')
    .map(n => n.props.testID.slice(4) as string)
    .map(id => `${textOf(byId(tree, `remove-${id}`)[0]!.parent!.parent!.findAll((t: ReactTestInstance) => (t.type as unknown) === 'Text')[0]!)} ${value(tree, `qty-${id}`)} ${textOf(byId(tree, `unit-${id}`)[0]!.findAll((t: ReactTestInstance) => (t.type as unknown) === 'Text')[0]!)}`);

function at_(hour: number, minute = 0) {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(2026, 9, 13, hour, minute, 0));
}

beforeEach(() => {
  jest.clearAllMocks();
  at_(8, 30);
  (useMeta as jest.Mock).mockReturnValue(META);
  api_.getFoodHistory.mockResolvedValue({ asOf: TODAY, windowDays: 180, halfLifeDays: 21, foods: EGG_EATER });
  api_.listFoods.mockResolvedValue(FOODS);
  api_.addItems.mockResolvedValue([]);
});
afterEach(() => {
  jest.useRealTimers();
});

describe('the meal', () => {
  it.each([
    [8, 30, 'breakfast'],
    [13, 0, 'lunch'],
    [16, 45, 'snack'],
    [20, 15, 'dinner'],
  ])('starts on the meal that fits the time of day: %i:%i is %s', async (hour, minute, meal) => {
    at_(hour!, minute!);
    expect(mealSelected(await render())).toEqual([meal]);
  });

  it('starts on the meal it was opened for, whatever the time', async () => {
    expect(mealSelected(await render({ date: TODAY, meal: 'dinner' }))).toEqual(['dinner']);
  });

  it('starts on no meal when opened for the "Other" group, whose items have none', async () => {
    const tree = await render({ date: TODAY, meal: null });
    expect(mealSelected(tree)).toEqual([]);
    expect(all(tree)).toContain('No meal chosen: these are listed under Other.');
  });

  it('can be cleared by tapping the chosen meal again: the foods offered are then the person\'s most logged, and they are saved with no meal', async () => {
    const tree = await render();
    await press(tree, 'meal-breakfast');
    expect(mealSelected(tree)).toEqual([]);
    expect(all(tree)).toContain('Your most logged foods');
    expect(chips(tree).slice(0, 3)).toEqual(['Egg', 'Rice', 'Dal']); // by score over every meal
    await press(tree, 'quick-name:egg');
    await press(tree, 'save-items');
    expect(api_.addItems.mock.calls[0]![1]).toEqual([{ name: 'Egg', quantity: 2, unit: 'piece', meal: null }]);
    expect(pressable(tree, 'save-items')!.props.accessibilityLabel).toBe('Add 1 item'); // no meal to name
  });

  it('shows the common foods of every meal, and says so, for a person with no history who chose no meal', async () => {
    api_.getFoodHistory.mockResolvedValue({ asOf: TODAY, windowDays: 180, halfLifeDays: 21, foods: [] });
    api_.listFoods.mockResolvedValue([]);
    const tree = await render({ date: TODAY, meal: null });
    expect(all(tree)).toContain('Common foods');
    expect(chips(tree).length).toBeGreaterThan(5);
  });

  it('is one tap to change, and changes the foods on offer', async () => {
    const tree = await render();
    expect(chips(tree).slice(0, 2)).toEqual(['Egg', 'Idli']);
    await press(tree, 'meal-lunch');
    expect(mealSelected(tree)).toEqual(['lunch']);
    expect(chips(tree).slice(0, 2)).toEqual(['Rice', 'Dal']);
  });
});

describe('the foods on offer', () => {
  it('are this person\'s own foods for the meal, best first, with their usual amounts', async () => {
    const tree = await render();
    expect(all(tree)).toContain('Your usual breakfast');
    expect(chips(tree)).toEqual(['Egg', 'Idli']);
    expect(all(tree)).not.toContain('Common at breakfast');
  });

  it('are what many people have at the meal, only when this person has nothing logged for it', async () => {
    const tree = await render();
    await press(tree, 'meal-dinner');
    expect(all(tree)).toContain('Common at dinner');
    expect(chips(tree)[0]).toBe('Roti');
    expect(chips(tree)).not.toContain('Egg');
  });

  it('are the common foods for someone with no history at all', async () => {
    api_.getFoodHistory.mockResolvedValue({ asOf: TODAY, windowDays: 180, halfLifeDays: 21, foods: [] });
    api_.listFoods.mockResolvedValue([]);
    const tree = await render();
    expect(all(tree)).toContain('Common at breakfast');
    expect(chips(tree)).toEqual(['Idli', 'Dosa', 'Upma', 'Poha', 'Paratha', 'Bread', 'Boiled egg', 'Omelette']);
  });

  it('wait for the person\'s own list rather than show the common foods first', async () => {
    api_.getFoodHistory.mockReturnValue(new Promise(() => {}));
    const tree = await render();
    expect(chips(tree)).toEqual([]);
    expect(all(tree)).not.toContain('Common at breakfast');
  });

  it('still work when the log cannot be loaded (a Worker that is not updated yet, or offline): the common foods and the foods list', async () => {
    api_.getFoodHistory.mockRejectedValue(new Error('No such route'));
    const tree = await render();
    expect(all(tree)).toContain('Common at breakfast');
    expect(chips(tree)[0]).toBe('Idli');
    api_.listFoods.mockRejectedValue(new Error('offline'));
    const offline = await render();
    expect(chips(offline)[0]).toBe('Idli');
  });
});

describe('adding foods to the list', () => {
  it('is a tap on a chip, which fills in the amount this person usually has, and a second tap takes it out again', async () => {
    const tree = await render();
    await press(tree, 'quick-name:egg');
    await press(tree, 'quick-food:idli');
    expect(rowsOf(tree)).toEqual(['Egg 2 piece', 'Idli 3 piece']);
    expect(pressable(tree, 'quick-name:egg')!.props.accessibilityState.selected).toBe(true);
    await press(tree, 'quick-name:egg');
    expect(rowsOf(tree)).toEqual(['Idli 3 piece']);
    expect(all(tree)).toContain('1 to add');
  });

  it('starts a food the person has not logged at the common amount', async () => {
    api_.getFoodHistory.mockResolvedValue({ asOf: TODAY, windowDays: 180, halfLifeDays: 21, foods: [] });
    api_.listFoods.mockResolvedValue([]);
    const tree = await render();
    await press(tree, 'quick-common:idli');
    await press(tree, 'quick-common:upma');
    expect(rowsOf(tree)).toEqual(['Idli 2 piece', 'Upma 1 katori']);
    expect(chips(tree)).not.toContain('Coffee'); // only the first eight are chips; the rest are in the dropdown
  });

  it('uses the amount for the meal being logged, when a food is had in different amounts at different meals', async () => {
    api_.getFoodHistory.mockResolvedValue({
      asOf: TODAY,
      windowDays: 180,
      halfLifeDays: 21,
      foods: [logged('Idli', { breakfast: at(4, { quantity: 3 }), dinner: at(4, { quantity: 5 }) }, { quantity: 3 })],
    });
    const tree = await render();
    await press(tree, 'quick-name:idli');
    expect(rowsOf(tree)).toEqual(['Idli 3 piece']);
    const dinner = await render({ date: TODAY, meal: 'dinner' });
    await press(dinner, 'quick-name:idli');
    expect(rowsOf(dinner)).toEqual(['Idli 5 piece']);
  });

  it('says there is nothing yet, and cannot be added until there is', async () => {
    const tree = await render();
    expect(all(tree)).toContain('Nothing here yet. Tap a food above, or search for one.');
    expect(pressable(tree, 'save-items')!.props.disabled).toBe(true);
    expect(pressable(tree, 'save-items')!.props.accessibilityLabel).toBe('Add items');
  });

  it('says so, in the list, for a food nobody has values for yet', async () => {
    const tree = await render();
    await press(tree, 'quick-name:egg'); // logged, but no food of that name has values
    await press(tree, 'quick-food:idli');
    expect(all(tree)).toContain('No values yet');
    expect(all(tree).match(/No values yet/g)).toHaveLength(1);
  });
});

describe('the amount', () => {
  const withRow = async (chip = 'quick-name:egg') => {
    const tree = await render();
    await press(tree, chip);
    return tree;
  };

  it('moves by what is natural for the unit: a piece, half a katori, ten grams', async () => {
    const tree = await withRow(); // 2 piece
    await press(tree, 'more-r1');
    expect(value(tree, 'qty-r1')).toBe('3');
    await press(tree, 'less-r1');
    await press(tree, 'less-r1');
    expect(value(tree, 'qty-r1')).toBe('1');
    expect(pressable(tree, 'less-r1')!.props.disabled).toBe(true); // never below one step

    await press(tree, 'meal-lunch');
    await press(tree, 'quick-food:rice'); // 1 katori
    await press(tree, 'more-r2');
    expect(value(tree, 'qty-r2')).toBe('1.5');
  });

  it('can be typed, and a typed amount that is not above 0 is refused when the list is added', async () => {
    const tree = await withRow();
    await type(tree, 'qty-r1', '0');
    await press(tree, 'save-items');
    expect(api_.addItems).not.toHaveBeenCalled();
    expect(all(tree)).toContain('Must be above 0');
    expect(all(tree)).toContain('Check the highlighted amounts.');
    await type(tree, 'qty-r1', '2,5');
    expect(all(tree)).not.toContain('Must be above 0'); // fixing it clears it
    await press(tree, 'save-items');
    expect(api_.addItems.mock.calls[0]![1][0].quantity).toBe(2.5);
  });

  it('is in a unit the person picks from a list, with the ones the food already has first', async () => {
    const tree = await withRow('quick-food:idli'); // idli: per piece
    await press(tree, 'meal-lunch');
    await press(tree, 'quick-food:rice'); // rice: per katori, and bowl
    await press(tree, 'unit-r2');
    const text = all(tree);
    expect(text).toContain('Set up for this food');
    expect(text).toContain('All units');
    await press(tree, 'unit-choice-bowl');
    expect(rowsOf(tree)).toEqual(['Idli 3 piece', 'Rice 1 bowl']);
    expect(isOpen(tree, UnitSheet)).toBe(false);
  });

  it('may be a unit that is not in the list ("ladle", "handful"), kept as typed', async () => {
    const tree = await withRow();
    await press(tree, 'unit-r1');
    await type(tree, 'unit-other', 'handful');
    await press(tree, 'unit-other-use');
    expect(rowsOf(tree)).toEqual(['Egg 2 handful']);
    await press(tree, 'save-items');
    expect(api_.addItems.mock.calls[0]![1][0]).toMatchObject({ unit: 'handful' });
  });

  it('can be taken out with the remove button', async () => {
    const tree = await withRow();
    await act(async () => {
      labelled(tree, 'Remove Egg')!.props.onPress();
    });
    expect(rowsOf(tree)).toEqual([]);
  });
});

describe('the foods dropdown', () => {
  const open = async (tree: TestRenderer.ReactTestRenderer) => press(tree, 'open-picker');
  const rowsShown = (tree: TestRenderer.ReactTestRenderer) =>
    uniqueBy(tree.root.findAll((n: ReactTestInstance) => typeof n.props.testID === 'string' && n.props.testID.startsWith('pick-') && typeof n.type !== 'string' && n.props.accessibilityRole === 'button')).map(
      n => n.props.accessibilityLabel as string,
    );

  it('opens on this person\'s own foods for the meal, best first', async () => {
    const tree = await render();
    expect(isOpen(tree, FoodPickerSheet)).toBe(false);
    await open(tree);
    expect(isOpen(tree, FoodPickerSheet)).toBe(true);
    const text = all(tree);
    expect(text).toContain('Your usual breakfast');
    expect(text).toContain('Usually 2 piece');
    expect(rowsShown(tree).slice(0, 2)).toEqual(['Egg', 'Idli']);
    // what they log at other meals, then the foods list
    expect(text).toContain('Also logged by you');
    expect(rowsShown(tree)).toEqual(expect.arrayContaining(['Rice', 'Dal']));
  });

  it('shows what many people have at the meal, when this person has nothing logged for it', async () => {
    const tree = await render({ date: TODAY, meal: 'dinner' });
    await open(tree);
    expect(all(tree)).toContain('Common at dinner');
    expect(rowsShown(tree)[0]).toBe('Roti');
  });

  it('searches every food, nearest first, as the person types', async () => {
    const tree = await render();
    await open(tree);
    await type(tree, 'picker-search', 'ri');
    expect(rowsShown(tree)[0]).toBe('Rice');
    await type(tree, 'picker-search', 'IDL');
    expect(rowsShown(tree)).toEqual(['Idli']);
    expect(byId(tree, 'add-new-food').length).toBeGreaterThan(0); // "idl" is not a food: it can be added
    await type(tree, 'picker-search', 'idli');
    expect(byId(tree, 'add-new-food')).toHaveLength(0); // a food of exactly that name is there
  });

  it('adds the food that is picked, with its usual amount, and closes', async () => {
    const tree = await render();
    await open(tree);
    await press(tree, 'pick-name:dal');
    expect(isOpen(tree, FoodPickerSheet)).toBe(false);
    expect(rowsOf(tree)).toEqual(['Dal 1 katori']);
  });

  it('shows what is already in the list as added, and does not add it twice', async () => {
    const tree = await render();
    await press(tree, 'quick-name:egg');
    await open(tree);
    expect(pressable(tree, 'pick-name:egg')!.props.accessibilityLabel).toBe('Egg, added');
    expect(pressable(tree, 'pick-name:egg')!.props.onPress).toBeUndefined();
  });

  describe('a food that is not found', () => {
    it('can be added as a new food item: its name goes along, and the log screen is where it comes back to', async () => {
      const tree = await render();
      await open(tree);
      await type(tree, 'picker-search', 'moong dal cheela');
      expect(rowsShown(tree)).toEqual([]);
      expect(all(tree)).toContain('No match for "moong dal cheela"');
      expect(all(tree)).toContain('Add new food item');
      await press(tree, 'add-new-food');
      expect(nav.navigate).toHaveBeenCalledWith('FoodEditor', { name: 'moong dal cheela', forLog: { date: TODAY } });
      expect(isOpen(tree, FoodPickerSheet)).toBe(false);
    });

    it('is offered even when other foods match part of what was typed', async () => {
      const tree = await render();
      await open(tree);
      await type(tree, 'picker-search', 'ric');
      expect(rowsShown(tree)).toContain('Rice');
      expect(all(tree)).toContain('Add "ric" as a new food item');
    });

    it('can be logged by name without values, and is then saved and counts once its values are added', async () => {
      const tree = await render();
      await open(tree);
      await type(tree, 'picker-search', 'moong dal cheela');
      await press(tree, 'use-name');
      expect(rowsOf(tree)).toEqual(['moong dal cheela 1 serving']);
      expect(all(tree)).toContain('No values yet');
      await press(tree, 'save-items');
      expect(api_.addItems).toHaveBeenCalledWith(TODAY, [{ name: 'moong dal cheela', quantity: 1, unit: 'serving', meal: 'breakfast' }], undefined);
    });
  });

  it('is empty-handed, but not stuck, when nothing has loaded yet', async () => {
    api_.getFoodHistory.mockReturnValue(new Promise(() => {}));
    const tree = await render();
    await open(tree);
    expect(rowsShown(tree)).toEqual([]);
    await type(tree, 'picker-search', 'idli');
    expect(rowsShown(tree)).toEqual(['Idli']); // search works on the common foods meanwhile
  });
});

describe('a food made in the food form', () => {
  it('comes back as a param, goes straight into the list with its own unit, and is said so once', async () => {
    const tree = await render({
      date: TODAY,
      addedFood: { foodId: 'khaman1', name: 'Khaman', quantity: 1, unit: 'piece', units: ['piece'] },
    });
    expect(rowsOf(tree)).toEqual(['Khaman 1 piece']);
    expect(all(tree)).toContain('"Khaman" is added to your foods and to this list.');
    expect(nav.setParams).toHaveBeenCalledWith({ addedFood: undefined });
    expect(all(tree)).not.toContain('No values yet'); // it has its values
  });

  it('is in the dropdown from then on, and in the person\'s own foods once it has been logged', async () => {
    api_.listFoods.mockResolvedValue([...FOODS, food('khaman1', 'Khaman', 'piece')]);
    const tree = await render();
    await press(tree, 'open-picker');
    await type(tree, 'picker-search', 'khaman');
    expect(tree.root.findAll((n: ReactTestInstance) => n.props.testID === 'pick-food:khaman1').length).toBeGreaterThan(0);

    // after it has been logged for a snack it leads the snack list, as the person's own food
    api_.getFoodHistory.mockResolvedValue({
      asOf: TODAY,
      windowDays: 180,
      halfLifeDays: 21,
      foods: [...EGG_EATER, logged('Khaman', { snack: at(1, { quantity: 4 }) }, { foodId: 'khaman1', name: 'khaman', quantity: 4 })],
    });
    const later = await render({ date: TODAY, meal: 'snack' });
    expect(chips(later)[0]).toBe('Khaman');
    await press(later, 'quick-food:khaman1');
    expect(rowsOf(later)).toEqual(['Khaman 4 piece']);
  });
});

describe('a whole day in one go: each food keeps the meal it was added under', () => {
  it('saves breakfast foods for breakfast and lunch foods for lunch, whatever the tile says at the end', async () => {
    const tree = await render();
    await press(tree, 'quick-name:egg'); // breakfast
    await press(tree, 'meal-lunch');
    await press(tree, 'quick-food:rice'); // lunch
    await press(tree, 'meal-dinner');
    await press(tree, 'save-items');
    expect(api_.addItems.mock.calls[0]![1]).toEqual([
      { name: 'Egg', quantity: 2, unit: 'piece', meal: 'breakfast' },
      { name: 'Rice', quantity: 1, unit: 'katori', meal: 'lunch' },
    ]);
  });

  it('shows the list by meal once it has more than one, and plainly while it has one', async () => {
    const tree = await render();
    await press(tree, 'quick-name:egg');
    expect(byId(tree, 'group-breakfast')).toHaveLength(0); // one meal: no headings
    expect(pressable(tree, 'save-items')!.props.accessibilityLabel).toBe('Add 1 item to breakfast');
    await press(tree, 'meal-lunch');
    await press(tree, 'quick-food:rice');
    expect(byId(tree, 'group-breakfast').length).toBeGreaterThan(0);
    expect(byId(tree, 'group-lunch').length).toBeGreaterThan(0);
    expect(all(tree)).toMatch(/BREAKFAST|Breakfast/);
    expect(rowsOf(tree)).toEqual(['Egg 2 piece', 'Rice 1 katori']);
    expect(pressable(tree, 'save-items')!.props.accessibilityLabel).toBe('Add 2 items'); // not "to lunch": they are not all lunch
  });

  it('lists the meals in the order of the day, with the foods saved for no meal last, whatever order they were added in', async () => {
    const tree = await render({ date: TODAY, meal: 'dinner' });
    await press(tree, 'quick-common:roti'); // dinner
    await press(tree, 'meal-dinner'); // clear the meal
    await press(tree, 'open-picker');
    await press(tree, 'pick-food:idli'); // no meal
    await press(tree, 'meal-breakfast');
    await press(tree, 'quick-name:egg'); // breakfast
    const headings = tree.root
      .findAll((n: ReactTestInstance) => typeof n.props.testID === 'string' && /^group-/.test(n.props.testID) && typeof n.type === 'string')
      .map(n => n.props.testID as string);
    expect(headings).toEqual(['group-breakfast', 'group-dinner', 'group-other']);
    expect(rowsOf(tree)).toEqual(['Egg 2 piece', 'Roti 2 piece', 'Idli 3 piece']);
    await press(tree, 'save-items');
    // saved as shown
    expect(api_.addItems.mock.calls[0]![1].map((i: { name: string; meal: string | null }) => [i.name, i.meal])).toEqual([
      ['Egg', 'breakfast'],
      ['Roti', 'dinner'],
      ['Idli', null],
    ]);
  });

  it('lets the same food be added for two meals, and takes it out of one without touching the other', async () => {
    const tree = await render();
    await press(tree, 'quick-name:egg');
    await press(tree, 'meal-snack');
    expect(pressable(tree, 'quick-name:egg')).toBeUndefined(); // egg is not a chip for snack
    await press(tree, 'open-picker');
    await press(tree, 'pick-name:egg');
    expect(rowsOf(tree)).toEqual(['Egg 2 piece', 'Egg 2 piece']);
    // back on breakfast, the chip says it is added; tapping it takes out only the breakfast one
    await press(tree, 'meal-snack'); // clear
    await press(tree, 'meal-breakfast');
    expect(pressable(tree, 'quick-name:egg')!.props.accessibilityState.selected).toBe(true);
    await press(tree, 'quick-name:egg');
    expect(rowsOf(tree)).toEqual(['Egg 2 piece']);
    await press(tree, 'save-items');
    expect(api_.addItems.mock.calls[0]![1]).toEqual([{ name: 'Egg', quantity: 2, unit: 'piece', meal: 'snack' }]);
  });

  it('a food made in the food form goes in under the meal being shown', async () => {
    const tree = await render({ date: TODAY, meal: 'lunch', addedFood: { foodId: 'k', name: 'Khaman', quantity: 1, unit: 'piece', units: ['piece'] } });
    await press(tree, 'save-items');
    expect(api_.addItems.mock.calls[0]![1]).toEqual([{ name: 'Khaman', quantity: 1, unit: 'piece', meal: 'lunch' }]);
  });
});

describe('when the person\'s own foods cannot be loaded', () => {
  it('says so, rather than passing the common foods off as theirs, and tries again when asked', async () => {
    api_.getFoodHistory.mockRejectedValueOnce(new Error('No such route'));
    const tree = await render();
    expect(byId(tree, 'load-failed').length).toBeGreaterThan(0);
    expect(all(tree)).toContain('Your own foods could not be loaded, so this list may not be yours yet.');
    expect(all(tree)).toContain('Common at breakfast');
    api_.getFoodHistory.mockResolvedValue({ asOf: TODAY, windowDays: 180, halfLifeDays: 21, foods: EGG_EATER });
    await act(async () => {
      tree.root
        .findAll((n: ReactTestInstance) => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function' && n.findAll(t => (t.type as unknown) === 'Text' && textOf(t) === 'Try again').length > 0)[0]!
        .props.onPress();
    });
    expect(byId(tree, 'load-failed')).toHaveLength(0);
    expect(all(tree)).toContain('Your usual breakfast');
    expect(chips(tree).slice(0, 2)).toEqual(['Egg', 'Idli']);
  });

  it('says so when only the foods list is missing, and says nothing when both arrive', async () => {
    api_.listFoods.mockRejectedValueOnce(new Error('offline'));
    expect(byId(await render(), 'load-failed').length).toBeGreaterThan(0);
    expect(byId(await render(), 'load-failed')).toHaveLength(0);
  });

  it('does not say it while the lists are still on their way', async () => {
    api_.getFoodHistory.mockReturnValue(new Promise(() => {}));
    expect(byId(await render(), 'load-failed')).toHaveLength(0);
  });
});

describe('an amount that will not count yet', () => {
  it('says so when a food has values but no way to turn the unit into its own, and not when it has', async () => {
    const tree = await render({ date: TODAY, meal: 'lunch' });
    await press(tree, 'quick-food:rice'); // rice is per katori and has a bowl conversion
    expect(all(tree)).not.toContain('Unit not set up');
    await press(tree, 'unit-r1');
    await press(tree, 'unit-choice-plate');
    expect(all(tree)).toContain('Unit not set up');
    await press(tree, 'unit-r1');
    await press(tree, 'unit-choice-bowl');
    expect(all(tree)).not.toContain('Unit not set up');
  });

  it('counts a kilo as a gram, and a litre as a millilitre, for a food per 100 g or 100 ml', async () => {
    api_.listFoods.mockResolvedValue([food('flour', 'Flour', '100 g'), food('milk', 'Milk', '100 ml')]);
    api_.getFoodHistory.mockResolvedValue({ asOf: TODAY, windowDays: 180, halfLifeDays: 21, foods: [] });
    const tree = await render({ date: TODAY, meal: 'lunch' });
    await press(tree, 'open-picker');
    await type(tree, 'picker-search', 'flour');
    await press(tree, 'pick-food:flour');
    await press(tree, 'unit-r1');
    await press(tree, 'unit-choice-kg');
    expect(all(tree)).not.toContain('Unit not set up');
    await press(tree, 'unit-r1');
    await press(tree, 'unit-choice-cup');
    expect(all(tree)).toContain('Unit not set up');
  });
});

describe('a long name on a chip', () => {
  it('is cut short to fit one line, and the dropdown still shows it whole', async () => {
    const long = 'Vegetable curry with paneer and green peas';
    api_.getFoodHistory.mockResolvedValue({ asOf: TODAY, windowDays: 180, halfLifeDays: 21, foods: [logged(long, { breakfast: at(5) })] });
    const tree = await render();
    const [label] = chips(tree);
    expect(label!.length).toBeLessThanOrEqual(26);
    expect(label!.endsWith('\u2026')).toBe(true);
    await press(tree, 'open-picker');
    expect(all(tree)).toContain(long);
  });
});

describe('adding the list', () => {
  it('saves every food with its amount, for the meal and the day, and goes back', async () => {
    const tree = await render({ date: '2026-10-11', callId: 7 });
    await press(tree, 'quick-name:egg');
    await press(tree, 'quick-food:idli');
    await press(tree, 'more-r2');
    expect(pressable(tree, 'save-items')!.props.accessibilityLabel).toBe('Add 2 items to breakfast');
    await press(tree, 'save-items');
    expect(api_.addItems).toHaveBeenCalledWith(
      '2026-10-11',
      [
        { name: 'Egg', quantity: 2, unit: 'piece', meal: 'breakfast' },
        { name: 'Idli', quantity: 4, unit: 'piece', meal: 'breakfast' },
      ],
      7,
    );
    expect(nav.goBack).toHaveBeenCalled();
  });

  it('says one item in the singular', async () => {
    const tree = await render();
    await press(tree, 'quick-name:egg');
    expect(pressable(tree, 'save-items')!.props.accessibilityLabel).toBe('Add 1 item to breakfast');
  });

  it('keeps what was entered, and says why, when it could not be saved', async () => {
    api_.addItems.mockRejectedValue(new Error('Could not reach the server'));
    const tree = await render();
    await press(tree, 'quick-name:egg');
    await press(tree, 'save-items');
    expect(all(tree)).toContain('Could not reach the server');
    expect(nav.goBack).not.toHaveBeenCalled();
    expect(rowsOf(tree)).toEqual(['Egg 2 piece']);
  });
});
