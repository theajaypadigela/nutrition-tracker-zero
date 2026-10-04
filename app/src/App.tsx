import React, { useEffect } from 'react';
import { StatusBar } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { api } from '@/api/client';
import { Loading } from '@/components/ui';
import { useCallRouting } from '@/hooks/useCallRouting';
import RootNavigator from '@/navigation/RootNavigator';
import { navigationRef } from '@/navigation/ref';
import { applySchedule } from '@/services/calls/schedule';
import { saveCachedSchedule } from '@/services/calls/scheduleStore';
import { reminderLog } from '@/services/calls/logger';
import { MetaProvider } from '@/state/MetaContext';
import { ProfileProvider, useProfile } from '@/state/ProfileContext';
import { colors } from '@/theme/colors';

const theme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, primary: colors.brand, background: '#f4f7f5' } };

function Shell() {
  const { ready, profile } = useProfile();
  useCallRouting(ready ? !!profile : null);

  // Keep the local ring schedule in step with the server (e.g. after picking an existing profile).
  useEffect(() => {
    if (!ready) return;
    if (!profile) {
      saveCachedSchedule(null).catch(() => {});
      return;
    }
    api
      .getSettings()
      .then(applySchedule)
      .catch((e) => reminderLog.warn('schedule.sync_failed', String(e)));
  }, [ready, profile]);

  if (!ready) return <Loading />;
  return (
    <NavigationContainer ref={navigationRef} theme={theme}>
      <RootNavigator />
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar barStyle="dark-content" />
        <ProfileProvider>
          <MetaProvider>
            <Shell />
          </MetaProvider>
        </ProfileProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
