/**
 * The log in and create account screens: what a person can press, what is sent, and what they are told. The Worker's side (hashing,
 * the one answer for every way to log in wrongly) is in worker/test/integration/auth.test.ts.
 */
import React from 'react';
import TestRenderer, { act, type ReactTestInstance } from 'react-test-renderer';

jest.mock('@react-navigation/native', () => {
  const nav = { navigate: jest.fn(), goBack: jest.fn(), dispatch: jest.fn(), canGoBack: jest.fn(() => true) };
  return {
    useNavigation: () => nav,
    useIsFocused: () => true,
    useRoute: jest.fn(() => ({ params: {} })),
    useFocusEffect: jest.fn(),
    StackActions: { replace: (name: string) => ({ type: 'REPLACE', payload: { name } }) },
    __nav: nav,
  };
});
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@/state/ProfileContext', () => ({ useProfile: jest.fn() }));
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
  return { ApiError, errorMessage: (e: unknown) => (e instanceof Error ? e.message : String(e)), api: { login: jest.fn(), register: jest.fn() } };
});

import { api, ApiError } from '@/api/client';
import LoginScreen, { ReauthenticateScreen } from '@/screens/LoginScreen';
import RegisterScreen from '@/screens/RegisterScreen';
import { useProfile } from '@/state/ProfileContext';
import { ThemeProvider } from '@/theme';

const nav = (jest.requireMock('@react-navigation/native') as { __nav: Record<string, jest.Mock> }).__nav;
const api_ = api as unknown as Record<string, jest.Mock>;
const ASHA = { id: 'u1', name: 'Asha' };

const textOf = (n: ReactTestInstance) => [n.props.children].flat(Infinity).filter(c => typeof c === 'string' || typeof c === 'number').join('');
const all = (tree: TestRenderer.ReactTestRenderer) => tree.root.findAll((n: ReactTestInstance) => (n.type as unknown) === 'Text').map(textOf).join('\n');
const trees: TestRenderer.ReactTestRenderer[] = [];
async function render(Screen: React.ComponentType) {
  let tree!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = TestRenderer.create(
      <ThemeProvider>
        <Screen />
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

const byId = (tree: TestRenderer.ReactTestRenderer, id: string, prop: string) => {
  const node = tree.root.findAll((n: ReactTestInstance) => n.props.testID === id && n.props[prop] !== undefined)[0];
  if (!node) throw new Error(`nothing with testID ${id} and ${prop}`);
  return node;
};
const type = async (tree: TestRenderer.ReactTestRenderer, id: string, text: string) => {
  const node = byId(tree, id, 'onChangeText');
  await act(async () => {
    node.props.onChangeText(text);
  });
};
const press = async (tree: TestRenderer.ReactTestRenderer, id: string) => {
  const node = byId(tree, id, 'onPress');
  await act(async () => {
    await node.props.onPress();
  });
};
const pressLabel = async (tree: TestRenderer.ReactTestRenderer, label: string) => {
  const node = tree.root.findAll((n: ReactTestInstance) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0];
  if (!node) throw new Error(`nothing pressable labelled ${label}`);
  await act(async () => {
    node.props.onPress();
  });
};
const disabled = (tree: TestRenderer.ReactTestRenderer, id: string) => byId(tree, id, 'onPress').props.disabled === true;
/** The text box itself, for what it was told to do with what is typed (hide it, or not). */
const box = (tree: TestRenderer.ReactTestRenderer, id: string) =>
  tree.root.findAll((n: ReactTestInstance) => (n.type as unknown) === 'TextInput' && n.props.testID === id)[0]!;

let selectProfile: jest.Mock;
beforeEach(() => {
  jest.clearAllMocks();
  selectProfile = jest.fn(() => Promise.resolve());
  (useProfile as jest.Mock).mockReturnValue({ selectProfile });
});

describe('the log in screen', () => {
  it('restores saved data with the account password and returns to the settings flow', async () => {
    (useProfile as jest.Mock).mockReturnValue({ profile: ASHA, selectProfile });
    api_.login.mockResolvedValue({ profile: ASHA, secret: 'n'.repeat(43) });
    const tree = await render(ReauthenticateScreen);
    expect(box(tree, 'login-username').props.value).toBe('Asha');
    expect(box(tree, 'login-username').props.editable).toBe(false);
    await type(tree, 'login-password', 'the password');
    await press(tree, 'login-submit');
    expect(api_.login).toHaveBeenCalledWith('Asha', 'the password');
    expect(selectProfile).toHaveBeenCalledWith(ASHA, { secret: 'n'.repeat(43) });
    expect(nav.goBack).toHaveBeenCalled();
  });

  it('offers Log in only once there is a username and a password', async () => {
    const tree = await render(LoginScreen);
    expect(disabled(tree, 'login-submit')).toBe(true);
    await type(tree, 'login-username', 'asha');
    expect(disabled(tree, 'login-submit')).toBe(true);
    await type(tree, 'login-password', 'x');
    expect(disabled(tree, 'login-submit')).toBe(false);
    await type(tree, 'login-username', '   ');
    expect(disabled(tree, 'login-submit')).toBe(true);
  });

  it('logs in with the username trimmed and the password exactly as typed, and selects the profile it gets back', async () => {
    api_.login.mockResolvedValue({ profile: ASHA, secret: 's'.repeat(43) });
    const tree = await render(LoginScreen);
    await type(tree, 'login-username', '  asha ');
    await type(tree, 'login-password', ' pass word ');
    await press(tree, 'login-submit');
    expect(api_.login).toHaveBeenCalledWith('asha', ' pass word ');
    expect(selectProfile).toHaveBeenCalledWith(ASHA, { secret: 's'.repeat(43) });
    // Login restores access without restarting onboarding.
    expect(selectProfile.mock.calls[0][1]).not.toHaveProperty('isNew');
  });

  it('says the username or password is wrong, without saying which, and selects nothing', async () => {
    api_.login.mockRejectedValue(new ApiError(401, 'invalid_credentials', 'Wrong username or password'));
    const tree = await render(LoginScreen);
    await type(tree, 'login-username', 'asha');
    await type(tree, 'login-password', 'nope');
    await press(tree, 'login-submit');
    expect(all(tree)).toContain('Wrong username or password.');
    expect(selectProfile).not.toHaveBeenCalled();
    // The fields keep what was typed, so a typo is one fix away.
    expect(byId(tree, 'login-username', 'onChangeText').props.value).toBe('asha');
  });

  it('shows any other failure as it is, and clears the old message on the next try', async () => {
    api_.login.mockRejectedValueOnce(new ApiError(0, 'network', 'Could not reach the server')).mockResolvedValueOnce({ profile: ASHA, secret: 's'.repeat(43) });
    const tree = await render(LoginScreen);
    await type(tree, 'login-username', 'asha');
    await type(tree, 'login-password', 'pw');
    await press(tree, 'login-submit');
    expect(all(tree)).toContain('Could not reach the server');
    await press(tree, 'login-submit');
    expect(all(tree)).not.toContain('Could not reach the server');
    expect(selectProfile).toHaveBeenCalledWith(ASHA, { secret: 's'.repeat(43) });
  });

  it('does not log in twice while the first is still going', async () => {
    let finish!: (p: { profile: typeof ASHA; secret: string }) => void;
    api_.login.mockReturnValue(new Promise(res => (finish = res)));
    const tree = await render(LoginScreen);
    await type(tree, 'login-username', 'asha');
    await type(tree, 'login-password', 'pw');
    // A second tap is its own event, after the screen has re-rendered as busy.
    await act(async () => {
      byId(tree, 'login-submit', 'onPress').props.onPress();
    });
    await act(async () => {
      byId(tree, 'login-submit', 'onPress').props.onPress();
    });
    expect(api_.login).toHaveBeenCalledTimes(1);
    await act(async () => finish({ profile: ASHA, secret: 's'.repeat(43) }));
    expect(selectProfile).toHaveBeenCalledTimes(1);
  });

  it('hides the password until asked, and hides it again', async () => {
    const tree = await render(LoginScreen);
    expect(box(tree, 'login-password').props.secureTextEntry).toBe(true);
    expect(box(tree, 'login-username').props.secureTextEntry).toBeFalsy();
    await pressLabel(tree, 'Show password');
    expect(box(tree, 'login-password').props.secureTextEntry).toBe(false);
    await pressLabel(tree, 'Hide password');
    expect(box(tree, 'login-password').props.secureTextEntry).toBe(true);
  });

  it('goes to create account, replacing this screen so Back does not stack the two', async () => {
    const tree = await render(LoginScreen);
    await press(tree, 'go-register');
    expect(nav.dispatch).toHaveBeenCalledWith({ type: 'REPLACE', payload: { name: 'Register' } });
  });
});

describe('the create account screen', () => {
  it('offers Create account only with a username and a password of at least 8 characters', async () => {
    const tree = await render(RegisterScreen);
    expect(disabled(tree, 'register-submit')).toBe(true);
    await type(tree, 'register-username', 'asha');
    await type(tree, 'register-password', '1234567');
    expect(disabled(tree, 'register-submit')).toBe(true);
    await type(tree, 'register-password', '12345678');
    expect(disabled(tree, 'register-submit')).toBe(false);
    await type(tree, 'register-username', ' ');
    expect(disabled(tree, 'register-submit')).toBe(true);
  });

  it('creates the account and selects the new profile with its one-time secret, as a new profile always was', async () => {
    api_.register.mockResolvedValue({ profile: ASHA, secret: 's'.repeat(43) });
    const tree = await render(RegisterScreen);
    await type(tree, 'register-username', ' Asha ');
    await type(tree, 'register-password', 'a long password');
    await press(tree, 'register-submit');
    expect(api_.register).toHaveBeenCalledWith('Asha', 'a long password');
    expect(selectProfile).toHaveBeenCalledWith(ASHA, { isNew: true, secret: 's'.repeat(43) });
  });

  it('says the username is taken, under the username, and selects nothing', async () => {
    api_.register.mockRejectedValue(new ApiError(409, 'name_taken', 'A profile with that name already exists'));
    const tree = await render(RegisterScreen);
    await type(tree, 'register-username', 'asha');
    await type(tree, 'register-password', 'a long password');
    await press(tree, 'register-submit');
    expect(all(tree)).toContain('That username is taken. Try another.');
    expect(selectProfile).not.toHaveBeenCalled();
    // Changing the name and trying again clears it.
    api_.register.mockResolvedValue({ profile: ASHA, secret: 's'.repeat(43) });
    await type(tree, 'register-username', 'asha2');
    await press(tree, 'register-submit');
    expect(all(tree)).not.toContain('That username is taken');
    expect(selectProfile).toHaveBeenCalled();
  });

  it('shows any other failure as it is', async () => {
    api_.register.mockRejectedValue(new ApiError(0, 'network', 'Could not reach the server'));
    const tree = await render(RegisterScreen);
    await type(tree, 'register-username', 'asha');
    await type(tree, 'register-password', 'a long password');
    await press(tree, 'register-submit');
    expect(all(tree)).toContain('Could not reach the server');
    expect(selectProfile).not.toHaveBeenCalled();
  });

  it('tells the person up front that a password cannot be reset, and lets them see it', async () => {
    const tree = await render(RegisterScreen);
    expect(all(tree)).toContain('At least 8 characters. There is no way to reset it');
    expect(box(tree, 'register-password').props.secureTextEntry).toBe(true);
    await pressLabel(tree, 'Show password');
    expect(box(tree, 'register-password').props.secureTextEntry).toBe(false);
  });

  it('stops the username at the Worker\'s 40 characters', async () => {
    const tree = await render(RegisterScreen);
    expect(box(tree, 'register-username').props.maxLength).toBe(40);
  });

  it('goes to log in, replacing this screen', async () => {
    const tree = await render(RegisterScreen);
    await press(tree, 'go-login');
    expect(nav.dispatch).toHaveBeenCalledWith({ type: 'REPLACE', payload: { name: 'Login' } });
  });
});
