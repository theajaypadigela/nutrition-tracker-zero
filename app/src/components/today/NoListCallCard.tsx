import React, { useState } from 'react';
import { View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { PhoneMissed, Plus } from 'lucide-react-native';
import type { CallInfo } from '@/api/types';
import { Button, Card, Icon, Text } from '@/components/kit';
import { createStyles, radius, space } from '@/theme';

const useStyles = createStyles(({ colors }) => ({
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  tile: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.warningSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  transcript: { backgroundColor: colors.surfaceMuted, borderRadius: radius.md, padding: space.md + 2 },
}));

/** A call that ended without saving a food list: what happened, the transcript, and a way to add the food by hand. */
export function NoListCallCard({ call, date }: { call: CallInfo; date: string }) {
  const navigation = useNavigation();
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  const time = new Date(call.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return (
    <Card>
      <View style={styles.head}>
        <View style={styles.tile}>
          <Icon as={PhoneMissed} size="md" tone="warning" />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="bodyStrong">Call at {time} ended without a food list</Text>
          <Text variant="small" tone="muted">
            Nothing was saved from this call. You can add what you ate yourself.
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.lg }}>
        <Button
          label="Add items"
          icon={Plus}
          variant="soft"
          size="sm"
          onPress={() => navigation.navigate('AddItems', { date, callId: call.id })}
        />
        {call.transcript ? (
          <Button label={open ? 'Hide transcript' : 'Show transcript'} variant="ghost" size="sm" onPress={() => setOpen(!open)} />
        ) : null}
      </View>
      {open && call.transcript ? (
        <View style={[styles.transcript, { marginTop: space.md }]}>
          <Text variant="small" tone="secondary">
            {call.transcript}
          </Text>
        </View>
      ) : null}
    </Card>
  );
}
