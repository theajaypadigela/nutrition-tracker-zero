/**
 * useVapiCall and the call's audio: Daily is put in 'voice' mode before it joins (so the call opens on the earpiece), the
 * audio session starts when the call connects, the call screen can switch the route, and the session lets go when the call
 * ends or the screen closes.
 */
import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

jest.mock('@vapi-ai/react-native', () => {
  const { EventEmitter } = require('events');
  class FakeVapi extends EventEmitter {
    static instances: FakeVapi[] = [];
    daily = { name: 'daily-call-object' };
    start = jest.fn(async () => {
      // As the SDK does: the call object exists (and says so) before it joins.
      this.emit('call-start-progress', { stage: 'daily-call-object-creation', status: 'completed' });
      return { id: 'vapi-call-1' };
    });
    stop = jest.fn(() => this.emit('call-end'));
    setMuted = jest.fn();
    constructor() {
      super();
      FakeVapi.instances.push(this);
    }
    getDailyCallObject() {
      return this.daily;
    }
  }
  return { __esModule: true, default: FakeVapi };
});
jest.mock('react-native-permissions', () => ({
  PERMISSIONS: { IOS: { MICROPHONE: 'mic' }, ANDROID: { RECORD_AUDIO: 'mic' } },
  RESULTS: { GRANTED: 'granted', UNAVAILABLE: 'unavailable' },
  check: jest.fn(async () => 'granted'),
  request: jest.fn(async () => 'granted'),
}));
jest.mock('@/api/client', () => ({
  api: {
    startCall: jest.fn(async () => ({ callId: 7, localDate: '2026-10-13', publicKey: 'public-key', assistant: {} })),
    callStarted: jest.fn(async () => ({})),
    callFailed: jest.fn(async () => ({})),
  },
  deliverVapiMessage: jest.fn(),
  errorMessage: (e: unknown) => String(e),
}));
jest.mock('@/embedded/vapi', () => ({ CallBridge: jest.fn() }));
jest.mock('@/services/calls/native', () => ({
  cancelAutoRetry: jest.fn(),
  consumePendingHangup: jest.fn(async () => null),
  dismissIncomingCall: jest.fn(),
  subscribeToNativeCallEvents: jest.fn(() => () => {}),
}));
const mockSession = { start: jest.fn(async () => {}), setRoute: jest.fn(async () => {}), stop: jest.fn() };
let mockReportAudio: (s: unknown) => void = () => {};
jest.mock('@/services/calls/callAudio', () => ({
  openOnEarpiece: jest.fn(),
  createCallAudioSession: jest.fn((onChange: (s: unknown) => void) => {
    mockReportAudio = onChange;
    return mockSession;
  }),
}));

import Vapi from '@vapi-ai/react-native';
import { useVapiCall } from '@/hooks/useVapiCall';
import { openOnEarpiece } from '@/services/calls/callAudio';

type Hook = ReturnType<typeof useVapiCall>;
let hook!: Hook;
function Probe() {
  hook = useVapiCall();
  return null;
}
const vapi = () => (Vapi as unknown as { instances: (Vapi & { daily: object; emit: (e: string, ...a: unknown[]) => void })[] }).instances.at(-1)!;

let tree: TestRenderer.ReactTestRenderer;
beforeEach(async () => {
  jest.clearAllMocks();
  await act(async () => {
    tree = TestRenderer.create(<Probe />);
  });
});
afterEach(() => act(() => tree?.unmount()));

async function connect() {
  await act(async () => {
    await hook.start('manual');
  });
  await act(async () => {
    vapi().emit('call-start');
  });
}

it("puts Daily in 'voice' mode before the call joins, so it opens on the earpiece", async () => {
  await act(async () => {
    await hook.start('manual');
  });
  expect(openOnEarpiece).toHaveBeenCalledWith(vapi().daily);
  expect(mockSession.start).not.toHaveBeenCalled();
});

it('starts the audio session when the call connects, and shows what it reports', async () => {
  await connect();
  expect(mockSession.start).toHaveBeenCalledWith(vapi().daily);
  const state = { route: 'earpiece', available: ['earpiece', 'speaker'], proximity: true, near: false };
  act(() => mockReportAudio(state));
  expect(hook.audio).toEqual(state);
});

it('switches the route from the call screen', async () => {
  await connect();
  act(() => hook.setAudioRoute('speaker'));
  expect(mockSession.setRoute).toHaveBeenCalledWith('speaker');
});

it('lets go of the audio when the call ends', async () => {
  await connect();
  await act(async () => {
    vapi().emit('call-end');
  });
  expect(mockSession.stop).toHaveBeenCalled();
});

it('lets go of the audio when the screen closes mid-call', async () => {
  await connect();
  mockSession.stop.mockClear();
  act(() => tree.unmount());
  expect(mockSession.stop).toHaveBeenCalled();
});
