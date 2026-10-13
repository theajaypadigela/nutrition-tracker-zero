import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import Vapi from '@vapi-ai/react-native';
import { PERMISSIONS, RESULTS, check, request } from 'react-native-permissions';
import { api, deliverVapiMessage, errorMessage } from '@/api/client';
import type { CallKind } from '@/api/types';
import { ON_DEVICE } from '@/config/local';
import { CallBridge, type EndedReason } from '@/embedded/vapi';
import { reminderLog } from '@/services/calls/logger';
import { describeVapiError, isMeetingEnded } from '@/services/calls/vapiErrors';
import {
  cancelAutoRetry,
  consumePendingHangup,
  dismissIncomingCall,
  subscribeToNativeCallEvents,
} from '@/services/calls/native';

export type VoiceStatus = 'idle' | 'connecting' | 'active' | 'ended' | 'error';

export interface TranscriptLine {
  role: 'assistant' | 'user';
  text: string;
}

async function ensureMicrophone(): Promise<boolean> {
  const perm = Platform.OS === 'ios' ? PERMISSIONS.IOS.MICROPHONE : PERMISSIONS.ANDROID.RECORD_AUDIO;
  const current = await check(perm);
  if (current === RESULTS.GRANTED) return true;
  // Unavailable means the handler couldn't be queried; let the OS capture prompt decide.
  if (current === RESULTS.UNAVAILABLE) return true;
  return (await request(perm)) === RESULTS.GRANTED;
}

/**
 * One Vapi web call: POST /calls/start (server records the call and builds the inline assistant),
 * vapi.start(assistant), then link the Vapi call id or report the failure (PLAN.md §9.1).
 *
 * When the Worker runs inside the app (ON_DEVICE) no server receives Vapi's messages, so a CallBridge feeds the call's
 * save_foods and its end-of-call report to the same webhook handler (src/embedded/vapi.ts).
 */
export function useVapiCall() {
  const [status, setStatus] = useState<VoiceStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [session, setSession] = useState<{ callId: number; localDate: string; vapiCallId: string | null } | null>(null);

  const vapiRef = useRef<Vapi | null>(null);
  const statusRef = useRef<VoiceStatus>('idle');
  const callRowRef = useRef<number | null>(null);
  const failureReportedRef = useRef(false);
  const bridgeRef = useRef<CallBridge | null>(null);
  const endedByUserRef = useRef(false);

  const update = useCallback((s: VoiceStatus) => {
    statusRef.current = s;
    setStatus(s);
  }, []);

  const dispose = useCallback(() => {
    const v = vapiRef.current;
    vapiRef.current = null;
    // Leaving the screen mid-call: the listeners go now, so the call's report would never be sent; send it first.
    const bridge = bridgeRef.current;
    bridgeRef.current = null;
    if (bridge && !bridge.finished && bridge.vapiCallId) bridge.finish('customer-ended-call');
    if (!v) return;
    v.removeAllListeners();
    try {
      v.stop();
    } catch {
      // ignore
    }
  }, []);

  const fail = useCallback(
    (reason: string) => {
      setError(reason);
      update('error');
      dismissIncomingCall();
      const rowId = callRowRef.current;
      // Only a call that never connected is a client-side failure; later ones get an end-of-call report.
      if (rowId !== null && !failureReportedRef.current) {
        failureReportedRef.current = true;
        api.callFailed(rowId, reason).catch(() => {});
      }
    },
    [update],
  );

  const start = useCallback(
    async (kind: CallKind) => {
      if (statusRef.current === 'connecting' || statusRef.current === 'active') return;
      if (await consumePendingHangup()) {
        update('ended');
        return;
      }
      dispose();
      setError(null);
      setTranscript([]);
      setSession(null);
      callRowRef.current = null;
      failureReportedRef.current = false;
      endedByUserRef.current = false;
      update('connecting');

      let micOk = false;
      try {
        micOk = await ensureMicrophone();
      } catch {
        micOk = false;
      }
      if (!micOk) {
        fail('Microphone permission is needed for the call. Allow it in Settings and try again.');
        return;
      }

      let started;
      try {
        started = await api.startCall(kind);
      } catch (e) {
        fail(errorMessage(e));
        return;
      }
      callRowRef.current = started.callId;
      setSession({ callId: started.callId, localDate: started.localDate, vapiCallId: null });

      const vapi = new Vapi(started.publicKey);
      vapiRef.current = vapi;
      const bridge = ON_DEVICE ? new CallBridge({ callRowId: started.callId, localDate: started.localDate, deliver: deliverVapiMessage }) : null;
      bridgeRef.current = bridge;
      const endReason = (): EndedReason => (endedByUserRef.current ? 'customer-ended-call' : 'assistant-ended-call');
      vapi.on('call-start', () => {
        update('active');
        try {
          vapi.setMuted(false);
        } catch {
          // ignore
        }
      });
      vapi.on('call-end', () => {
        setIsSpeaking(false);
        dismissIncomingCall();
        // On the phone the report is written first, so the outcome card finds the call already settled.
        const written = bridge ? bridge.finish(endReason()) : Promise.resolve();
        written.then(() => {
          if (statusRef.current !== 'error') update('ended');
        });
      });
      vapi.on('speech-start', () => setIsSpeaking(true));
      vapi.on('speech-end', () => setIsSpeaking(false));
      vapi.on('message', (msg: any) => {
        bridge?.onMessage(msg);
        if (msg?.type === 'transcript' && msg.transcriptType === 'final' && typeof msg.transcript === 'string') {
          const line: TranscriptLine = { role: msg.role === 'user' ? 'user' : 'assistant', text: msg.transcript };
          setTranscript((prev) => [...prev, line]);
        }
      });
      vapi.on('error', (e: unknown) => {
        const reason = describeVapiError(e);
        // The server hanging up mid-call is a finished call, not a failure.
        if (statusRef.current === 'active' && isMeetingEnded(e)) {
          reminderLog.info('vapi.ended_by_server', reason);
          setIsSpeaking(false);
          dismissIncomingCall();
          const written = bridge ? bridge.finish(endReason()) : Promise.resolve();
          written.then(() => update('ended'));
          return;
        }
        reminderLog.warn('vapi.error', reason);
        if (statusRef.current === 'connecting') fail(reason);
        else if (statusRef.current === 'active') {
          setError(reason);
          bridge?.finish('pipeline-error');
          update('error');
        }
      });

      try {
        const call = await vapi.start(started.assistant as any);
        if (!call?.id) throw new Error('Vapi did not start the call. Check your Vapi key and credit.');
        // The day's call is handled: drop the pending automatic re-ring.
        cancelAutoRetry();
        if (bridge) bridge.vapiCallId = call.id;
        setSession({ callId: started.callId, localDate: started.localDate, vapiCallId: call.id });
        api.callStarted(started.callId, call.id).catch((e) => reminderLog.warn('call.link_failed', errorMessage(e)));
      } catch (e) {
        // The SDK usually emits 'error' (with the specific reason) before start() resolves null.
        if (statusRef.current !== 'error') fail(describeVapiError(e));
      }
    },
    [dispose, fail, update],
  );

  const stop = useCallback(() => {
    endedByUserRef.current = true;
    dismissIncomingCall();
    const v = vapiRef.current;
    if (!v) {
      if (statusRef.current === 'connecting') update('ended');
      return;
    }
    try {
      v.stop();
    } catch {
      update('ended');
    }
  }, [update]);

  // iOS: a CallKit hang-up (lock-screen red button) ends the Vapi call too.
  useEffect(() => {
    const onHangup = async () => {
      if (await consumePendingHangup()) stop();
    };
    const appState = AppState.addEventListener('change', (s) => s === 'active' && onHangup());
    const unsubscribe = subscribeToNativeCallEvents((e) => e === 'ended' && onHangup());
    return () => {
      appState.remove();
      unsubscribe();
      dispose();
      dismissIncomingCall();
    };
  }, [dispose, stop]);

  return { status, error, transcript, isSpeaking, session, start, stop };
}
