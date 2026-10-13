import React from 'react';
import { View } from 'react-native';
import { Bluetooth, Ear, Headphones, Volume2, type LucideIcon } from 'lucide-react-native';
import { Segmented, Text } from '@/components/kit';
import { privateRoute, ROUTE_LABEL, type AudioRoute, type CallAudioState } from '@/services/calls/audioRoute';
import { space } from '@/theme';

const ROUTE_ICON: Record<AudioRoute, LucideIcon> = {
  earpiece: Ear,
  wired: Headphones,
  speaker: Volume2,
  bluetooth: Bluetooth,
};

/** What the person hears where, under the switch. Only the earpiece needs a word: it is quiet away from the ear. */
export function routeHint(state: CallAudioState): string | null {
  if (state.route !== 'earpiece') return null;
  return state.proximity ? 'Hold the phone to your ear; the screen turns off.' : 'Hold the phone to your ear.';
}

/**
 * Phone or speaker during a call, as on a phone's own call screen: the private route (earpiece, headphones) and the
 * loudspeaker, plus Bluetooth when a headset is connected. Hidden when there is nothing to choose (a tablet with only a
 * speaker).
 */
export function AudioRouteControl({ state, onSelect }: { state: CallAudioState; onSelect: (route: AudioRoute) => void }) {
  const value = state.route ?? privateRoute(state.available);
  if (state.available.length < 2 || !value) return null;
  const hint = routeHint(state);
  return (
    <View style={{ gap: space.xs }} testID="audio-route">
      <Segmented<AudioRoute>
        tall
        options={state.available.map(route => ({
          value: route,
          label: ROUTE_LABEL[route],
          icon: ROUTE_ICON[route],
          testID: `audio-route-${route}`,
        }))}
        value={value}
        onChange={route => route !== value && onSelect(route)}
      />
      {hint ? (
        <Text variant="caption" tone="muted" align="center">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}
