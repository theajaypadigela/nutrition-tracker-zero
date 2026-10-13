import React, { useEffect, useMemo } from 'react';
import { View } from 'react-native';
import { DarkTheme, DefaultTheme, NavigationContainer, type Theme as NavTheme } from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { api } from '@/api/client';
import { LoadingState } from '@/components/kit';
import { useCallRouting } from '@/hooks/useCallRouting';
import RootNavigator from '@/navigation/RootNavigator';
import { navigationRef } from '@/navigation/ref';
import { applySchedule } from '@/services/calls/schedule';
import { saveCachedSchedule } from '@/services/calls/scheduleStore';
import { reminderLog } from '@/services/calls/logger';
import { MetaProvider } from '@/state/MetaContext';
import { ProfileProvider, useProfile } from '@/state/ProfileContext';
import { AppStatusBar, ThemeProvider, useTheme } from '@/theme';

function Shell() {
  const { ready, profile } = useProfile();
  const { colors, isDark } = useTheme();
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
      .catch(e => reminderLog.warn('schedule.sync_failed', String(e)));
  }, [ready, profile]);

  // React Navigation paints its own background behind screens and tabs; use the app's.
  const navTheme = useMemo<NavTheme>(() => {
    const base = isDark ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: colors.primary,
        background: colors.bg,
        card: colors.surface,
        text: colors.text,
        border: colors.border,
        notification: colors.danger,
      },
    };
  }, [colors, isDark]);

  if (!ready) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.bg }}>
        <LoadingState />
      </View>
    );
  }
  return (
    <NavigationContainer ref={navigationRef} theme={navTheme}>
      <RootNavigator />
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AppStatusBar />
          <ProfileProvider>
            <MetaProvider>
              <Shell />
            </MetaProvider>
          </ProfileProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
