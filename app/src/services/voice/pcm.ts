import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import { createCallAudioSession } from '@/services/calls/callAudio';
import { readAudioState, type AudioRoute, type CallAudioState } from '@/services/calls/audioRoute';

/** Full-duplex native PCM transport; no recording files or provider credentials. */
export function createPcmAudio(onInput: (data: ArrayBuffer) => void, onAudio: (state: CallAudioState | null) => void,
  onError: (message: string) => void) {
  const native = NativeModules.VoicePcm;
  if (!native) throw new Error('Voice audio is unavailable. Rebuild the native app to enable Deepgram.');
  const emitter = new NativeEventEmitter(native);
  const routes = Platform.OS === 'android' ? createCallAudioSession(onAudio) : null;
  const subscriptions = [
    emitter.addListener('VoicePcmInput', (base64: string) => onInput(decodePcm(base64))),
    emitter.addListener('VoicePcmError', (message: string) => onError(message)),
    emitter.addListener('VoicePcmRoute', state => onAudio(readAudioState(state))),
  ];
  let stopped = false;
  return {
    async start() {
      if (stopped) return;
      await routes?.start(null);
      if (stopped) return;
      await native.start(16000, 24000);
      if (stopped) native.stop();
      else if (!routes) onAudio(readAudioState(await native.getState()));
    },
    play(data: ArrayBuffer) { if (!stopped) native.play(encodePcm(data)); },
    clear() { if (!stopped) native.clear(); },
    async drain() { if (!stopped) await native.drain(); },
    setMuted(muted: boolean) { if (!stopped) native.setMuted(muted); },
    setRoute(route: AudioRoute) {
      if (stopped) return;
      if (routes) routes.setRoute(route);
      else native.setRoute(route).then((state: unknown) => onAudio(readAudioState(state))).catch(() => onError('Could not change the audio route'));
    },
    stop() {
      if (stopped) return;
      stopped = true;
      subscriptions.forEach(s => s.remove());
      native.stop();
      routes?.stop();
      onAudio(null);
    },
  };
}

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
export function decodePcm(base64: string): ArrayBuffer {
  const bytes: number[] = [];
  let bits = 0, value = 0;
  for (const char of base64) {
    const digit = alphabet.indexOf(char);
    if (digit < 0) continue;
    value = value * 64 + digit;
    bits += 6;
    if (bits >= 8) { bits -= 8; bytes.push(Math.floor(value / 2 ** bits) % 256); value %= 2 ** bits; }
  }
  return new Uint8Array(bytes).buffer;
}
export function encodePcm(data: ArrayBuffer): string {
  const bytes = new Uint8Array(data);
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = bytes[i + 1] ?? 0, c = bytes[i + 2] ?? 0;
    out += alphabet[Math.floor(a / 4)] + alphabet[(a % 4) * 16 + Math.floor(b / 16)] +
      (i + 1 < bytes.length ? alphabet[(b % 16) * 4 + Math.floor(c / 64)] : '=') +
      (i + 2 < bytes.length ? alphabet[c % 64] : '=');
  }
  return out;
}
