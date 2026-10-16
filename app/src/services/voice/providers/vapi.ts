import Vapi from '@vapi-ai/react-native';
import { deliverVapiMessage } from '@/api/client';
import { ON_DEVICE } from '@/config/local';
import { CallBridge, SCHEDULE_CALLBACK, voiceToolCallsOf } from '@/embedded/vapi';
import { createCallAudioSession, openOnEarpiece } from '@/services/calls/callAudio';
import { describeVapiError, isMeetingEnded } from '@/services/calls/vapiErrors';
import type { VoiceEndReason } from '../../../../../shared/voice';
import type { VoiceProvider } from '../types';

/** Keeps the original SDK, assistant, bridge and error/audio handling available without editing them. */
export const vapiProvider: VoiceProvider = {
  id: 'vapi',
  create(start, cb) {
    const vapi = new Vapi(start.config.publicKey as string);
    const audio = createCallAudioSession(cb.onAudio);
    const bridge = ON_DEVICE ? new CallBridge({ callRowId: start.callId, localDate: start.localDate, deliver: deliverVapiMessage }) : null;
    let ended = false;
    let active = false;
    let finishing: Promise<void> | null = null;
    let reason: VoiceEndReason = 'assistant-ended-call';
    const callbacksSeen = new Set<string>();
    const finish = () => {
      if (finishing) return finishing;
      ended = true;
      audio.stop();
      cb.onSpeaking(false);
      finishing = (async () => {
        // A failed start has no call report; preserve the original client-side failure instead of replacing it with no_list.
        if (active || bridge?.vapiCallId) await bridge?.finish(reason === 'pipeline-error' ? reason : reason === 'customer-ended-call' ? reason : 'assistant-ended-call');
        await cb.onEnded(reason);
      })();
      return finishing;
    };
    vapi.on('call-start-progress', (e: { stage?: string; status?: string }) => {
      if (e?.stage === 'daily-call-object-creation' && e.status === 'completed') openOnEarpiece(vapi.getDailyCallObject());
    });
    vapi.on('call-start', () => {
      active = true; audio.start(vapi.getDailyCallObject());
      try { vapi.setMuted(false); } catch { /* the SDK may already be ending */ }
    });
    vapi.on('call-end', () => { finish(); });
    vapi.on('speech-start', () => cb.onSpeaking(true));
    vapi.on('speech-end', () => cb.onSpeaking(false));
    vapi.on('message', (msg: any) => {
      bridge?.onMessage(msg);
      // "Call me again in 20 minutes": the server (or the on-device bridge) answers the model; the phone arms the reminder, once per call.
      for (const call of voiceToolCallsOf(msg, [SCHEDULE_CALLBACK])) {
        const id = call.id ?? `${SCHEDULE_CALLBACK}:${JSON.stringify(call.arguments)}`;
        if (callbacksSeen.has(id)) continue;
        callbacksSeen.add(id);
        cb.onFunction({ id, name: SCHEDULE_CALLBACK, arguments: call.arguments }).catch(() => {});
      }
      if (msg?.type === 'transcript' && msg.transcriptType === 'final' && typeof msg.transcript === 'string') {
        cb.onTranscript({ role: msg.role === 'user' ? 'user' : 'assistant', text: msg.transcript });
      }
    });
    vapi.on('error', (e: unknown) => {
      if (active && isMeetingEnded(e)) { finish(); return; }
      reason = 'pipeline-error';
      cb.onError(describeVapiError(e));
      try { vapi.stop(); } catch { /* already stopped */ }
      finish();
    });
    return {
      async start() {
        const call = await vapi.start(start.config.assistant as any);
        if (ended) { vapi.stop(); return; }
        if (!call?.id) throw new Error('Vapi did not start the call. Check your Vapi key and credit.');
        if (bridge) bridge.vapiCallId = call.id;
        await cb.onStarted(call.id);
      },
      async stop(r = 'customer-ended-call') { reason = r; try { vapi.stop(); } finally { await finish(); } },
      setMuted: muted => vapi.setMuted(muted),
      setAudioRoute: route => { audio.setRoute(route); },
      dispose() { finish(); vapi.removeAllListeners(); try { vapi.stop(); } catch { /* already stopped */ } },
    };
  },
};
