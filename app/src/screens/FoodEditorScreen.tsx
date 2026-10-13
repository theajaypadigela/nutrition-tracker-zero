import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { Plus } from 'lucide-react-native';
import { api, ApiError, errorMessage } from '@/api/client';
import type { Food, FoodCheck, FoodForm, FoodIssue, FoodSource } from '@/api/types';
import { NutrientFields } from '@/components/food/NutrientFields';
import { PasteData } from '@/components/food/PasteData';
import { Button, Card, Chip, Field, FormGroup, ListGroup, ListRow, LoadingState, Notice, SectionHeader, Segmented, Text } from '@/components/kit';
import { StackScreen } from '@/components/layout/StackScreen';
import { fill } from '@/i18n/fill';
import { strings, where } from '@/i18n/strings';
import type { RootStackParamList } from '@/navigation/types';
import { copyText, pasteText } from '@/services/clipboard';
import { useMeta } from '@/state/MetaContext';
import { space } from '@/theme';
import { foodStart } from '@/utils/foodChoices';
import { buildNutrients, buildPrompt, emptinessIssues, parseFoodData, readNumber, typedNutrients, withoutGuesses, type DataIssue } from '@/utils/foodData';
import { issueTexts } from '@/utils/foodIssues';
import { perBase } from './FoodsScreen';

const SOURCES: FoodSource[] = ['label', 'database', 'recipe', 'estimate'];
const FORMS: FoodForm[] = ['as_eaten', 'raw'];

type Mode = 'manual' | 'paste';

/** "1 katori = 150 g" for a food stored per 100 g or 100 ml; "1 piece = 0.5 × katori" otherwise. */
export function conversionText(unit: string, servings: number, baseUnit: string): string {
  if (baseUnit === '100 g' || baseUnit === '100 ml') {
    const amount = Math.round(servings * 100 * 10) / 10;
    return fill(strings.food.conversion.inGrams, { unit, amount, measure: baseUnit === '100 g' ? 'g' : 'ml' });
  }
  return `1 ${unit} = ${Math.round(servings * 1000) / 1000} × ${baseUnit}`;
}
const NO_ISSUES: FoodCheck = { errors: [], warnings: [] };
/** How long the numbers must sit still before they are checked. */
const CHECK_DELAY_MS = 500;
/** How long "Prompt copied" stays on the button. */
const COPIED_MS = 2500;
/** The footer's note when a save is refused for fields on the form; it goes once the last of them is fixed. */
const CHECK_FIELDS = 'Check the highlighted fields.';

function guessBase(unitHint: string | undefined, baseUnits: string[]): string | null {
  if (!unitHint) return null;
  if (unitHint === 'g' || unitHint === 'kg') return '100 g';
  if (unitHint === 'ml' || unitHint === 'l') return '100 ml';
  return baseUnits.includes(unitHint) ? unitHint : null;
}

/** A saved number as the field shows it: 0 and unknown both read as an empty field, since an empty field is 0. */
function toText(v: number | null | undefined): string {
  return v === null || v === undefined || v === 0 ? '' : String(v);
}

/**
 * Enter a food's values (or edit them): by hand, with every nutrient in view and an empty field counting as 0, or by pasting what a
 * chat assistant wrote from the prompt this screen hands out. Both fill the same fields, and both save the same food.
 */
export default function FoodEditorScreen() {
  const navigation = useNavigation();
  const meta = useMeta();
  const { params } = useRoute<RouteProp<RootStackParamList, 'FoodEditor'>>();
  const editing = !!params.foodId;

  const [food, setFood] = useState<Food | null>(null);
  const [loading, setLoading] = useState(editing);
  const [displayName, setDisplayName] = useState(params.name ?? '');
  const [baseUnit, setBaseUnit] = useState<string | null>(guessBase(params.unitHint, meta.baseUnits));
  const [values, setValues] = useState<Record<string, string>>({});
  const [alias, setAlias] = useState('');
  const [saving, setSaving] = useState(false);
  // True from the press of Save until the numbers have been checked: a second press then cannot save the same food twice.
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  // Where the numbers came from (plan 7.4), and what the Worker finds wrong with them as they are typed.
  const [source, setSource] = useState<FoodSource | null>(null);
  // Whether the numbers are for the food as eaten or raw and dry (plan 7.7).
  const [form, setForm] = useState<FoodForm | null>(null);
  const [check, setCheck] = useState<FoodCheck>(NO_ISSUES);
  const [refused, setRefused] = useState<FoodIssue[]>([]);
  const checkRun = useRef(0);
  // Typing by hand, or pasting what an assistant wrote.
  const [mode, setMode] = useState<Mode>('manual');
  const [pasted, setPasted] = useState('');
  const [pasteIssues, setPasteIssues] = useState<DataIssue[] | null>(null);
  const [filledNote, setFilledNote] = useState<{ filled: number; ignored: string[]; kept: { pasted: string; name: string } | null } | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [clipboardEmpty, setClipboardEmpty] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(copiedTimer.current), []);
  // The conversions already stored are checked with the numbers (a katori of a food whose numbers are raw is worth a question),
  // unless the base unit is changing, which clears them.
  const storedUnits = useMemo(() => (food && baseUnit === food.baseUnit ? food.units : []), [food, baseUnit]);
  // On an edit: the nutrients nobody has given a value for. They stay unknown unless the person fills them in; only a new food, or a
  // value that was there, turns an empty field into 0. A food is shared, and saving one value must not rewrite what nobody knows.
  const unknown = useMemo(
    () => new Set(food ? meta.nutrients.filter(n => food.nutrients[n.key] == null).map(n => n.key) : []),
    [food, meta.nutrients],
  );

  const load = async () => {
    if (!params.foodId) return;
    try {
      const f = await api.getFood(params.foodId);
      setFood(f);
      setDisplayName(f.displayName);
      setBaseUnit(f.baseUnit);
      setValues(Object.fromEntries(Object.entries(f.nutrients).map(([k, v]) => [k, toText(v)])));
      setSource(f.source);
      setForm(f.form ?? null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.foodId]);

  // Ask the Worker what it makes of the numbers once they sit still: the same checks as a save, with nothing written (plan 7.4). Only
  // the numbers typed are asked about: a field left empty is 0 on a save, but while someone is still typing it is not a claim yet.
  useEffect(() => {
    const nutrients = typedNutrients(values);
    if (!baseUnit || Object.keys(nutrients).length === 0) {
      setCheck(NO_ISSUES);
      return undefined;
    }
    const run = ++checkRun.current;
    const timer = setTimeout(async () => {
      try {
        const result = await api.checkFood({ baseUnit, nutrients, form, units: storedUnits });
        if (run === checkRun.current) setCheck(result);
      } catch {
        // The check is a help, not a gate: a failed one leaves the save to the Worker's own rules.
      }
    }, CHECK_DELAY_MS);
    return () => clearTimeout(timer);
  }, [values, baseUnit, form, storedUnits]);

  const prompt = useMemo(
    () => buildPrompt({ name: displayName, baseUnit, nutrients: meta.nutrients, baseUnits: meta.baseUnits }),
    [displayName, baseUnit, meta.nutrients, meta.baseUnits],
  );

  const copyPrompt = () => {
    const ok = copyText(prompt);
    setCopied(ok);
    setCopyFailed(!ok);
    clearTimeout(copiedTimer.current);
    if (ok) copiedTimer.current = setTimeout(() => setCopied(false), COPIED_MS);
  };

  /** Reads pasted text into the form. What it holds replaces what the form had for those fields; every other field is left as it is. */
  const fillFrom = (text: string) => {
    const result = parseFoodData(text, meta.nutrients, meta.baseUnits);
    if (!result.ok) {
      setPasteIssues(result.issues);
      return;
    }
    const { food: data, filled, ignored } = result;
    setPasteIssues(null);
    setValues(prev => ({ ...prev, ...data.values }));
    if (data.baseUnit) setBaseUnit(data.baseUnit);
    if (data.form) setForm(data.form);
    if (data.source) setSource(data.source);
    // The name the person gave is theirs: items are matched to a food by its name. The pasted one only fills an empty field.
    const name = displayName.trim();
    if (!name && data.name) setDisplayName(data.name);
    setFilledNote({
      filled,
      ignored,
      kept: name && data.name && data.name.toLowerCase() !== name.toLowerCase() ? { pasted: data.name, name } : null,
    });
    setFieldErrors({});
    setMode('manual');
  };

  const pasteFromClipboard = async () => {
    const text = await pasteText();
    setClipboardEmpty(text.trim() === '');
    if (text.trim() === '') return;
    setPasted(text);
    fillFrom(text);
  };

  const save = async () => {
    // An empty field is 0, for every nutrient, calories too: only what was typed has to be a number.
    const built = buildNutrients(values, meta.nutrients);
    const { blanks } = built;
    const errs: Record<string, string> = { ...built.errors };
    if (!displayName.trim()) errs.displayName = 'Enter a name';
    if (!baseUnit) errs.baseUnit = 'Pick what the values are per';
    setFieldErrors(errs);
    // The failing field can be off-screen in a form this long, so say it in the footer too; and in the paste half it is not on the
    // screen at all, so go back to the fields.
    if (Object.keys(errs).length) {
      setMode('manual');
      setError(CHECK_FIELDS);
      return;
    }
    // What is sent (and checked): the numbers, with the ones that were unknown and are still empty left unknown.
    const nutrients: Record<string, number | null> = { ...built.nutrients };
    for (const key of unknown) if (blanks.includes(key)) nutrients[key] = null;
    const zeroed = Object.fromEntries(Object.entries(built.nutrients).filter(([key]) => nutrients[key] !== null));
    setChecking(true);

    const doSave = async () => {
      setSaving(true);
      setError(null);
      setRefused([]);
      try {
        if (editing && food) {
          const res = await api.updateFood(food.id, {
            displayName: displayName.trim(),
            ...(baseUnit !== food.baseUnit ? { baseUnit: baseUnit! } : {}),
            nutrients,
            ...(source !== food.source ? { source } : {}),
            ...(form !== (food.form ?? null) ? { form } : {}),
          });
          const parts = [];
          if (res.resolvedCount) parts.push(`${res.resolvedCount} items resolved`);
          if (res.repended) parts.push(`${res.repended} items now need a unit conversion`);
          if (parts.length) Alert.alert('Saved', parts.join('. ') + '.');
          navigation.goBack();
        } else {
          const res = await api.createFood({ displayName: displayName.trim(), baseUnit: baseUnit!, nutrients, ...(source ? { source } : {}), ...(form ? { form } : {}) });
          if (params.forLog) {
            // Made from the log screen: straight back to it with the new food, ready to log.
            const start = foodStart(res.food);
            navigation.navigate(
              'AddItems',
              { date: params.forLog.date, addedFood: { foodId: res.food.id, name: res.food.displayName, quantity: start.quantity, unit: start.unit, units: start.units } },
              { merge: true, pop: true },
            );
          } else {
            Alert.alert('Food added', where.foodAdded(res.resolvedCount));
            navigation.goBack();
          }
        }
      } catch (e) {
        if (e instanceof ApiError && e.code === 'name_taken') {
          setError(`${e.message}. Use "Same as existing…" in Pending to link it instead.`);
        } else if (e instanceof ApiError && e.code === 'invalid_nutrients' && Array.isArray(e.details.issues)) {
          // The live check had not finished, or the numbers changed under it: the Worker's own rules refused the save.
          setRefused(e.details.issues as FoodIssue[]);
          setError(strings.food.refused);
        } else setError(errorMessage(e));
      } finally {
        setSaving(false);
      }
    };

    const proceed = async () => {
      if (editing && food && baseUnit !== food.baseUnit) {
        Alert.alert(
          'Change base unit?',
          `Values must now be per ${baseUnit}. Existing unit conversions are cleared, so some items may need converting again.`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Change', onPress: doSave },
          ],
        );
      } else await doSave();
    };

    // Check the numbers as they will be saved (the empty ones as 0), not as they were half a second ago, before anything is written
    // (plan 7.4). The app adds its own two questions about a food that is empty, or has no calories beside its macros.
    let latest = check;
    try {
      latest = await api.checkFood({ baseUnit: baseUnit!, nutrients, form, units: storedUnits });
      checkRun.current++;
    } catch {
      // The Worker applies its own hard rules on save, so a failed check does not stop one.
    } finally {
      setChecking(false);
    }
    latest = { errors: latest.errors, warnings: [...withoutGuesses(latest.warnings, blanks), ...emptinessIssues(zeroed)] };
    setCheck(latest);
    if (latest.errors.length > 0) return;
    // A probable typo does not block a save, but it is asked about first.
    if (latest.warnings.length > 0) {
      Alert.alert(strings.food.saveAnywayTitle, `${issueTexts(latest.warnings, meta.nutrients).join('\n\n')}\n\n${strings.food.saveAnywayBody}`, [
        { text: 'Cancel', style: 'cancel' },
        { text: strings.food.saveAnyway, onPress: proceed },
      ]);
    } else await proceed();
  };

  /** A field's mistake goes away as soon as it is edited, and the footer's note about them with the last of them. */
  const clearError = (key: string) => {
    if (fieldErrors[key] === undefined) return;
    const rest = Object.fromEntries(Object.entries(fieldErrors).filter(([k]) => k !== key));
    setFieldErrors(rest);
    if (Object.keys(rest).length === 0) setError(current => (current === CHECK_FIELDS ? null : current));
  };

  const addAlias = async () => {
    if (!food || !alias.trim()) return;
    try {
      const res = await api.addAlias(food.id, alias.trim());
      setFood(res.food);
      setAlias('');
    } catch (e) {
      Alert.alert('Could not add alias', errorMessage(e));
    }
  };

  const removeAlias = (a: string) =>
    Alert.alert(`Remove "${a}"?`, 'Items logged under this name will become unknown again.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            setFood((await api.removeAlias(food!.id, a)).food);
          } catch (e) {
            Alert.alert('Could not remove', errorMessage(e));
          }
        },
      },
    ]);

  const removeUnit = (u: string) =>
    Alert.alert(`Remove the ${u} conversion?`, undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            setFood((await api.removeUnit(food!.id, u)).food);
          } catch (e) {
            Alert.alert('Could not remove', errorMessage(e));
          }
        },
      },
    ]);

  const base = baseUnit ? perBase(baseUnit) : '…';
  const t = strings.foodEntry;
  // Numbers that cannot all be true block the save; the rest only ask (plan 7.4).
  const errors = [...check.errors, ...refused];
  const blocked = check.errors.length > 0;
  const withValue = meta.nutrients.filter(n => (readNumber(values[n.key] ?? '') ?? 0) > 0).length;
  const note = filledNote
    ? [
        filledNote.filled === 1 ? t.paste.filledOne : fill(t.paste.filled, { n: filledNote.filled }),
        filledNote.ignored.length > 0 ? fill(t.paste.skipped, { list: filledNote.ignored.slice(0, 6).join(', ') }) : '',
        filledNote.kept ? fill(t.paste.nameKept, filledNote.kept) : '',
      ]
        .filter(Boolean)
        .join(' ')
    : '';

  return (
    <StackScreen
      title={editing ? 'Edit food' : 'New food'}
      subtitle={where.editorSubtitle}
      footer={
        <>
          {errors.length > 0 ? (
            <Notice tone="danger" testID="food-errors">
              {issueTexts(errors, meta.nutrients).join(' ')}
            </Notice>
          ) : null}
          {check.warnings.length > 0 ? (
            <Notice tone="warning" title={strings.food.checkTitle} testID="food-warnings">
              {issueTexts(check.warnings, meta.nutrients).join(' ')}
            </Notice>
          ) : null}
          {error ? <Notice tone="danger">{error}</Notice> : null}
          <Button
            testID="save-food"
            label={editing ? 'Save food' : params.forLog ? t.saveAndLog : 'Add food'}
            size="lg"
            fullWidth
            loading={saving || checking}
            disabled={loading || blocked}
            onPress={save}
          />
        </>
      }
      gap={space.xl}
    >
      {loading ? (
        <LoadingState />
      ) : (
        <>
          {!editing ? <Notice tone="info">{where.editorNotice}</Notice> : null}

          <Segmented<Mode>
            options={[
              { value: 'manual', label: t.modes.manual },
              { value: 'paste', label: t.modes.paste },
            ]}
            value={mode}
            onChange={setMode}
          />

          <Card>
            <View style={{ gap: space.lg }}>
              <Field
                testID="food-name"
                label="Name"
                value={displayName}
                onChangeText={text => {
                  setDisplayName(text);
                  clearError('displayName');
                }}
                placeholder="e.g. Idli"
                autoCapitalize="words"
                error={fieldErrors.displayName}
              />
              <View style={{ gap: space.sm }}>
                <Text variant="smallStrong" tone="secondary">
                  Values are per
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                  {meta.baseUnits.map(u => (
                    <Chip
                      key={u}
                      label={perBase(u)}
                      selected={baseUnit === u}
                      onPress={() => {
                        setBaseUnit(u);
                        clearError('baseUnit');
                      }}
                    />
                  ))}
                </View>
                {fieldErrors.baseUnit ? (
                  <Text variant="small" tone="danger">
                    {fieldErrors.baseUnit}
                  </Text>
                ) : (
                  <Text variant="caption" tone="muted">
                    {baseUnit ? `The nutrients are for ${base}.` : 'Pick the serving the values describe.'}
                  </Text>
                )}
              </View>
            </View>
          </Card>

          {mode === 'paste' ? (
            <PasteData
              prompt={prompt}
              text={pasted}
              onText={text => {
                setPasted(text);
                setPasteIssues(null);
                setClipboardEmpty(false);
              }}
              issues={pasteIssues}
              copied={copied}
              copyFailed={copyFailed}
              clipboardEmpty={clipboardEmpty}
              onCopy={copyPrompt}
              onPasteClipboard={pasteFromClipboard}
              onFill={() => fillFrom(pasted)}
              onClear={() => {
                setPasted('');
                setPasteIssues(null);
              }}
            />
          ) : (
            <>
              {note ? (
                <Notice tone="success" testID="filled-note" onDismiss={() => setFilledNote(null)}>
                  {note}
                </Notice>
              ) : null}

              <View style={{ gap: space.sm }}>
                <SectionHeader
                  title={baseUnit ? fill(t.fields.title, { base }) : t.fields.titleNoBase}
                  right={
                    <Text variant="small" tone="muted" tabular>
                      {fill(t.fields.filled, { n: withValue, total: meta.nutrients.length })}
                    </Text>
                  }
                />
                <Text variant="small" tone="secondary">
                  {unknown.size > 0 ? t.fields.hintEdit : t.fields.hint}
                </Text>
              </View>
              <NutrientFields
                nutrients={meta.nutrients}
                values={values}
                errors={fieldErrors}
                unknown={unknown}
                onChange={(key, text) => {
                  setValues(prev => ({ ...prev, [key]: text }));
                  clearError(key);
                }}
              />

              <FormGroup title={strings.food.form.title} hint={strings.food.form.hint}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                  {FORMS.map(f => (
                    <Chip key={f} testID={`form-${f}`} label={strings.food.form[f]} selected={form === f} onPress={() => setForm(f)} />
                  ))}
                  <Chip testID="form-unsure" label={strings.food.form.unsure} selected={form === null} onPress={() => setForm(null)} />
                </View>
              </FormGroup>

              <FormGroup title={strings.food.source.title} hint={strings.food.source.hint}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                  {SOURCES.map(s => (
                    <Chip key={s} testID={`source-${s}`} label={strings.food.source[s]} selected={source === s} onPress={() => setSource(s)} />
                  ))}
                  <Chip testID="source-unsure" label={strings.food.source.unsure} selected={source === null} onPress={() => setSource(null)} />
                </View>
                {editing && food ? (
                  <Text variant="caption" tone="muted" style={{ paddingHorizontal: space.xs }}>
                    {food.reviewedAt ? fill(strings.food.source.reviewed, { date: food.reviewedAt.slice(0, 10) }) : strings.food.source.none}
                  </Text>
                ) : null}
              </FormGroup>

              {editing && food ? (
                <>
                  <FormGroup title="Also called">
                    {food.aliases.length > 0 ? (
                      <ListGroup>
                        {food.aliases.map(a => (
                          <ListRow
                            key={a}
                            title={a}
                            right={<Button label="Remove" variant="dangerGhost" size="sm" onPress={() => removeAlias(a)} />}
                          />
                        ))}
                      </ListGroup>
                    ) : (
                      <Text variant="small" tone="muted" style={{ paddingHorizontal: space.xs }}>
                        No other names yet.
                      </Text>
                    )}
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.sm }}>
                      <View style={{ flex: 1 }}>
                        <Field value={alias} onChangeText={setAlias} placeholder="e.g. chawal" autoCapitalize="none" />
                      </View>
                      <Button label="Add" icon={Plus} variant="soft" disabled={!alias.trim()} onPress={addAlias} />
                    </View>
                  </FormGroup>

                  <FormGroup title="Unit conversions" hint={food.units.length === 0 ? 'None yet. Pending shows the ones people need.' : undefined}>
                    {food.units.length > 0 ? (
                      <ListGroup>
                        {food.units.map(u => (
                          <ListRow
                            key={u.unit}
                            title={conversionText(u.unit, u.servings, food.baseUnit)}
                            chevron={false}
                            onPress={() =>
                              navigation.navigate('UnitConversion', {
                                foodId: food.id,
                                foodName: food.displayName,
                                baseUnit: food.baseUnit,
                                unit: u.unit,
                              })
                            }
                            right={<Button label="Remove" variant="dangerGhost" size="sm" onPress={() => removeUnit(u.unit)} />}
                          />
                        ))}
                      </ListGroup>
                    ) : null}
                  </FormGroup>
                </>
              ) : null}
            </>
          )}
        </>
      )}
    </StackScreen>
  );
}
