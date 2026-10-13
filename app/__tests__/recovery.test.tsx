/**
 * The recovery code (WEEKLY_BREAKDOWN_PLAN.md 8.3.2, Q17): entering it on a phone that lacks it, and what a person can do when they do not
 * have it: set up a new one only if the server holds none (it was never claimed), or ask the owner of the deployment to issue one.
 */
import React from 'react';
import TestRenderer, { act, type ReactTestInstance } from 'react-test-renderer';

jest.mock('@react-navigation/native', () => {
  const nav = { navigate: jest.fn(), goBack: jest.fn(), canGoBack: jest.fn(() => true) };
  return { useNavigation: () => nav, useIsFocused: () => true, useRoute: jest.fn(() => ({ params: {} })), useFocusEffect: jest.fn(), __nav: nav };
});
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/state/ProfileContext', () => ({ useProfile: jest.fn() }));
jest.mock('@/state/HealthContext', () => ({ useHealth: jest.fn() }));
jest.mock('@/hooks/useEnsureSecret', () => ({ verifyRecoveryCode: jest.fn() }));
jest.mock('@/api/client', () => {
  // Plain assignments, not parameter properties: a jest.mock factory may not reference Babel's helpers.
  class ApiError extends Error {
    status: number;
    code: string;
    details: Record<string, unknown>;
    constructor(status: number, code: string, message: string) {
      super(message);
      this.status = status;
      this.code = code;
      this.details = {};
    }
  }
  return { ApiError, errorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)), api: { claimSecret: jest.fn() } };
});

import { api, ApiError } from '@/api/client';
import { verifyRecoveryCode } from '@/hooks/useEnsureSecret';
import { RecoveryCodeScreen, RecoveryEntryScreen } from '@/screens/profile/RecoveryScreens';
import { useHealth } from '@/state/HealthContext';
import { useProfile } from '@/state/ProfileContext';
import { ThemeProvider } from '@/theme';

const nav = (jest.requireMock('@react-navigation/native') as { __nav: Record<string, jest.Mock> }).__nav;
const api_ = api as unknown as Record<string, jest.Mock>;
const CODE = 'A'.repeat(43);

const textOf = (n: ReactTestInstance) => [n.props.children].flat(Infinity).filter(c => typeof c === 'string' || typeof c === 'number').join('');
const all = (tree: TestRenderer.ReactTestRenderer) => tree.root.findAll((n: ReactTestInstance) => (n.type as unknown) === 'Text').map(textOf).join('\n');
const trees: TestRenderer.ReactTestRenderer[] = [];
async function render() {
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(
      <ThemeProvider>
        <RecoveryEntryScreen />
      </ThemeProvider>,
    );
  });
  trees.push(tree);
  return tree;
}
afterEach(async () => {
  await act(async () => {
    for (const t of trees.splice(0)) t.unmount();
  });
});
const press = async (tree: TestRenderer.ReactTestRenderer, id: string) => {
  const node = tree.root.findAll((n: ReactTestInstance) => n.props.testID === id && typeof n.props.onPress === 'function')[0];
  if (!node) throw new Error(`nothing pressable with testID ${id}`);
  await act(async () => {
    await node.props.onPress();
  });
};

let adoptSecret: jest.Mock;
let refresh: jest.Mock;
beforeEach(() => {
  jest.clearAllMocks();
  adoptSecret = jest.fn(() => Promise.resolve());
  refresh = jest.fn(() => Promise.resolve());
  (useProfile as jest.Mock).mockReturnValue({ secret: 'stale-secret', adoptSecret, selectProfile: jest.fn() });
  (useHealth as jest.Mock).mockReturnValue({ refresh });
});

describe('the recovery entry screen', () => {
  it('unlocks with the right code, keeps it, and refreshes the health context', async () => {
    (verifyRecoveryCode as jest.Mock).mockResolvedValue(true);
    const tree = await render();
    await act(async () => {
      tree.root.findAll((n: ReactTestInstance) => n.props.testID === 'recovery-input' && typeof n.props.onChangeText === 'function')[0]!.props.onChangeText(CODE);
    });
    await press(tree, 'recovery-unlock');
    expect(adoptSecret).toHaveBeenCalledWith(CODE);
    expect(refresh).toHaveBeenCalled();
    expect(nav.goBack).toHaveBeenCalled();
  });

  it('says the code is wrong when it does not match, and keeps nothing', async () => {
    (verifyRecoveryCode as jest.Mock).mockResolvedValue(false);
    const tree = await render();
    await act(async () => {
      tree.root.findAll((n: ReactTestInstance) => n.props.testID === 'recovery-input' && typeof n.props.onChangeText === 'function')[0]!.props.onChangeText(CODE);
    });
    await press(tree, 'recovery-unlock');
    expect(all(tree)).toContain("That is not this profile's code. Check it and try again.");
    expect(adoptSecret).not.toHaveBeenCalled();
  });

  it('sets up a new code when the server holds none (it was never claimed), and shows it once', async () => {
    api_.claimSecret.mockResolvedValue({ secret: 'n'.repeat(43) });
    const tree = await render();
    await press(tree, 'recovery-claim');
    expect(adoptSecret).toHaveBeenCalledWith('n'.repeat(43), { show: true });
    expect(refresh).toHaveBeenCalled();
    expect(nav.navigate).toHaveBeenCalledWith('RecoveryCode');
  });

  it('says so, and changes nothing, when the profile already has a code', async () => {
    api_.claimSecret.mockRejectedValue(new ApiError(409, 'secret_already_set', 'already set'));
    const tree = await render();
    await press(tree, 'recovery-claim');
    expect(all(tree)).toContain('This profile already has a code, so a new one cannot be set up.');
    expect(adoptSecret).not.toHaveBeenCalled();
    expect(nav.navigate).not.toHaveBeenCalled();
  });

  it('says to ask for a code when the deployment has closed claims (REQUIRE_SECRET)', async () => {
    api_.claimSecret.mockRejectedValue(new ApiError(403, 'profile_secret_required', "This profile's secret is required."));
    const tree = await render();
    await press(tree, 'recovery-claim');
    expect(all(tree)).toContain('Ask the person who runs the app to issue you one');
    expect(adoptSecret).not.toHaveBeenCalled();
  });

  it('shows any other failure as it is', async () => {
    api_.claimSecret.mockRejectedValue(new Error('offline'));
    const tree = await render();
    await press(tree, 'recovery-claim');
    expect(all(tree)).toContain('offline');
  });
});

describe('the recovery code screen', () => {
  const show = async (secretNotStored: boolean) => {
    (useProfile as jest.Mock).mockReturnValue({ recoveryCode: CODE, acknowledgeRecovery: jest.fn(), secretNotStored });
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        <ThemeProvider>
          <RecoveryCodeScreen />
        </ThemeProvider>,
      );
    });
    trees.push(tree);
    return tree;
  };

  it('shows the code, and says plainly when this phone could not keep it, so it is saved now (security review)', async () => {
    const stored = await show(false);
    expect(all(stored)).toContain('AAAAAA');
    expect(all(stored)).not.toContain('could not keep the code');
    const lost = await show(true);
    expect(all(lost)).toContain('AAAAAA');
    expect(all(lost)).toContain('This phone could not keep the code in its secure storage');
  });
});
