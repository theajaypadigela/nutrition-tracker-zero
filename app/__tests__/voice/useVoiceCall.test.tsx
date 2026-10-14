import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import type { VoiceCallbacks, VoiceSession } from '@/services/voice/types';

jest.mock('react-native-permissions', () => ({ PERMISSIONS: { IOS: { MICROPHONE: 'mic' }, ANDROID: { RECORD_AUDIO: 'mic' } },
  RESULTS: { GRANTED: 'granted', UNAVAILABLE: 'unavailable' }, check: jest.fn(async () => 'granted'), request: jest.fn(async () => 'denied') }));
jest.mock('@/api/client', () => ({ api: { callStarted: jest.fn(async () => ({})), callFailed: jest.fn(async () => ({})) },
  errorMessage: (e: unknown) => e instanceof Error ? e.message : String(e) }));
jest.mock('@/services/voice/api', () => ({ voiceApi: { start: jest.fn(), started: jest.fn(async () => ({})),
  tool: jest.fn(async () => ({ result: 'Saved 1 items' })), ended: jest.fn(async () => ({})) } }));
jest.mock('@/services/calls/native', () => ({ cancelAutoRetry: jest.fn(), consumePendingHangup: jest.fn(async () => false),
  dismissIncomingCall: jest.fn(), subscribeToNativeCallEvents: jest.fn(() => () => {}) }));
const mockSessions: { callbacks: VoiceCallbacks; session: VoiceSession }[] = [];
jest.mock('@/services/voice/registry', () => ({ createVoiceSession: jest.fn((start, callbacks: VoiceCallbacks) => {
  const session: VoiceSession = { start: jest.fn(async () => { await callbacks.onStarted(start.providerCallId ?? 'vapi1'); }),
    stop: jest.fn(async () => { await callbacks.onEnded('customer-ended-call'); }),
    dispose: jest.fn(), setMuted: jest.fn(), setAudioRoute: jest.fn() };
  mockSessions.push({ callbacks, session }); return session;
}) }));
import { useVoiceCall } from '@/hooks/useVoiceCall';
import { voiceApi } from '@/services/voice/api';
import { api } from '@/api/client';
import { check } from 'react-native-permissions';
import { cancelAutoRetry } from '@/services/calls/native';

let hook: ReturnType<typeof useVoiceCall>;
let tree: TestRenderer.ReactTestRenderer;
const base = { callId: 7, localDate: '2026-10-13', provider: 'deepgram', providerCallId: 'deepgram:7', lifecycle: 'client', config: {} };
function Probe() { hook = useVoiceCall(); return null; }
beforeEach(async () => {
  jest.clearAllMocks(); mockSessions.length = 0;
  (voiceApi.start as jest.Mock).mockResolvedValue(base);
  (check as jest.Mock).mockResolvedValue('granted');
  await act(async () => { tree = TestRenderer.create(<Probe />); });
});
afterEach(async () => { await act(async () => tree.unmount()); });
const latest = () => mockSessions.at(-1)!;
it('starts the selected provider and cancels the automatic re-ring after connection', async () => {
  await act(async () => { await hook.start('manual'); });
  expect(hook.status).toBe('active'); expect(hook.session?.providerCallId).toBe('deepgram:7');
  expect(voiceApi.started).toHaveBeenCalledWith(7); expect(api.callStarted).not.toHaveBeenCalled();
  expect(cancelAutoRetry).toHaveBeenCalledTimes(1);
  act(() => hook.setAudioRoute('speaker')); act(() => hook.setMuted(true));
  expect(latest().session.setAudioRoute).toHaveBeenCalledWith('speaker');
  expect(latest().session.setMuted).toHaveBeenCalledWith(true);
});
it('keeps Vapi linking and its provider lifecycle available through the same hook', async () => {
  (voiceApi.start as jest.Mock).mockResolvedValue({ ...base, provider: 'vapi', providerCallId: null, lifecycle: 'provider' });
  await act(async () => { await hook.start('test'); });
  expect(api.callStarted).toHaveBeenCalledWith(7, 'vapi1');
  await act(async () => { await latest().callbacks.onEnded('assistant-ended-call'); });
  expect(voiceApi.ended).not.toHaveBeenCalled(); expect(hook.status).toBe('ended');
});
it('orders tool writes before the final transcript and outcome report', async () => {
  await act(async () => { await hook.start('manual'); });
  let save!: (result: unknown) => void;
  (voiceApi.tool as jest.Mock).mockReturnValueOnce(new Promise(resolve => { save = resolve; }));
  act(() => latest().callbacks.onTranscript({ role: 'user', text: 'Two idli' }));
  const saving = latest().callbacks.onFunction({ id: 'f1', name: 'save_foods', arguments: { items: [] } });
  const ending = latest().callbacks.onEnded('assistant-ended-call');
  await act(async () => { await Promise.resolve(); });
  expect(voiceApi.ended).not.toHaveBeenCalled();
  await act(async () => { save({ result: 'Saved 1 items' }); await saving; await ending; });
  expect(voiceApi.ended).toHaveBeenCalledWith(7, 'assistant-ended-call', 'User: Two idli', expect.any(Number));
  expect(hook.status).toBe('ended');
});
it('preserves a connection failure as an error', async () => {
  (voiceApi.start as jest.Mock).mockRejectedValueOnce(new Error('Backend unavailable'));
  await act(async () => { await hook.start('manual'); });
  expect(hook.status).toBe('error'); expect(hook.error).toBe('Backend unavailable');
  expect(api.callFailed).not.toHaveBeenCalled();
});
it('checks microphone permission before allocating a call', async () => {
  (check as jest.Mock).mockResolvedValueOnce('denied');
  await act(async () => { await hook.start('manual'); });
  expect(voiceApi.start).not.toHaveBeenCalled(); expect(hook.error).toContain('Microphone permission');
});
it('does not launch a late session after cancellation during backend startup', async () => {
  let response!: (value: unknown) => void;
  (voiceApi.start as jest.Mock).mockReturnValueOnce(new Promise(resolve => { response = resolve; }));
  let starting!: Promise<void>;
  await act(async () => { starting = hook.start('manual'); await Promise.resolve(); });
  act(() => hook.stop());
  await act(async () => { response(base); await starting; });
  expect(mockSessions).toHaveLength(0); expect(api.callFailed).toHaveBeenCalledWith(7, 'Call cancelled before connecting');
  expect(hook.status).toBe('ended');
});
it('ignores stale callbacks after hang-up and releases the provider', async () => {
  await act(async () => { await hook.start('manual'); });
  await act(async () => { hook.stop(); });
  const old = latest();
  act(() => { old.callbacks.onTranscript({ role: 'user', text: 'stale' }); old.callbacks.onSpeaking(true); });
  expect(hook.transcript).toEqual([]); expect(hook.isSpeaking).toBe(false);
  expect(old.session.stop).toHaveBeenCalledTimes(1); expect(old.session.dispose).toHaveBeenCalled();
});
it('does not allocate a second session on rapid Start taps', async () => {
  await act(async () => { await Promise.all([hook.start('manual'), hook.start('manual')]); });
  expect(voiceApi.start).toHaveBeenCalledTimes(1); expect(mockSessions).toHaveLength(1);
});
