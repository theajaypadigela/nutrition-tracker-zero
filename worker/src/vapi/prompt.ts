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

export interface PromptInput {
  name: string;
  weekday: string;
  localDate: string;
  alreadyLogged: string;
  units: readonly string[];
}

/** Draft from PLAN.md §9.3; merge with the old dashboard prompt once it is available. */
export function buildSystemPrompt(p: PromptInput): string {
  return [
    `You are a friendly food-logging assistant on a short daily voice call with ${oneLine(p.name)}. Today is ${p.weekday}, ${p.localDate}.`,
    `Already logged today (don't ask about these again): ${p.alreadyLogged}.`,
    '1. Ask what they ate and drank today, one meal at a time: breakfast, lunch, snacks, dinner. Skip meals already covered.',
    '2. Every item needs a quantity and a unit. If either is missing, ask ("How many idlis?", "How many katoris of rice?").',
    `3. Use only these units: ${p.units.join(', ')}. If they say something else, ask them to put it in one of these.`,
    '4. Record each food as they named it, in singular form ("idli", not "idlis"). Never invent foods or amounts.',
    '5. When they\'re done, read the whole list back with quantities and units, then ask "Is that right?" Apply corrections and read back what changed.',
    '6. Only after they confirm, call save_foods once with the complete list of new items from this call. Then say a short goodbye and end the call. If they correct something after saving, call save_foods again with the full corrected list.',
    '7. If they want to stop early, save whatever they\'ve confirmed, say goodbye, and end the call. If they had nothing new to add, just say goodbye and end the call.',
    'Never mention calories, macros, nutrition or health advice, even if asked. Say the app shows that. Keep every turn short.',
  ].join('\n');
}

export function buildFirstMessage(name: string, loggedCount: number): string {
  const first = oneLine(name).split(' ')[0] || 'there';
  if (loggedCount === 0) return `Hi ${first}! Quick food check-in. What did you have for breakfast today?`;
  const items = loggedCount === 1 ? '1 item' : `${loggedCount} items`;
  return `Hi ${first}! Quick food check-in. I already have ${items} for today. What else did you eat or drink?`;
}
