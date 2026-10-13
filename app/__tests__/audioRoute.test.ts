/**
 * The call's audio routes (services/calls/audioRoute.ts): which ones are offered, where a call starts, and how the native and
 * Daily reports are read.
 */
import {
  dailyDeviceId,
  privateRoute,
  readAudioState,
  routesFromDaily,
  shouldShield,
  sortRoutes,
  type CallAudioState,
} from '@/services/calls/audioRoute';

describe('sortRoutes', () => {
  it('lists the private route first, then the speaker, then Bluetooth', () => {
    expect(sortRoutes(['bluetooth', 'speaker', 'earpiece'])).toEqual(['earpiece', 'speaker', 'bluetooth']);
  });

  it('never offers the earpiece with headphones plugged in, as a phone does not', () => {
    expect(sortRoutes(['earpiece', 'wired', 'speaker'])).toEqual(['wired', 'speaker']);
  });

  it('drops repeats', () => {
    expect(sortRoutes(['speaker', 'speaker', 'earpiece'])).toEqual(['earpiece', 'speaker']);
  });
});

describe('privateRoute: where a call starts', () => {
  it('is the earpiece on a phone with nothing connected', () => {
    expect(privateRoute(['earpiece', 'speaker'])).toBe('earpiece');
  });

  it('is a connected headset, Bluetooth before wired', () => {
    expect(privateRoute(['wired', 'speaker'])).toBe('wired');
    expect(privateRoute(['earpiece', 'speaker', 'bluetooth'])).toBe('bluetooth');
  });

  it('is the speaker only when there is nothing else (a tablet), and nothing when nothing is known', () => {
    expect(privateRoute(['speaker'])).toBe('speaker');
    expect(privateRoute([])).toBeNull();
  });
});

describe('readAudioState', () => {
  it('reads what the native module sends', () => {
    expect(readAudioState({ active: true, route: 'speaker', available: ['speaker', 'earpiece'], proximity: true, near: false })).toEqual({
      route: 'speaker',
      available: ['earpiece', 'speaker'],
      proximity: true,
      near: false,
    });
  });

  it('drops what it does not know, and refuses what is not a state', () => {
    expect(readAudioState({ route: 'hdmi', available: ['earpiece', 7, 'usb'], near: 'yes' })).toEqual({
      route: null,
      available: ['earpiece'],
      proximity: false,
      near: false,
    });
    expect(readAudioState(null)).toBeNull();
    expect(readAudioState('speaker')).toBeNull();
  });
});

describe('Daily', () => {
  it("maps each route to Daily's device id", () => {
    expect(dailyDeviceId('speaker')).toBe('SPEAKERPHONE');
    expect(dailyDeviceId('earpiece')).toBe('WIRED_OR_EARPIECE');
    expect(dailyDeviceId('wired')).toBe('WIRED_OR_EARPIECE');
    expect(dailyDeviceId('bluetooth')).toBe('BLUETOOTH');
  });

  it("reads Daily's device list, telling headphones from the earpiece by the label", () => {
    expect(
      routesFromDaily([
        { deviceId: 'CAMERA_USER', kind: 'videoinput', label: 'Front camera' },
        { deviceId: 'WIRED_OR_EARPIECE', kind: 'audio', label: 'Phone earpiece' },
        { deviceId: 'SPEAKERPHONE', kind: 'audio', label: 'Speakerphone' },
      ]),
    ).toEqual(['earpiece', 'speaker']);
    expect(
      routesFromDaily([
        { deviceId: 'WIRED_OR_EARPIECE', kind: 'audio', label: 'Wired headset' },
        { deviceId: 'SPEAKERPHONE', kind: 'audio', label: 'Speakerphone' },
        { deviceId: 'BLUETOOTH', kind: 'audio', label: 'Bluetooth' },
      ]),
    ).toEqual(['wired', 'speaker', 'bluetooth']);
  });
});

describe('shouldShield', () => {
  const state = (patch: Partial<CallAudioState>): CallAudioState => ({
    route: 'earpiece',
    available: ['earpiece', 'speaker'],
    proximity: true,
    near: true,
    ...patch,
  });

  it('covers the screen only with the phone at the ear on the earpiece', () => {
    expect(shouldShield(state({}))).toBe(true);
    expect(shouldShield(state({ near: false }))).toBe(false);
    expect(shouldShield(state({ route: 'speaker' }))).toBe(false);
    expect(shouldShield(null)).toBe(false);
  });
});
