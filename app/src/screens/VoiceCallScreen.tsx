import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { Plus } from 'lucide-react-native';
import { api } from '@/api/client';
import type { CallInfo, Item } from '@/api/types';
import { Badge, Button, Card, Divider, Notice, Text } from '@/components/kit';
import { EditItemSheet } from '@/components/today/EditItemSheet';
import VoiceSessionScreen, { type CallStatus } from '@/components/voice/VoiceSessionScreen';
import { useProfileTimeZone } from '@/hooks/useToday';
import { useVoiceCall, type VoiceStatus } from '@/hooks/useVoiceCall';
import { fill } from '@/i18n/fill';
import { strings } from '@/i18n/strings';
import { callbackClock, callbackDelayWords } from '../../../worker/src/domain/callback';
import type { RootStackParamList } from '@/navigation/types';
import { shouldShield } from '@/services/calls/audioRoute';
import { setCallScreenShown } from '@/services/calls/native';
import { space, useTheme } from '@/theme';
import { formatNumber, formatQuantity } from '@/utils/format';

const SESSION_STATUS: Record<VoiceStatus, CallStatus> = {
  idle: 'idle',
  connecting: 'requesting',
  active: 'active',
  ended: 'completed',
  error: 'error',
};

const STATUS_TEXT: Record<VoiceStatus, string> = {
  idle: 'Tap Start call to log your meals by voice',
  connecting: 'Connecting to the assistant',
  active: 'Tell the assistant what you ate today',
  ended: 'Your food check-in is over',
  error: 'Something went wrong with the call',
};

/** After the call, the webhook may land a moment later: poll the day briefly for this call's items. */
function useCallOutcome(localDate: string | null, providerCallId: string | null, ended: boolean, version: number) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [callRow, setCallRow] = useState<CallInfo | null>(null);
  useEffect(() => {
    if (!ended || !localDate || !providerCallId) return;
    let cancelled = false;
    let attempt = 0;
    const tick = async () => {
      attempt++;
      try {
        const day = await api.getDay(localDate);
        if (cancelled) return;
        const mine = day.items.filter(i => i.callId === providerCallId && i.source === 'call');
        const row = day.calls.find(c => (c.providerCallId ?? c.vapiCallId) === providerCallId) ?? null;
        setItems(mine);
        setCallRow(row);
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
  }, [ended, localDate, providerCallId, version]);
  return { items, call: callRow };
}

export default function VoiceCallScreen() {
  const navigation = useNavigation();
  const { params } = useRoute<RouteProp<RootStackParamList, 'VoiceCall'>>();
  const { status, error, transcript, isSpeaking, session, audio, callback, setAudioRoute, start, stop } = useVoiceCall();
  const zone = useProfileTimeZone();
  const started = useRef(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [version, setVersion] = useState(0);

  // This is the one screen that may show over the lock screen; leaving it (Done, Back, Add items) needs the phone unlocked.
  useFocusEffect(
    useCallback(() => {
      setCallScreenShown(true);
      return () => setCallScreenShown(false);
    }, []),
  );

  useEffect(() => {
    if (params.autoStart && !started.current) {
      started.current = true;
      start(params.kind);
    }
  }, [params.autoStart, params.kind, start]);

  const ended = status === 'ended' || (status === 'error' && !!session?.providerCallId);
  const outcome = useCallOutcome(session?.localDate ?? null, session?.providerCallId ?? null, ended, version);
  const live = status === 'active' || status === 'connecting';

  return (
    <>
      <VoiceSessionScreen
        title="Food check-in"
        statusText={status === 'error' && error ? error : STATUS_TEXT[status]}
        status={SESSION_STATUS[status]}
        isSpeaking={isSpeaking}
        transcript={transcript}
        onPrimaryPress={live ? stop : () => start(params.kind)}
        disablePrimary={status === 'connecting'}
        processingText="Checking what was saved…"
        doneButtonText="Done"
        onDonePress={() => navigation.goBack()}
        onRetryPress={() => start(params.kind)}
        outcome={
          ended ? (
            <Outcome
              items={outcome.items}
              call={outcome.call}
              onOpenItem={setEditing}
              callback={callback ? { clock: callbackClock(callback.fireAt, zone).toUpperCase(), inWords: callbackDelayWords(callback.minutes) } : null}
            />
          ) : null
        }
        audio={audio}
        onSelectAudioRoute={setAudioRoute}
        shielded={status === 'active' && shouldShield(audio)}
      />
      <EditItemSheet item={editing} isOpen={!!editing} onClose={() => setEditing(null)} onSaved={() => setVersion(v => v + 1)} />
    </>
  );
}

/**
 * What the call saved, and what comes next. When the person asked to be called again, that comes first, and a call with nothing saved is
 * not called a failure: they said they would eat later.
 */
function Outcome({
  items,
  call: callRow,
  onOpenItem,
  callback,
}: {
  items: Item[] | null;
  call: CallInfo | null;
  onOpenItem: (item: Item) => void;
  callback: { clock: string; inWords: string } | null;
}) {
  const deferred = !!callback && items !== null && items.length === 0 && callRow?.status !== 'failed';
  return (
    <View style={{ gap: space.md }}>
      {callback ? (
        <Notice tone="success" testID="call-callback-note" title={fill(strings.callback.doneTitle, { clock: callback.clock })}>
          {fill(strings.callback.doneBody, { inWords: callback.inWords })}
        </Notice>
      ) : null}
      {deferred ? null : <SavedItems items={items} call={callRow} onOpenItem={onOpenItem} />}
    </View>
  );
}

/** What the call saved: the items (tap one to fix it), or why nothing was saved and a way to add the food by hand. */
function SavedItems({ items, call: callRow, onOpenItem }: { items: Item[] | null; call: CallInfo | null; onOpenItem: (item: Item) => void }) {
  const navigation = useNavigation();
  const { colors } = useTheme();
  if (items === null) {
    return (
      <Text variant="small" tone="muted" align="center">
        Checking what was saved…
      </Text>
    );
  }
  if (items.length > 0) {
    return (
      <Card padding="none" testID="call-outcome">
        <View style={{ padding: space.lg }}>
          <Text variant="bodyStrong">
            Saved {items.length} item{items.length === 1 ? '' : 's'}
          </Text>
        </View>
        {items.map(item => (
          <React.Fragment key={item.id}>
            <Divider />
            <Pressable
              onPress={() => onOpenItem(item)}
              accessibilityRole="button"
              accessibilityLabel={`Edit ${item.rawName}`}
              android_ripple={{ color: colors.ripple }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md + 2 }}
            >
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="bodyStrong">{item.rawName}</Text>
                <Text variant="small" tone="muted">
                  {formatQuantity(item.quantity, item.unit)}
                  {item.foodName && item.foodName.toLowerCase() !== item.rawName.toLowerCase() ? ` · ${item.foodName}` : ''}
                </Text>
              </View>
              {item.status === 'resolved' ? (
                <Text variant="bodyStrong" tone="secondary" tabular>
                  {formatNumber(item.nutrients.calories ?? 0)} kcal
                </Text>
              ) : (
                <Badge label={item.status === 'pending_food' ? 'Unknown food' : 'Unknown unit'} tone="warning" />
              )}
            </Pressable>
          </React.Fragment>
        ))}
      </Card>
    );
  }
  if (callRow?.status === 'no_list' || callRow?.status === 'failed') {
    return (
      <Card>
        <Text variant="bodyStrong">No food list was saved</Text>
        <Text variant="small" tone="muted" style={{ marginTop: 2 }}>
          You can add what you ate yourself.
        </Text>
        <View style={{ marginTop: space.lg }}>
          <Button
            label="Add items"
            icon={Plus}
            variant="soft"
            size="sm"
            style={{ alignSelf: 'flex-start' }}
            onPress={() => navigation.navigate('AddItems', { date: callRow.localDate, callId: callRow.id })}
          />
        </View>
      </Card>
    );
  }
  return (
    <Text variant="small" tone="muted" align="center">
      Waiting for the call summary…
    </Text>
  );
}
