import type { Meal } from '../domain/units';
import { isDue, minutesOf, type MealStep } from './meals';

export interface LoggedItem {
  raw_name: string;
  quantity: number;
  unit: string;
  meal: string | null;
}

const MAX_LOGGED_IN_PROMPT = 30;

const oneLine = (s: string) => s.replace(/[\r\n]+/g, ' ').trim();

/** "2 piece idli (breakfast); 1 katori dal (lunch)" */
export function formatLogged(items: LoggedItem[]): string {
  if (items.length === 0) return 'nothing yet';
  const shown = items.slice(0, MAX_LOGGED_IN_PROMPT).map((i) => {
    const meal = i.meal ? ` (${i.meal})` : '';
    return `${i.quantity} ${i.unit} ${oneLine(i.raw_name)}${meal}`;
  });
  const more = items.length > MAX_LOGGED_IN_PROMPT ? `; and ${items.length - MAX_LOGGED_IN_PROMPT} more` : '';
  return shown.join('; ') + more;
}

/** "10:15 am" from 'HH:MM'. */
export function formatClock(hhmm: string): string {
  const minutes = minutesOf(hhmm);
  const h = Math.floor(minutes / 60);
  const m = String(minutes % 60).padStart(2, '0');
  return `${h % 12 || 12}:${m} ${h < 12 ? 'am' : 'pm'}`;
}

function greetingAt(hhmm: string): string {
  const h = Math.floor(minutesOf(hhmm) / 60);
  if (h < 4) return 'Hi';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

const andList = (words: string[]) =>
  words.length <= 1 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;

const SNACKS = 'snacks and drinks between meals (tea, coffee, juice, biscuits, fruit)';
const mealWord = (meal: Meal) => (meal === 'snack' ? 'snacks' : meal);

function stepLine({ meal, state }: MealStep): string {
  if (meal === 'snack') return `- ${SNACKS}: ask once whether they had any.`;
  if (state === 'check') return `- ${meal}: first ask whether they've had ${meal} yet; if not, skip it.`;
  return `- ${meal}: ask what they had.`;
}

function mealPlanLines(plan: MealStep[]): string[] {
  const due = plan.filter(isDue);
  const logged = plan.filter((s) => s.state === 'logged').map((s) => mealWord(s.meal));
  const later = plan.filter((s) => s.state === 'later').map((s) => mealWord(s.meal));
  const lines =
    due.length === 0
      ? ["1. The meals so far are already logged. Ask once whether they've had anything else to eat or drink since; if not, go to the day-completion question before ending the call."]
      : due.length === 1
        ? ['1. Ask about this meal:', stepLine(due[0]!)]
        : ['1. Go meal by meal in this order, one meal per question, and finish each meal before moving on:', ...due.map(stepLine)];
  const skip = [
    ...(logged.length ? [`${logged.join(', ')} (already logged)`] : []),
    ...(later.length ? [`${later.join(', ')} (still ahead today)`] : []),
  ];
  if (skip.length) lines.push(`   Don't ask about: ${skip.join('; ')}. If they bring one up anyway, record it.`);
  return lines;
}

export interface PromptInput {
  name: string;
  weekday: string;
  localDate: string;
  /** 'HH:MM' in the user's timezone when the call starts. */
  localTime: string;
  alreadyLogged: string;
  units: readonly string[];
  plan: MealStep[];
  /** The Worker runs inside the app: save_foods is a client-side tool and Vapi sends no reply to it. */
  onDevice?: boolean;
}

/** PLAN.md §9.3: meal by meal, only the meals that make sense at this time of day. */
export function buildSystemPrompt(p: PromptInput): string {
  const nextMeal = p.plan.find((s) => s.state === 'later' && s.meal !== 'snack')?.meal;
  return [
    `You are a friendly food-logging assistant on a short daily voice call with ${oneLine(p.name)}. It is ${formatClock(p.localTime)} on ${p.weekday}, ${p.localDate}, their local time.`,
    `Already logged today (don't ask about these again): ${p.alreadyLogged}.`,
    ...mealPlanLines(p.plan),
    '2. Every item needs a quantity and a unit. If either is missing, ask ("How many idlis?", "How many katoris of rice?"). If an amount sounds unusually large (more than 6 katoris, bowls or glasses, more than 20 pieces, or more than a kilogram), say it back and check it before you record it.',
    `3. Use only these units: ${p.units.join(', ')}. If they say something else, ask them to put it in one of these.`,
    '4. Record each food as they named it, in singular form ("idli", not "idlis"), with the meal they had it at (breakfast, lunch, snack or dinner). Never invent foods or amounts.',
    '5. When they\'re done, read the whole list back with quantities and units, then ask "Is that right?" Apply corrections and read back what changed.',
    p.onDevice
      ? '6. Only after they confirm, call save_foods once with the complete list of new items from this call. It saves quietly on their phone and sends no reply, so do not wait for one and do not call it a second time because nothing came back. Then ask the day-completion question below. If they correct something after saving, call save_foods again with the full corrected list.'
      : '6. Only after they confirm, call save_foods once with the complete list of new items from this call. Then ask the day-completion question below. If they correct something after saving, call save_foods again with the full corrected list.',
    '7. Before your final goodbye, including when there is nothing new to add, ask "Should I mark this day as complete?" Explain briefly if needed: complete means everything they ate and drank for the whole day is logged. Wait for their answer. Only an explicit yes to this question authorizes mark_day_complete with confirmed: true. Confirming the food read-back is not permission to mark the day complete. If they say no, are unsure, still plan to eat, or stop early, leave the day unchanged. Never infer completion from silence or a hangup.',
    p.onDevice
      ? '8. After an explicit yes, call mark_day_complete once. It saves quietly on their phone and sends no reply; do not wait or repeat it. Then say a short goodbye and end the call.'
      : '8. After an explicit yes, call mark_day_complete and wait for success before saying the day is complete. If it fails, explain that the day could not be marked and offer to retry. Then say a short goodbye and end the call.',
    'If they want to stop early, save whatever they have confirmed and end the call without marking the day complete.',
    ...(nextMeal ? [`When you say goodbye, wish them a nice ${nextMeal}.`] : []),
    'Never mention calories, macros, nutrition or health advice, even if asked. Say the app shows that. Keep every turn short.',
  ].join('\n');
}

function openingQuestion({ meal, state }: MealStep): string {
  if (meal === 'snack') return 'Did you have any snacks or drinks between meals, like tea or coffee?';
  return state === 'check' ? `Have you had ${meal} yet?` : `What did you have for ${meal}?`;
}

/** Opens on the first meal worth asking about at this time of day. */
export function buildFirstMessage(name: string, localTime: string, plan: MealStep[], loggedCount: number): string {
  const first = oneLine(name).split(' ')[0];
  const greeting = first ? `${greetingAt(localTime)}, ${first}!` : `${greetingAt(localTime)}!`;
  const loggedMeals = plan.filter((s) => s.state === 'logged').map((s) => s.meal);
  const have = loggedMeals.length
    ? ` I already have your ${andList(loggedMeals)}.`
    : loggedCount > 0
      ? ` I already have ${loggedCount === 1 ? '1 item' : `${loggedCount} items`} for today.`
      : '';
  const due = plan.filter(isDue);
  const next = due[0];
  const question = !next
    ? 'Did you have anything else to eat or drink?'
    : `${due.length > 1 ? "Let's go meal by meal. " : ''}${openingQuestion(next)}`;
  return `${greeting} Quick food check-in.${have} ${question}`;
}
