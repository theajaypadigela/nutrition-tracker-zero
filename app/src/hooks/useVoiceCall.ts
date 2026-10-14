import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { check, request, PERMISSIONS, RESULTS } from 'react-native-permissions';
import { api, errorMessage } from '@/api/client';
import type { CallKind } from '@/api/types';
import { cancelAutoRetry, consumePendingHangup, dismissIncomingCall, subscribeToNativeCallEvents } from '@/services/calls/native';
import type { AudioRoute, CallAudioState } from '@/services/calls/audioRoute';
import { reminderLog } from '@/services/calls/logger';
import { voiceApi } from '@/services/voice/api';
import { createVoiceSession } from '@/services/voice/registry';
import type { TranscriptLine, VoiceSession, VoiceStatus } from '@/services/voice/types';
export type { TranscriptLine, VoiceStatus } from '@/services/voice/types';

/** One lifecycle for every provider; application screens never import SDKs. */
export function useVoiceCall() {
  const [status, setStatus] = useState<VoiceStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [audio, setAudio] = useState<CallAudioState | null>(null);
  const [session, setSession] = useState<{ callId: number; localDate: string; providerCallId: string | null; provider: string } | null>(null);
  const current = useRef<VoiceSession | null>(null);
  const generation = useRef(0);
  const statusRef = useRef<VoiceStatus>('idle');
  const mounted = useRef(true);
  const update = useCallback((next: VoiceStatus) => { statusRef.current = next; if (mounted.current) setStatus(next); }, []);

  const stop = useCallback(() => {
    const stopRun = ++generation.current;
    dismissIncomingCall();
    const active = current.current;
    current.current = null;
    if (active) active.stop().catch(e => { if (mounted.current) setError(errorMessage(e)); }).finally(() => {
      active.dispose(); if (generation.current === stopRun && mounted.current) update('ended');
    });
    else update('ended');
  }, [update]);

  const start = useCallback(async (kind: CallKind) => {
    if (statusRef.current === 'connecting' || statusRef.current === 'active') return;
    update('connecting');
    const run = ++generation.current;
    current.current?.dispose();
    current.current = null;
    setError(null); setTranscript([]); setSession(null); setAudio(null); setIsSpeaking(false);
    let callId: number | null = null;
    let connected = false;
    let reported = false;
    let ended = false;
    let failed = false;
    const lines: TranscriptLine[] = [];
    const startedAt = Date.now();
    let queue = Promise.resolve();
    const valid = () => mounted.current && generation.current === run;
    try {
      if (await consumePendingHangup()) { if (valid()) update('ended'); return; }
      const permission = Platform.OS === 'ios' ? PERMISSIONS.IOS.MICROPHONE : PERMISSIONS.ANDROID.RECORD_AUDIO;
      const result = await check(permission);
      if (result !== RESULTS.GRANTED && result !== RESULTS.UNAVAILABLE && await request(permission) !== RESULTS.GRANTED) {
        throw new Error('Microphone permission is needed for the call. Allow it in Settings and try again.');
      }
      if (!valid()) return;
      const started = await voiceApi.start(kind);
      callId = started.callId;
      if (!valid()) { await api.callFailed(callId, 'Call cancelled before connecting'); return; }
      setSession({ callId, localDate: started.localDate, providerCallId: started.providerCallId, provider: started.provider });
      const provider = createVoiceSession(started, {
        async onStarted(id) {
          if (ended || !valid()) return;
          connected = true;
          update('active'); cancelAutoRetry();
          setSession({ callId: started.callId, localDate: started.localDate, providerCallId: id, provider: started.provider });
          try {
            if (started.lifecycle === 'client') await voiceApi.started(started.callId);
            else await api.callStarted(started.callId, id);
          } catch (e) { reminderLog.warn('call.link_failed', errorMessage(e)); }
        },
        async onEnded(reason) {
          if (ended) return;
          ended = true;
          await queue;
          if (started.lifecycle === 'client') {
            try { await voiceApi.ended(started.callId, reason, lines.map(l => `${l.role === 'user' ? 'User' : 'AI'}: ${l.text}`).join('\n'), (Date.now() - startedAt) / 1000); }
            catch { if (valid()) setError('The call ended, but its final report could not be saved. Check your meals in Today.'); }
          }
          if (valid()) { setIsSpeaking(false); setAudio(null); dismissIncomingCall(); update(failed ? 'error' : 'ended'); }
        },
        onError(message) {
          failed = true;
          if (!connected && !reported) { reported = true; api.callFailed(started.callId, message).catch(() => {}); }
          if (valid()) { setError(message); update('error'); dismissIncomingCall(); }
        },
        onTranscript(line) { lines.push(line); if (valid()) setTranscript(prev => [...prev, line]); },
        onSpeaking(value) { if (valid()) setIsSpeaking(value); },
        onAudio(value) { if (valid()) setAudio(value); },
        onFunction(call) {
          const functionResult = queue.then(() => voiceApi.tool(started.callId, call));
          queue = functionResult.then(() => undefined, () => undefined);
          return functionResult;
        },
      });
      current.current = provider;
      await provider.start();
    } catch (e) {
      failed = true;
      if (callId !== null && !connected && !reported) { reported = true; api.callFailed(callId, errorMessage(e)).catch(() => {}); }
      if (valid()) { setError(errorMessage(e)); update('error'); dismissIncomingCall(); current.current?.dispose(); current.current = null; }
    }
  }, [update]);

  const setAudioRoute = useCallback((route: AudioRoute) => current.current?.setAudioRoute(route), []);
  const setMuted = useCallback((muted: boolean) => current.current?.setMuted(muted), []);
  useEffect(() => {
    mounted.current = true;
    const generationRef = generation;
    const onHangup = async () => { if (await consumePendingHangup()) stop(); };
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') onHangup(); });
    const unsubscribe = subscribeToNativeCallEvents(event => { if (event === 'ended') onHangup(); });
    return () => {
      mounted.current = false; generationRef.current++;
      subscription.remove(); unsubscribe(); current.current?.dispose(); current.current = null; dismissIncomingCall();
    };
  }, [stop]);
  return { status, error, transcript, isSpeaking, session, audio, setAudioRoute, setMuted, start, stop };
}
