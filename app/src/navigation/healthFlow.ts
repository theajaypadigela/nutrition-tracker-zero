import { CommonActions, type NavigationProp, type ParamListBase } from '@react-navigation/native';
import type { RootStackParamList } from './types';

/** The steps of the personal-targets flow (WEEKLY_BREAKDOWN_PLAN.md 3.5), and the stop screen one of them can lead to. */
const FLOW_STEPS: readonly string[] = [
  'HealthIntro',
  'SafetyCheck',
  'AboutYou',
  'Activity',
  'HealthGoal',
  'Pattern',
  'HealthReview',
  'Under19',
] satisfies (keyof RootStackParamList)[];

/**
 * Leaves the personal-targets flow: its steps come off the stack, so Back returns to the screen the flow was opened
 * from instead of walking through every step again. With `then`, that screen comes next. (`navigate` cannot do this:
 * since React Navigation 7 it pushes another copy of a screen that is already lower in the stack.)
 */
export function leaveHealthFlow(navigation: Pick<NavigationProp<ParamListBase>, 'dispatch'>, then?: 'Targets' | 'ReferenceOnly') {
  navigation.dispatch(state => {
    const first = state.routes.findIndex(r => FLOW_STEPS.includes(r.name));
    const kept = first === -1 ? state.routes : state.routes.slice(0, first);
    const opener = kept[kept.length - 1];
    const routes =
      then && opener?.name !== then ? [...kept, { key: `${then}-${Date.now().toString(36)}`, name: then }] : kept;
    if (routes.length === 0) return CommonActions.reset({ index: 0, routes: [{ name: 'Main' }] });
    return CommonActions.reset({ ...state, routes, index: routes.length - 1 });
  });
}
