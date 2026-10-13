/**
 * The call's audio session (services/calls/callAudio.ts): it opens like a phone call (earpiece, or a headset), switches to the
 * speaker and back, follows what the native module reports, and lets go when the call ends. Android drives the CallAudio
 * native module; iOS (and Android without the module) drives Daily and UIDevice's proximity monitoring.
 */
import { DeviceEventEmitter, NativeModules, Platform } from 'react-native';
import { CALL_AUDIO_EVENT, createCallAudioSession, openOnEarpiece, type DailyAudioControls } from '@/services/calls/callAudio';

type Native = {
  getState: jest.Mock;
  start: jest.Mock;
  setRoute: jest.Mock;
  stop: jest.Mock;
  addListener: jest.Mock;
  removeListeners: jest.Mock;
};

const nativeState = (patch: Record<string, unknown> = {}) => ({
  active: true,
  route: 'earpiece',
  available: ['earpiece', 'speaker'],
  proximity: true,
  near: false,
  ...patch,
});

let order: string[];
let native: Native;
let daily: Required<DailyAudioControls> & { [K in keyof Required<DailyAudioControls>]: jest.Mock };
const modules = NativeModules as Record<string, unknown>;

beforeEach(() => {
  order = [];
  native = {
    getState: jest.fn(async () => {
      order.push('getState');
      return nativeState({ active: false, route: 'speaker' });
    }),
    start: jest.fn(async (route: string | null) => {
      order.push(`start:${route}`);
      return nativeState({ route });
    }),
    setRoute: jest.fn(async (route: string) => {
      order.push(`setRoute:${route}`);
      return nativeState({ route });
    }),
    stop: jest.fn(() => order.push('stop')),
    addListener: jest.fn(),
    removeListeners: jest.fn(),
  };
  daily = {
    setNativeInCallAudioMode: jest.fn(),
    setAudioDevice: jest.fn(async (id: string) => {
      order.push(`daily:${id}`);
      return { deviceId: id };
    }),
    enumerateDevices: jest.fn(async () => ({
      devices: [
        { deviceId: 'WIRED_OR_EARPIECE', kind: 'audio', label: 'Phone earpiece' },
        { deviceId: 'SPEAKERPHONE', kind: 'audio', label: 'Speakerphone' },
      ],
    })),
    removeAllListeners: jest.fn(),
  };
  jest.replaceProperty(Platform, 'OS', 'android');
  modules.CallAudio = native;
});

afterEach(() => {
  delete modules.CallAudio;
  delete modules.IncomingCall;
  jest.restoreAllMocks();
  jest.useRealTimers();
  DeviceEventEmitter.removeAllListeners(CALL_AUDIO_EVENT);
});

describe('openOnEarpiece', () => {
  it("puts Daily in its 'voice' mode before the call joins (its default, 'video', is the loudspeaker)", () => {
    openOnEarpiece(daily);
    expect(daily.setNativeInCallAudioMode).toHaveBeenCalledWith('voice');
  });

  it('never throws, with or without a call object', () => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    daily.setNativeInCallAudioMode.mockImplementation(() => {
      throw new Error('not in React Native');
    });
    expect(() => openOnEarpiece(daily)).not.toThrow();
    expect(() => openOnEarpiece(null)).not.toThrow();
  });
});

describe('Android, with the CallAudio module', () => {
  it('starts on the private route: Daily is told once, so it stops routing by itself, then the module takes over', async () => {
    const onChange = jest.fn();
    await createCallAudioSession(onChange).start(daily);
    expect(order).toEqual(['getState', 'daily:WIRED_OR_EARPIECE', 'start:earpiece']);
    // Vapi would otherwise put back Daily's idea of the route every time a headset comes or goes.
    expect(daily.removeAllListeners).toHaveBeenCalledWith('available-devices-updated');
    expect(onChange).toHaveBeenLastCalledWith({ route: 'earpiece', available: ['earpiece', 'speaker'], proximity: true, near: false });
  });

  it('starts on a connected headset when there is one', async () => {
    native.getState.mockResolvedValueOnce(nativeState({ available: ['earpiece', 'speaker', 'bluetooth'] }));
    await createCallAudioSession(jest.fn()).start(daily);
    expect(order).toEqual(['daily:BLUETOOTH', 'start:bluetooth']);
  });

  it('starts once, though Vapi reports the call joined twice', async () => {
    const session = createCallAudioSession(jest.fn());
    await Promise.all([session.start(daily), session.start(daily)]);
    expect(native.start).toHaveBeenCalledTimes(1);
  });

  it('switches to the speaker and back during the call', async () => {
    const onChange = jest.fn();
    const session = createCallAudioSession(onChange);
    await session.start(daily);
    await session.setRoute('speaker');
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ route: 'speaker' }));
    await session.setRoute('earpiece');
    expect(order.slice(-2)).toEqual(['setRoute:speaker', 'setRoute:earpiece']);
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ route: 'earpiece' }));
  });

  it('follows what the module reports: a headset connecting, the phone held to the ear', async () => {
    const onChange = jest.fn();
    await createCallAudioSession(onChange).start(daily);
    DeviceEventEmitter.emit(CALL_AUDIO_EVENT, nativeState({ near: true }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ route: 'earpiece', near: true }));
    DeviceEventEmitter.emit(CALL_AUDIO_EVENT, nativeState({ route: 'wired', available: ['wired', 'speaker'] }));
    expect(onChange).toHaveBeenLastCalledWith({ route: 'wired', available: ['wired', 'speaker'], proximity: true, near: false });
  });

  it('lets go when the call ends, and ignores anything the module says after', async () => {
    const onChange = jest.fn();
    const session = createCallAudioSession(onChange);
    await session.start(daily);
    session.stop();
    expect(native.stop).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(null);
    DeviceEventEmitter.emit(CALL_AUDIO_EVENT, nativeState({ near: true }));
    await session.setRoute('speaker');
    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(native.setRoute).not.toHaveBeenCalled();
    session.stop();
    expect(native.stop).toHaveBeenCalledTimes(1);
  });

  it('never starts the module when the call ended while it was starting', async () => {
    let answer!: (v: unknown) => void;
    daily.setAudioDevice.mockImplementationOnce(() => new Promise(r => (answer = r)));
    const session = createCallAudioSession(jest.fn());
    const starting = session.start(daily);
    await Promise.resolve();
    await Promise.resolve();
    session.stop();
    answer({ deviceId: 'WIRED_OR_EARPIECE' });
    await starting;
    expect(native.start).not.toHaveBeenCalled();
  });

  it('does not wait for Daily for ever', async () => {
    jest.useFakeTimers();
    daily.setAudioDevice.mockImplementationOnce(() => new Promise(() => {}));
    const onChange = jest.fn();
    const starting = createCallAudioSession(onChange).start(daily);
    await jest.advanceTimersByTimeAsync(1500);
    await starting;
    expect(native.start).toHaveBeenCalledWith('earpiece');
  });

  it('does nothing before the call has started', async () => {
    await createCallAudioSession(jest.fn()).setRoute('speaker');
    expect(native.setRoute).not.toHaveBeenCalled();
  });
});

describe('iOS: Daily routes, and iOS turns the screen off at the ear', () => {
  let proximity: jest.Mock;
  beforeEach(() => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    proximity = jest.fn();
    modules.IncomingCall = { setProximityMonitoring: proximity };
  });

  it('opens on the earpiece with proximity monitoring on, and turns it off on the speaker and at the end', async () => {
    const onChange = jest.fn();
    const session = createCallAudioSession(onChange);
    await session.start(daily);
    expect(daily.setAudioDevice).toHaveBeenLastCalledWith('WIRED_OR_EARPIECE');
    expect(proximity).toHaveBeenLastCalledWith(true);
    expect(onChange).toHaveBeenLastCalledWith({ route: 'earpiece', available: ['earpiece', 'speaker'], proximity: true, near: false });

    await session.setRoute('speaker');
    expect(daily.setAudioDevice).toHaveBeenLastCalledWith('SPEAKERPHONE');
    expect(proximity).toHaveBeenLastCalledWith(false);
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ route: 'speaker' }));

    session.stop();
    expect(proximity).toHaveBeenLastCalledWith(false);
    expect(onChange).toHaveBeenLastCalledWith(null);
    // The native Android module is never touched on iOS.
    expect(native.start).not.toHaveBeenCalled();
  });

  it('refuses a route that is not there (a headset that went away)', async () => {
    const session = createCallAudioSession(jest.fn());
    await session.start(daily);
    await session.setRoute('bluetooth');
    expect(daily.setAudioDevice).not.toHaveBeenCalledWith('BLUETOOTH');
  });
});

it('on Android without the native module it still routes through Daily, without proximity', async () => {
  delete modules.CallAudio;
  const onChange = jest.fn();
  await createCallAudioSession(onChange).start(daily);
  expect(daily.setAudioDevice).toHaveBeenCalledWith('WIRED_OR_EARPIECE');
  expect(onChange).toHaveBeenLastCalledWith({ route: 'earpiece', available: ['earpiece', 'speaker'], proximity: false, near: false });
});
