import { voiceCredentials, voiceProxyConnection } from '../api';
import { createPcmAudio } from '../pcm';
import type { VoiceProvider } from '../types';
import type { VoiceEndReason } from '../../../../../shared/voice';

export const deepgramProvider: VoiceProvider = {
  id: 'deepgram',
  create(start, cb) {
    let socket: WebSocket | null = null;
    let ended = false;
    let ready = false;
    let speaking = false;
    let settingsSent = false;
    let keepAlive: ReturnType<typeof setInterval> | undefined;
    let limit: ReturnType<typeof setTimeout> | undefined;
    let connectTimeout: ReturnType<typeof setTimeout> | undefined;
    let endTimeout: ReturnType<typeof setTimeout> | undefined;
    let pendingEnd: { id: string; name: string; message: string } | null = null;
    let goodbyeRequested = false;
    let resolveStart: (() => void) | undefined;
    let rejectStart: ((error: Error) => void) | undefined;
    let functions = Promise.resolve();
    let finishing: Promise<void> | null = null;
    const cancelled = new Set<string>();
    const send = (message: unknown) => { if (!ended && socket?.readyState === 1) socket.send(JSON.stringify(message)); };
    const audio = createPcmAudio(data => {
      if (ready && !ended && socket?.readyState === 1) {
        if (socket.bufferedAmount > 256000) { fail('The connection is too slow for a voice call. Please try again.'); return; }
        socket.send(data);
      }
    }, cb.onAudio, message => fail(message));

    const finish = (reason: VoiceEndReason): Promise<void> => {
      if (finishing) return finishing;
      ended = true;
      ready = false;
      clearInterval(keepAlive);
      clearTimeout(limit);
      clearTimeout(connectTimeout);
      clearTimeout(endTimeout);
      rejectStart?.(new Error('The voice call ended before connecting'));
      rejectStart = undefined;
      audio.stop();
      cb.onSpeaking(false);
      if (socket) {
        socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null;
        socket.close();
        socket = null;
      }
      finishing = functions.then(() => cb.onEnded(reason));
      return finishing;
    };
    function fail(message: string) {
      if (ended) return;
      cb.onError(message);
      rejectStart?.(new Error(message));
      rejectStart = undefined;
      finish('pipeline-error');
    }

    const handle = async (raw: unknown) => {
      if (ended) return;
      if (raw instanceof ArrayBuffer) {
        if (!speaking) { speaking = true; cb.onSpeaking(true); }
        audio.play(raw); return;
      }
      if (typeof raw !== 'string') return;
      let msg: any;
      try { msg = JSON.parse(raw); } catch { fail('The voice service sent an unreadable message'); return; }
      switch (msg.type) {
        case 'Welcome':
          if (!settingsSent) { settingsSent = true; send(start.config.settings); }
          break;
        case 'SettingsApplied':
          if (ready) break;
          ready = true;
          await audio.start();
          if (ended) return;
          await cb.onStarted(start.providerCallId!);
          if (ended) return;
          clearTimeout(connectTimeout);
          resolveStart?.();
          rejectStart = undefined;
          keepAlive = setInterval(() => send({ type: 'KeepAlive' }), 5000);
          limit = setTimeout(() => { finish('max-duration'); }, Number(start.config.maxDurationSeconds ?? 600) * 1000);
          break;
        case 'ConversationText':
          if ((msg.role === 'user' || msg.role === 'assistant') && typeof msg.content === 'string') cb.onTranscript({ role: msg.role, text: msg.content });
          break;
        case 'UserStartedSpeaking':
          audio.clear(); speaking = false; cb.onSpeaking(false); break;
        case 'AgentStartedSpeaking': speaking = true; cb.onSpeaking(true); break;
        case 'AgentAudioDone':
          speaking = false;
          if (pendingEnd) {
            if (!goodbyeRequested) { goodbyeRequested = true; send({ type: 'InjectAgentMessage', message: pendingEnd.message }); }
            else {
              const final = pendingEnd;
              pendingEnd = null; clearTimeout(endTimeout);
              send({ type: 'FunctionCallResponse', id: final.id, name: final.name, content: '{"result":"Ending call"}' });
              audio.drain().then(() => finish('assistant-ended-call'));
            }
          }
          audio.drain().then(() => { if (!speaking && !ended) cb.onSpeaking(false); });
          break;
        case 'InjectionRefused': if (pendingEnd) goodbyeRequested = false; break;
        case 'FunctionCallCancelled':
          for (const fn of msg.functions ?? []) if (typeof fn.id === 'string') {
            cancelled.add(fn.id);
            if (pendingEnd?.id === fn.id) { pendingEnd = null; goodbyeRequested = false; clearTimeout(endTimeout); }
          }
          break;
        case 'FunctionCallRequest':
          for (const fn of msg.functions ?? []) {
            if (!fn.client_side || typeof fn.id !== 'string' || typeof fn.name !== 'string') continue;
            functions = functions.then(async () => {
              if (ended || cancelled.has(fn.id)) return;
              if (fn.name === 'end_call') {
                let args = fn.arguments ?? fn.input;
                if (typeof args === 'string') { try { args = JSON.parse(args); } catch { args = {}; } }
                pendingEnd = { id: fn.id, name: fn.name, message: typeof args?.message === 'string'
                  ? args.message.slice(0, 500) : 'Thanks for checking in. Goodbye.' };
                goodbyeRequested = true;
                // The agent is waiting on this tool. Inject its final line, then acknowledge and close after playback.
                send({ type: 'InjectAgentMessage', message: pendingEnd.message });
                endTimeout = setTimeout(() => {
                  if (pendingEnd) send({ type: 'FunctionCallResponse', id: pendingEnd.id, name: pendingEnd.name, content: '{"result":"Ending call"}' });
                  audio.drain().then(() => finish('assistant-ended-call'));
                }, 10000);
                return;
              }
              let result: Record<string, unknown>;
              try { result = await cb.onFunction({ id: fn.id, name: fn.name, arguments: fn.arguments ?? fn.input }); }
              catch { result = { error: 'The change could not be saved. Please retry the requested function or use the app.' }; }
              if (!cancelled.has(fn.id)) send({ type: 'FunctionCallResponse', id: fn.id, name: fn.name, content: JSON.stringify(result) });
            }).catch(() => fail('The voice tool could not be handled'));
          }
          break;
        case 'Error': fail(typeof msg.description === 'string' ? msg.description : 'Deepgram could not continue the voice call'); break;
      }
    };
    return {
      async start() {
        const credentials = await voiceCredentials();
        if (ended) return;
        if (start.config.url !== 'wss://agent.deepgram.com/v1/agent/converse') throw new Error('Invalid Deepgram endpoint');
        await new Promise<void>((resolve, reject) => {
          resolveStart = resolve;
          rejectStart = reject;
          // React Native supports custom headers; only the short-lived JWT crosses to the phone.
          const connection = credentials.transport === 'proxy' ? voiceProxyConnection()
            : { url: start.config.url as string, headers: { Authorization: `Bearer ${credentials.accessToken}` } };
          socket = new WebSocket(connection.url, undefined, { headers: connection.headers });
          socket.binaryType = 'arraybuffer';
          connectTimeout = setTimeout(() => fail('The voice assistant took too long to connect'), 20000);
          socket.onmessage = event => { handle(event.data).catch(() => fail('Could not start the microphone or process the voice response')); };
          socket.onerror = () => fail('Could not connect to Deepgram. Check your connection and backend configuration.');
          socket.onclose = event => {
            if (ended) return;
            if (ready && event.code === 1000) finish('assistant-ended-call');
            else fail('The voice connection was interrupted. Saved meals are still available.');
          };
        });
      },
      stop: reason => finish(reason ?? 'customer-ended-call'),
      setMuted: muted => audio.setMuted(muted),
      setAudioRoute: route => audio.setRoute(route),
      dispose() { finish('customer-ended-call'); },
    };
  },
};
