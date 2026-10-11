import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { api } from '@/api/client';
import type { CallInfo, Item } from '@/api/types';
import { FocusAwareStatusBar } from '@/components/common/Feedback';
import { EditFoodDrawer } from '@/components/food-log/EditFoodDrawer';
import VoiceSessionScreen, { type CallStatus } from '@/components/voice/VoiceSessionScreen';
import { useVapiCall, type VoiceStatus } from '@/hooks/useVapiCall';
import type { RootStackParamList } from '@/navigation/types';
import { tokens } from '@/theme/tokens';
import { formatNumber, formatQuantity } from '@/utils/format';

const SESSION_STATUS: Record<VoiceStatus, CallStatus> = {
  idle: 'idle',
  connecting: 'requesting',
  active: 'active',
  ended: 'completed',
  error: 'error',
};

const STATUS_TEXT: Record<VoiceStatus, string> = {
  idle: 'Tap Start Call to log your meals by voice',
  connecting: 'Connecting to the assistant',
  active: 'Tell the assistant what you ate today',
  ended: 'Your food check-in is over',
  error: 'Something went wrong with the call',
};

/** After the call, the webhook may land a moment later: poll the day briefly for this call's items. */
function useCallOutcome(localDate: string | null, vapiCallId: string | null, ended: boolean, version: number) {
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
        const mine = day.items.filter(i => i.callId === vapiCallId && i.source === 'call');
        const row = day.calls.find(c => c.vapiCallId === vapiCallId) ?? null;
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
  }, [ended, localDate, vapiCallId, version]);
  return { items, call };
}

export default function VoiceCallScreen() {
  const navigation = useNavigation();
  const { params } = useRoute<RouteProp<RootStackParamList, 'VoiceCall'>>();
  const { status, error, transcript, isSpeaking, session, start, stop } = useVapiCall();
  const started = useRef(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (params.autoStart && !started.current) {
      started.current = true;
      start(params.kind);
    }
  }, [params.autoStart, params.kind, start]);

  const ended = status === 'ended' || (status === 'error' && !!session?.vapiCallId);
  const outcome = useCallOutcome(session?.localDate ?? null, session?.vapiCallId ?? null, ended, version);
  const live = status === 'active' || status === 'connecting';

  return (
    <>
      <FocusAwareStatusBar barStyle="light-content" />
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
        outcome={ended ? <Outcome items={outcome.items} call={outcome.call} onOpenItem={setEditing} /> : null}
      />
      <EditFoodDrawer
        item={editing}
        isOpen={!!editing}
        onClose={() => setEditing(null)}
        onSaved={() => setVersion(v => v + 1)}
      />
    </>
  );
}

function Outcome({ items, call, onOpenItem }: { items: Item[] | null; call: CallInfo | null; onOpenItem: (item: Item) => void }) {
  const navigation = useNavigation();
  if (items === null) return <Text style={styles.muted}>Checking what was saved…</Text>;
  if (items.length > 0) {
    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>
          Saved {items.length} item{items.length === 1 ? '' : 's'}
        </Text>
        {items.map((item, idx) => (
          <TouchableOpacity
            key={item.id}
            onPress={() => onOpenItem(item)}
            style={[styles.itemRow, idx > 0 && styles.itemDivider]}
            activeOpacity={0.8}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.itemName}>{item.rawName}</Text>
              <Text style={styles.itemMeta}>
                {formatQuantity(item.quantity, item.unit)}
                {item.foodName && item.foodName.toLowerCase() !== item.rawName.toLowerCase() ? ` · ${item.foodName}` : ''}
              </Text>
            </View>
            {item.status === 'resolved' ? (
              <Text style={styles.itemKcal}>{formatNumber(item.nutrients.calories ?? 0)} kcal</Text>
            ) : (
              <View style={styles.pendingBadge}>
                <Text style={styles.pendingText}>{item.status === 'pending_food' ? 'Unknown food' : 'Unknown unit'}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>
    );
  }
  if (call?.status === 'no_list' || call?.status === 'failed') {
    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>No food list was saved</Text>
        <Text style={styles.cardBody}>You can add what you ate yourself.</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => navigation.navigate('AddItems', { date: call.localDate, callId: call.id })}
        >
          <Text style={styles.addButtonText}>Add items</Text>
        </TouchableOpacity>
      </View>
    );
  }
  return <Text style={styles.muted}>Waiting for the call summary…</Text>;
}

const C = tokens.call;

const styles = StyleSheet.create({
  muted: {
    marginTop: 8,
    textAlign: 'center',
    fontSize: 13,
    color: C.textMuted,
  },
  card: {
    marginTop: 6,
    backgroundColor: C.surfaceElevated,
    borderColor: C.border,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: C.textPrimary,
    marginBottom: 4,
  },
  cardBody: {
    fontSize: 13,
    color: C.textSecondary,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 10,
  },
  itemDivider: {
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  itemName: {
    fontSize: 15,
    fontWeight: '600',
    color: C.textPrimary,
  },
  itemMeta: {
    marginTop: 2,
    fontSize: 12,
    color: C.textMuted,
  },
  itemKcal: {
    fontSize: 14,
    fontWeight: '700',
    color: C.textSecondary,
  },
  pendingBadge: {
    backgroundColor: C.warningSurface,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pendingText: {
    fontSize: 11,
    fontWeight: '700',
    color: C.warning,
  },
  addButton: {
    marginTop: 12,
    alignSelf: 'flex-start',
    backgroundColor: C.accept,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  addButtonText: {
    color: C.onAccent,
    fontSize: 14,
    fontWeight: '700',
  },
});
