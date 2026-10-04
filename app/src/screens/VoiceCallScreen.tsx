import React, { useEffect, useRef, useState } from 'react';
import { Animated, ScrollView, Text, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { Mic, PhoneOff } from 'lucide-react-native';
import { api } from '@/api/client';
import type { CallInfo, Item } from '@/api/types';
import { Banner, Button, Card, Screen } from '@/components/ui';
import { useVapiCall, type VoiceStatus } from '@/hooks/useVapiCall';
import type { RootStackParamList } from '@/navigation/types';
import { colors } from '@/theme/colors';
import { ItemRow } from './TodayScreen';

const LABEL: Record<VoiceStatus, string> = {
  idle: 'Ready',
  connecting: 'Connecting…',
  active: 'Listening',
  ended: 'Call ended',
  error: 'Call problem',
};

/** After the call, the webhook may land a moment later: poll the day briefly for this call's items. */
function useCallOutcome(localDate: string | null, vapiCallId: string | null, ended: boolean) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [call, setCall] = useState<CallInfo | null>(null);
  useEffect(() => {
    if (!ended || !localDate || !vapiCallId) return;
    let cancelled = false;
    let attempt = 0;
    const tick = async () => {
      attempt++;
      try {
        const day = await api.getDay(localDate);
        if (cancelled) return;
        const mine = day.items.filter((i) => i.callId === vapiCallId && i.source === 'call');
        const row = day.calls.find((c) => c.vapiCallId === vapiCallId) ?? null;
        setItems(mine);
        setCall(row);
        const settled = row && (row.status === 'tool_saved' || row.status === 'no_list' || row.status === 'failed') && row.endedReason;
        if (!settled && attempt < 6) setTimeout(tick, 2500);
      } catch {
        if (!cancelled && attempt < 6) setTimeout(tick, 2500);
      }
    };
    tick();
    return () => {
      cancelled = true;
    };
  }, [ended, localDate, vapiCallId]);
  return { items, call };
}

export default function VoiceCallScreen() {
  const navigation = useNavigation();
  const { params } = useRoute<RouteProp<RootStackParamList, 'VoiceCall'>>();
  const { status, error, transcript, isSpeaking, session, start, stop } = useVapiCall();
  const started = useRef(false);
  const pulse = useRef(new Animated.Value(1)).current;
  const scroll = useRef<ScrollView>(null);

  useEffect(() => {
    if (params.autoStart && !started.current) {
      started.current = true;
      start(params.kind);
    }
  }, [params.autoStart, params.kind, start]);

  useEffect(() => {
    if (status !== 'active' && status !== 'connecting') return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.12, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [status, pulse]);

  const ended = status === 'ended' || (status === 'error' && !!session?.vapiCallId);
  const outcome = useCallOutcome(session?.localDate ?? null, session?.vapiCallId ?? null, ended);
  const live = status === 'active' || status === 'connecting';

  return (
    <Screen edges={['top', 'bottom']} className="bg-brand-deep">
      <View className="items-center pb-6 pt-10">
        <Animated.View style={{ transform: [{ scale: pulse }] }} className="h-28 w-28 items-center justify-center rounded-full bg-brand-mid">
          <Mic color={colors.white} size={44} />
        </Animated.View>
        <Text className="mt-5 text-2xl font-bold text-white">Food check-in</Text>
        <Text className="mt-1 text-base text-brand-soft2">{status === 'active' && isSpeaking ? 'Speaking…' : LABEL[status]}</Text>
      </View>

      <View className="flex-1 rounded-t-3xl bg-canvas px-4 pt-4">
        {error ? <Banner tone="error">{error}</Banner> : null}
        <ScrollView ref={scroll} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: true })} contentContainerClassName="pb-4">
          {transcript.length === 0 && live ? (
            <Text className="mt-6 text-center text-sm text-ink-muted">Tell the assistant what you ate today, one meal at a time.</Text>
          ) : null}
          {transcript.map((line, i) => (
            <View key={i} className={`mb-2 max-w-[85%] rounded-2xl px-3.5 py-2.5 ${line.role === 'user' ? 'self-end bg-brand' : 'self-start bg-white'}`}>
              <Text className={line.role === 'user' ? 'text-white' : 'text-ink'}>{line.text}</Text>
            </View>
          ))}
          {ended ? <Outcome items={outcome.items} call={outcome.call} /> : null}
        </ScrollView>

        <View className="py-3">
          {live ? (
            <Button title="End call" variant="danger" icon={<PhoneOff color={colors.danger} size={18} />} onPress={stop} testID="end-call" />
          ) : (
            <View className="flex-row">
              {status === 'error' || status === 'idle' ? (
                <Button title="Try again" variant="secondary" className="mr-2 flex-1" onPress={() => start(params.kind)} />
              ) : null}
              <Button title="Done" className="flex-1" onPress={() => navigation.goBack()} />
            </View>
          )}
        </View>
      </View>
    </Screen>
  );
}

function Outcome({ items, call }: { items: Item[] | null; call: CallInfo | null }) {
  const navigation = useNavigation();
  if (items === null) return <Text className="mt-4 text-center text-sm text-ink-muted">Checking what was saved…</Text>;
  if (items.length > 0) {
    return (
      <Card className="mt-3">
        <Text className="mb-1 text-base font-semibold text-ink">Saved {items.length} item{items.length === 1 ? '' : 's'}</Text>
        {items.map((i, idx) => (
          <ItemRow key={i.id} item={i} last={idx === items.length - 1} onPress={() => navigation.navigate('EditItem', { item: i })} />
        ))}
      </Card>
    );
  }
  if (call?.status === 'no_list' || call?.status === 'failed') {
    return (
      <Card className="mt-3">
        <Text className="text-base font-semibold text-ink">No food list was saved</Text>
        <Text className="mt-1 text-sm text-ink-soft">You can add what you ate yourself.</Text>
        <Button small title="Add items" variant="secondary" className="mt-3 self-start" onPress={() => navigation.navigate('AddItems', { date: call.localDate, callId: call.id })} />
      </Card>
    );
  }
  return <Text className="mt-4 text-center text-sm text-ink-muted">Waiting for the call summary…</Text>;
}
