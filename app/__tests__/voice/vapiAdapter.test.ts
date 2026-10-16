import type { VoiceCallbacks } from '@/services/voice/types';
const mockBridge = { vapiCallId: null as string | null, onMessage: jest.fn(), finish: jest.fn(async () => {}) };
const mockAudio = { start: jest.fn(async () => {}), stop: jest.fn(), setRoute: jest.fn(async () => {}) };
jest.mock('@/config/local', () => ({ ON_DEVICE: true }));
jest.mock('@/api/client', () => ({ deliverVapiMessage: jest.fn() }));
jest.mock('@/embedded/vapi', () => ({ ...jest.requireActual('@/embedded/vapi'), CallBridge: jest.fn(() => mockBridge) }));
jest.mock('@/services/calls/callAudio', () => ({ createCallAudioSession: () => mockAudio, openOnEarpiece: jest.fn() }));
jest.mock('@vapi-ai/react-native', () => {
  const { EventEmitter } = require('events');
  class Vapi extends EventEmitter {
    static latest: Vapi;
    daily = {};
    start = jest.fn(async () => {
      this.emit('call-start-progress', { stage: 'daily-call-object-creation', status: 'completed' });
      this.emit('call-start'); return { id: 'original-vapi-id' };
    });
    stop = jest.fn(() => this.emit('call-end'));
    setMuted = jest.fn();
    key = '';
    constructor(mockKey: string) { super(); this.key = mockKey; Vapi.latest = this; }
    getDailyCallObject() { return this.daily; }
  }
  return { __esModule: true, default: Vapi };
});
import Vapi from '@vapi-ai/react-native';
import { vapiProvider } from '@/services/voice/providers/vapi';
import { openOnEarpiece } from '@/services/calls/callAudio';
const sdk = () => (Vapi as unknown as { latest: Vapi & { emit(name: string, data?: unknown): void; key: string; daily: object } }).latest;
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
let callbacks: VoiceCallbacks;
let session: ReturnType<typeof vapiProvider.create>;
beforeEach(() => {
  jest.clearAllMocks(); mockBridge.vapiCallId = null; mockBridge.finish.mockResolvedValue(undefined);
  callbacks = { onStarted: jest.fn(async () => {}), onEnded: jest.fn(async () => {}), onError: jest.fn(), onTranscript: jest.fn(),
    onSpeaking: jest.fn(), onAudio: jest.fn(), onFunction: jest.fn(async () => ({})) };
  session = vapiProvider.create({ callId: 3, localDate: '2026-10-13', provider: 'vapi', providerCallId: null,
    lifecycle: 'provider', config: { publicKey: 'preserved-public-key', assistant: { name: 'preserved-assistant' } } }, callbacks);
});
afterEach(async () => { session.dispose(); await flush(); });
it('reuses the original assistant, SDK and private audio routing', async () => {
  await session.start();
  expect(sdk().key).toBe('preserved-public-key');
  expect(sdk().start).toHaveBeenCalledWith({ name: 'preserved-assistant' });
  expect(openOnEarpiece).toHaveBeenCalledWith(sdk().daily);
  expect(mockBridge.vapiCallId).toBe('original-vapi-id');
  expect(callbacks.onStarted).toHaveBeenCalledWith('original-vapi-id');
});
it('feeds the preserved embedded bridge and normalizes transcripts', async () => {
  await session.start();
  const message = { type: 'transcript', transcriptType: 'final', role: 'user', transcript: 'Two idli' };
  sdk().emit('message', message);
  expect(mockBridge.onMessage).toHaveBeenCalledWith(message);
  expect(callbacks.onTranscript).toHaveBeenCalledWith({ role: 'user', text: 'Two idli' });
});
it('finishes the original embedded report before the common lifecycle ends', async () => {
  await session.start();
  let finish!: () => void;
  mockBridge.finish.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  const stopping = session.stop(); await flush();
  expect(callbacks.onEnded).not.toHaveBeenCalled();
  finish(); await stopping;
  expect(mockBridge.finish).toHaveBeenCalledTimes(1);
  expect(callbacks.onEnded).toHaveBeenCalledWith('customer-ended-call');
});
it('preserves start failures instead of creating a no-list report', async () => {
  (sdk().start as jest.Mock).mockImplementationOnce(async () => { sdk().emit('error', new Error('Invalid Key')); return null; });
  await session.start(); await flush();
  expect(callbacks.onError).toHaveBeenCalledWith('Invalid Key');
  expect(mockBridge.finish).not.toHaveBeenCalled(); expect(callbacks.onStarted).not.toHaveBeenCalled();
});
it('treats a server hang-up as normal completion', async () => {
  await session.start(); sdk().emit('error', { errorMsg: 'Meeting has ended' }); await flush();
  expect(callbacks.onError).not.toHaveBeenCalled();
  expect(callbacks.onEnded).toHaveBeenCalledWith('assistant-ended-call');
});

describe('"call me again in 20 minutes" over Vapi', () => {
  const tool = (id: string | undefined, args: unknown, name = 'schedule_callback') => ({ type: 'tool-calls', toolCallList: [{ ...(id ? { id } : {}), function: { name, arguments: args } }] });
  it('hands the phone the call back to arm, once per call, whether the server or the app answers the model', async () => {
    await session.start();
    sdk().emit('message', tool('cb1', { minutes: 20 }));
    sdk().emit('message', tool('cb1', { minutes: 20 })); // a repeat of the same message
    expect(callbacks.onFunction).toHaveBeenCalledTimes(1);
    expect(callbacks.onFunction).toHaveBeenCalledWith({ id: 'cb1', name: 'schedule_callback', arguments: { minutes: 20 } });
    sdk().emit('message', tool('cb2', JSON.stringify({ minutes: 45 })));
    expect(callbacks.onFunction).toHaveBeenLastCalledWith({ id: 'cb2', name: 'schedule_callback', arguments: JSON.stringify({ minutes: 45 }) });
    // a message with no id is still told apart by what it asks
    sdk().emit('message', tool(undefined, { minutes: 5 }));
    sdk().emit('message', tool(undefined, { minutes: 5 }));
    expect(callbacks.onFunction).toHaveBeenCalledTimes(3);
  });
  it('leaves the meal saves to the bridge: only a call back reaches the phone\'s own handler', async () => {
    await session.start();
    sdk().emit('message', tool('s1', { items: [] }, 'save_foods'));
    sdk().emit('message', tool('d1', { confirmed: true }, 'mark_day_complete'));
    expect(callbacks.onFunction).not.toHaveBeenCalled();
    expect(mockBridge.onMessage).toHaveBeenCalledTimes(2);
  });
  it('does not stop the call when handling it fails', async () => {
    (callbacks.onFunction as jest.Mock).mockRejectedValueOnce(new Error('could not arm'));
    await session.start();
    expect(() => sdk().emit('message', tool('cb1', { minutes: 20 }))).not.toThrow();
    await flush();
    expect(callbacks.onError).not.toHaveBeenCalled();
  });
});
