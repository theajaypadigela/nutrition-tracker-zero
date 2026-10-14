import type { VoiceCallbacks } from '@/services/voice/types';
import type { VoiceStart } from '../../../shared/voice';

const mockAudio = { start: jest.fn(async () => {}), stop: jest.fn(), play: jest.fn(), clear: jest.fn(),
  drain: jest.fn(async () => {}), setMuted: jest.fn(), setRoute: jest.fn() };
let mockInput: (data: ArrayBuffer) => void;
let mockAudioError: (message: string) => void;
jest.mock('@/services/voice/pcm', () => ({ createPcmAudio: jest.fn((input, _audio, error) => {
  mockInput = input; mockAudioError = error; return mockAudio;
}) }));
jest.mock('@/services/voice/api', () => ({
  voiceCredentials: jest.fn(async () => ({ transport: 'direct', accessToken: 'ephemeral-jwt', expiresIn: 30 })),
  voiceProxyConnection: () => ({ url: 'wss://worker.example/voice/connect', headers: { Authorization: 'Bearer app-token' } }),
}));
import { deepgramProvider } from '@/services/voice/providers/deepgram';
import { voiceCredentials } from '@/services/voice/api';

class Socket {
  static instances: Socket[] = [];
  readyState = 1;
  bufferedAmount = 0;
  binaryType = '';
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  onopen: (() => void) | null = null;
  send = jest.fn();
  close = jest.fn(() => { this.readyState = 3; });
  constructor(public url: string, _protocol: unknown, public options: unknown) { Socket.instances.push(this); }
  message(data: unknown) { this.onmessage?.({ data: data instanceof ArrayBuffer ? data : JSON.stringify(data) }); }
}
const flush = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
const socket = () => Socket.instances.at(-1)!;
const base: VoiceStart = { callId: 1, localDate: '2026-10-13', provider: 'deepgram', providerCallId: 'deepgram:1', lifecycle: 'client',
  config: { url: 'wss://agent.deepgram.com/v1/agent/converse', settings: { type: 'Settings' }, maxDurationSeconds: 600 } };
let cb: VoiceCallbacks;
let session: ReturnType<typeof deepgramProvider.create>;
let original: typeof WebSocket;
beforeEach(() => {
  jest.useFakeTimers(); jest.clearAllMocks(); Socket.instances = [];
  original = global.WebSocket; global.WebSocket = Socket as unknown as typeof WebSocket;
  (voiceCredentials as jest.Mock).mockResolvedValue({ transport: 'direct', accessToken: 'ephemeral-jwt', expiresIn: 30 });
  cb = { onStarted: jest.fn(async () => {}), onEnded: jest.fn(async () => {}), onError: jest.fn(), onTranscript: jest.fn(),
    onSpeaking: jest.fn(), onAudio: jest.fn(), onFunction: jest.fn(async () => ({ result: 'Saved 1 items' })) };
  session = deepgramProvider.create(base, cb);
});
afterEach(async () => { session.dispose(); await flush(); global.WebSocket = original; jest.useRealTimers(); });
async function connect() {
  const started = session.start(); await flush();
  socket().message({ type: 'Welcome', request_id: 'dg1' });
  socket().message({ type: 'SettingsApplied' });
  await started;
}
it('uses only a temporary JWT and starts capture after settings are accepted', async () => {
  const started = session.start(); await flush();
  expect(socket().options).toEqual({ headers: { Authorization: 'Bearer ephemeral-jwt' } });
  expect(mockAudio.start).not.toHaveBeenCalled();
  socket().message({ type: 'Welcome' });
  expect(socket().send).toHaveBeenCalledWith('{"type":"Settings"}');
  socket().message({ type: 'SettingsApplied' }); await started;
  expect(cb.onStarted).toHaveBeenCalledWith('deepgram:1');
  const audio = new ArrayBuffer(1280); mockInput(audio);
  expect(socket().send).toHaveBeenCalledWith(audio);
});
it('supports backend proxy mode without passing the Deepgram key to the app', async () => {
  (voiceCredentials as jest.Mock).mockResolvedValue({ transport: 'proxy' });
  await connect();
  expect(socket().url).toBe('wss://worker.example/voice/connect');
  expect(socket().options).toEqual({ headers: { Authorization: 'Bearer app-token' } });
});
it('normalizes transcripts, plays PCM and clears pending speech on interruption', async () => {
  await connect();
  socket().message({ type: 'ConversationText', role: 'user', content: 'Two idli' });
  socket().message({ type: 'AgentStartedSpeaking' });
  const output = new ArrayBuffer(2048); socket().message(output);
  expect(cb.onTranscript).toHaveBeenCalledWith({ role: 'user', text: 'Two idli' });
  expect(mockAudio.play).toHaveBeenCalledWith(output);
  socket().message({ type: 'UserStartedSpeaking' });
  expect(mockAudio.clear).toHaveBeenCalledTimes(1);
  expect(cb.onSpeaking).toHaveBeenLastCalledWith(false);
  session.setMuted(true); session.setAudioRoute('speaker');
  expect(mockAudio.setMuted).toHaveBeenCalledWith(true);
  expect(mockAudio.setRoute).toHaveBeenCalledWith('speaker');
});
it('waits for the meal write before replying to the agent and serializes tools', async () => {
  await connect();
  let saved!: (result: Record<string, unknown>) => void;
  (cb.onFunction as jest.Mock).mockReturnValueOnce(new Promise(resolve => { saved = resolve; }));
  socket().message({ type: 'FunctionCallRequest', functions: [
    { id: 'f1', name: 'save_foods', arguments: '{"items":[]}', client_side: true },
    { id: 'f2', name: 'save_foods', arguments: '{}', client_side: true },
  ] });
  await flush(); expect(cb.onFunction).toHaveBeenCalledTimes(1);
  expect(socket().send.mock.calls.map(c => c[0]).join()).not.toContain('FunctionCallResponse');
  saved({ result: 'Saved 1 items' }); await flush();
  expect(cb.onFunction).toHaveBeenCalledTimes(2);
  expect(socket().send).toHaveBeenCalledWith(JSON.stringify({ type: 'FunctionCallResponse', id: 'f1', name: 'save_foods', content: '{"result":"Saved 1 items"}' }));
});
it('returns failed-save feedback so the agent can retry', async () => {
  await connect(); (cb.onFunction as jest.Mock).mockRejectedValueOnce(new Error('network'));
  socket().message({ type: 'FunctionCallRequest', functions: [{ id: 'f', name: 'save_foods', arguments: '{}', client_side: true }] });
  await flush();
  expect(socket().send.mock.calls.map(c => c[0]).join()).toContain('could not be saved');
  expect(cb.onError).not.toHaveBeenCalled();
});
it('does not execute a cancelled queued function', async () => {
  await connect();
  socket().message({ type: 'FunctionCallRequest', functions: [{ id: 'f', name: 'save_foods', arguments: '{}', client_side: true }] });
  socket().message({ type: 'FunctionCallCancelled', functions: [{ id: 'f' }] });
  await flush(); expect(cb.onFunction).not.toHaveBeenCalled();
});
it('drains speech before the assistant ends and closes once', async () => {
  await connect();
  socket().message({ type: 'FunctionCallRequest', functions: [{ id: 'end', name: 'end_call', arguments: '{}', client_side: true }] });
  await flush();
  expect(cb.onEnded).not.toHaveBeenCalled();
  socket().message({ type: 'AgentAudioDone' }); await flush();
  expect(mockAudio.drain).toHaveBeenCalled();
  expect(cb.onEnded).toHaveBeenCalledWith('assistant-ended-call');
  session.dispose(); await flush(); expect(cb.onEnded).toHaveBeenCalledTimes(1);
});
it('tears down timers, microphone and socket on native capture errors', async () => {
  await connect(); mockAudioError('Microphone disconnected'); await flush();
  expect(cb.onError).toHaveBeenCalledWith('Microphone disconnected');
  expect(cb.onEnded).toHaveBeenCalledWith('pipeline-error');
  expect(mockAudio.stop).toHaveBeenCalledTimes(1);
  expect(socket().close).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});
it('times out connection setup with cleanup', async () => {
  const started = session.start(); const rejection = started.then(() => null, (e: Error) => e); await flush();
  jest.advanceTimersByTime(20000); expect((await rejection)?.message).toContain('too long'); await flush();
  expect(cb.onEnded).toHaveBeenCalledWith('pipeline-error'); expect(mockAudio.stop).toHaveBeenCalled();
});
it('cancels safely while credentials are still loading', async () => {
  let credentials!: (value: unknown) => void;
  (voiceCredentials as jest.Mock).mockReturnValueOnce(new Promise(resolve => { credentials = resolve; }));
  const started = session.start(); await session.stop(); credentials({ transport: 'proxy' }); await started;
  expect(Socket.instances).toHaveLength(0); expect(cb.onEnded).toHaveBeenCalledTimes(1);
});
