import React, { useEffect } from 'react';
import { ActivityIndicator, StatusBar, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { api } from '@/api/client';
import { GluestackUIProvider } from '@/components/ui/gluestack-ui-provider';
import { useCallRouting } from '@/hooks/useCallRouting';
import RootNavigator from '@/navigation/RootNavigator';
import { navigationRef } from '@/navigation/ref';
import { applySchedule } from '@/services/calls/schedule';
import { saveCachedSchedule } from '@/services/calls/scheduleStore';
import { reminderLog } from '@/services/calls/logger';
import { MetaProvider } from '@/state/MetaContext';
import { ProfileProvider, useProfile } from '@/state/ProfileContext';
import { tokens } from '@/theme/tokens';

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

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: tokens.dashboard.surface }}>
        <ActivityIndicator color={tokens.dashboard.green} />
      </View>
    );
  }
  // The default navigation theme, as in the old app: #f2f2f2 behind the white cards.
  return (
    <NavigationContainer ref={navigationRef}>
      <RootNavigator />
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <GluestackUIProvider>
          <StatusBar barStyle="dark-content" />
          <ProfileProvider>
            <MetaProvider>
              <Shell />
            </MetaProvider>
          </ProfileProvider>
        </GluestackUIProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
