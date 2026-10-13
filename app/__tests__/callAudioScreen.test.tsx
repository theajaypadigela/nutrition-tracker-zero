/**
 * The call screen's audio controls (components/voice): Phone or Speaker (and a headset when one is connected) while the
 * call is live, and a cover that swallows touches while the phone is at the ear.
 */
import React from 'react';
import TestRenderer, { act, type ReactTestInstance } from 'react-test-renderer';

jest.mock('@react-navigation/native', () => ({ useIsFocused: () => true }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

import VoiceSessionScreen, { type CallStatus } from '@/components/voice/VoiceSessionScreen';
import type { CallAudioState } from '@/services/calls/audioRoute';
import { ThemeProvider } from '@/theme';

const PHONE: CallAudioState = { route: 'earpiece', available: ['earpiece', 'speaker'], proximity: true, near: false };

let tree: TestRenderer.ReactTestRenderer;
function render({
  status = 'active',
  audio = PHONE,
  shielded = false,
  onSelect = jest.fn(),
  onEnd = jest.fn(),
}: { status?: CallStatus; audio?: CallAudioState | null; shielded?: boolean; onSelect?: jest.Mock; onEnd?: jest.Mock } = {}) {
  act(() => {
    tree = TestRenderer.create(
      <ThemeProvider>
        <VoiceSessionScreen
          title="Food check-in"
          statusText="Tell the assistant what you ate today"
          status={status}
          isSpeaking={false}
          transcript={[]}
          onPrimaryPress={onEnd}
          onDonePress={jest.fn()}
          onRetryPress={jest.fn()}
          disablePrimary={false}
          processingText="Checking"
          doneButtonText="Done"
          audio={audio}
          onSelectAudioRoute={onSelect}
          shielded={shielded}
        />
      </ThemeProvider>,
    );
  });
  return { onSelect, onEnd };
}
afterEach(() => act(() => tree.unmount()));

const byTestId = (id: string) => tree.root.findAll((n: ReactTestInstance) => n.props.testID === id && typeof n.type !== 'string');
const tab = (label: string) =>
  tree.root.findAll((n: ReactTestInstance) => n.props.accessibilityRole === 'tab' && n.props.accessibilityLabel === label && typeof n.type !== 'string')[0];
const textOf = (n: ReactTestInstance): string => [n.props.children].flat(Infinity).filter(c => typeof c === 'string').join('');
const allText = () =>
  tree.root
    .findAll((n: ReactTestInstance) => (n.type as unknown) === 'Text')
    .map(textOf)
    .join(' | ');

describe('Phone or Speaker during a call', () => {
  it('offers Phone and Speaker, with Phone chosen, and says to hold the phone to the ear', () => {
    render();
    expect(tab('Phone')?.props.accessibilityState).toEqual({ selected: true });
    expect(tab('Speaker')?.props.accessibilityState).toEqual({ selected: false });
    expect(allText()).toContain('Hold the phone to your ear; the screen turns off.');
  });

  it('switches to the speaker, and back to the phone', () => {
    const { onSelect } = render();
    act(() => tab('Speaker')!.props.onPress());
    expect(onSelect).toHaveBeenCalledWith('speaker');
    act(() => tree.unmount());
    const second = render({ audio: { ...PHONE, route: 'speaker' } });
    expect(allText()).not.toContain('Hold the phone to your ear');
    act(() => tab('Phone')!.props.onPress());
    expect(second.onSelect).toHaveBeenCalledWith('earpiece');
  });

  it('does nothing when the route already chosen is tapped again', () => {
    const { onSelect } = render();
    act(() => tab('Phone')!.props.onPress());
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('offers a connected headset too, in place of the earpiece for wired headphones', () => {
    render({ audio: { route: 'bluetooth', available: ['earpiece', 'speaker', 'bluetooth'], proximity: true, near: false } });
    expect(tab('Bluetooth')?.props.accessibilityState).toEqual({ selected: true });
    expect(tab('Phone')).toBeDefined();
    act(() => tree.unmount());
    render({ audio: { route: 'wired', available: ['wired', 'speaker'], proximity: true, near: false } });
    expect(tab('Headphones')?.props.accessibilityState).toEqual({ selected: true });
    expect(tab('Phone')).toBeUndefined();
  });

  it('is not there before the call connects, after it ends, or when there is nothing to choose', () => {
    render({ status: 'requesting' });
    expect(byTestId('audio-route')).toHaveLength(0);
    act(() => tree.unmount());
    render({ status: 'completed' });
    expect(byTestId('audio-route')).toHaveLength(0);
    act(() => tree.unmount());
    render({ audio: { route: 'speaker', available: ['speaker'], proximity: false, near: false } });
    expect(byTestId('audio-route')).toHaveLength(0);
    act(() => tree.unmount());
    render({ audio: null });
    expect(byTestId('audio-route')).toHaveLength(0);
  });

  it('leaves out the screen-off promise on a phone that cannot do it', () => {
    render({ audio: { ...PHONE, proximity: false } });
    expect(allText()).toContain('Hold the phone to your ear.');
    expect(allText()).not.toContain('screen turns off');
  });
});

describe('At the ear', () => {
  it('covers the screen and takes every touch, so a cheek cannot end the call', () => {
    render({ shielded: true });
    const [shield] = byTestId('proximity-shield');
    expect(shield).toBeDefined();
    expect(shield!.props.onStartShouldSetResponder()).toBe(true);
    // Drawn after (so over) the End call button.
    const ids = tree.root.findAll((n: ReactTestInstance) => typeof n.type === 'string' && !!n.props.testID).map(n => n.props.testID);
    expect(ids.indexOf('proximity-shield')).toBeGreaterThan(ids.indexOf('end-call'));
    expect(ids.indexOf('end-call')).toBeGreaterThanOrEqual(0);
  });

  it('is not there away from the ear', () => {
    render({ shielded: false });
    expect(byTestId('proximity-shield')).toHaveLength(0);
  });
});
