import React, { useCallback, useMemo } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { BarChart3, ChevronRight, Target } from 'lucide-react-native';
import { api } from '@/api/client';
import AppBar from '@/components/common/AppBar';
import { Notice } from '@/components/common/Feedback';
import CaloriesSummaryCard from '@/components/nutrition-report/CaloriesSummaryCard';
import MacroNutrientsSection from '@/components/nutrition-report/MacroNutrientsSection';
import MicroNutrientsSection from '@/components/nutrition-report/MicroNutrientsSection';
import { deviceTimeZone } from '@/components/TimezoneField';
import { Text } from '@/components/ui/text';
import { VStack } from '@/components/ui/vstack';
import { useAsync } from '@/hooks/useAsync';
import { useMeta } from '@/state/MetaContext';
import { tokens } from '@/theme/tokens';
import type { NutrientData } from '@/types/nutrition';
import { addDays, localDateIn, weekStart } from '@/utils/dates';
import { buildWeeklyNutrients, daysElapsed } from '@/utils/week';

/**
 * This week so far vs goals, computed from D1 (no AI, PLAN.md §12) — the old Nutrition
 * Report layout without its AI-insights card. Other weeks and every nutrient live in the
 * weekly view.
 */
export default function ReportScreen() {
  const navigation = useNavigation();
  const meta = useMeta();
  const today = localDateIn(deviceTimeZone());
  const start = weekStart(today);
  const range = useAsync(() => api.getDays(start, addDays(start, 6)), [start]);
  useFocusEffect(
    useCallback(() => {
      range.reload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [start]),
  );

  const elapsed = daysElapsed(start, today);
  const byKey = useMemo(() => {
    const list = range.data ? buildWeeklyNutrients(range.data, start, today, meta.nutrients) : [];
    return Object.fromEntries(list.map(n => [n.id, n]));
  }, [range.data, start, today, meta.nutrients]);

  const pick = (key: string): NutrientData => {
    const n = byKey[key];
    return {
      current: Math.round(n?.amount ?? 0),
      goal: Math.round(n?.goal ?? 0),
      weeklyGoal: n?.dailyGoal ? Math.round(n.dailyGoal * 7) : undefined,
    };
  };

  const calories = pick('calories');
  const loggedDays = byKey.calories?.loggedDays ?? 0;
  const pending = range.data?.days.reduce((s, d) => s + d.pendingCount, 0) ?? 0;

  return (
    <View className="flex-1">
      <AppBar title="Nutrition Report" showProfileShortcut />
      {!range.data && range.loading ? (
        <View className="flex-1 justify-center items-center">
          <ActivityIndicator size="large" color={tokens.report.spinner} />
          <Text className="mt-4 text-gray-600">Loading nutrition data...</Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={range.loading && !!range.data} onRefresh={range.reload} />}
        >
          <VStack className="p-6 gap-6">
            {range.error ? <Notice tone="error">{range.error}</Notice> : null}
            <VStack className="gap-2">
              <CaloriesSummaryCard
                caloriesSoFar={calories.current}
                proratedGoal={calories.goal}
                weeklyGoal={calories.weeklyGoal ?? 0}
                daysElapsed={elapsed}
              />
              <Text className="text-xs text-gray-500 px-1">
                {loggedDays} of 7 days logged
                {pending ? ` · ${pending} item${pending === 1 ? '' : 's'} still unknown, not counted` : ''}
              </Text>
            </VStack>
            <MacroNutrientsSection
              macroNutrients={{ protein: pick('protein'), carbs: pick('carbs'), fats: pick('fat') }}
            />
          </VStack>

          <MicroNutrientsSection
            microNutrients={{ sugar: pick('sugar'), fiber: pick('fiber'), sodium: pick('sodium') }}
          />

          {/* Navigation card → All-nutrients weekly summary */}
          <TouchableOpacity
            onPress={() => navigation.navigate('WeeklySummary')}
            activeOpacity={0.85}
            style={[styles.navCard, styles.navCardFirst]}
          >
            <View style={styles.navIconWrap}>
              <BarChart3 size={20} color={tokens.report.primaryDeep} strokeWidth={2.2} />
            </View>
            <View style={styles.navTextCol}>
              <Text style={styles.navTitle}>All nutrients · weekly view</Text>
              <Text style={styles.navSub}>Score, search, day-by-day chart, custom goals</Text>
            </View>
            <ChevronRight size={20} color={tokens.report.primaryDeep} strokeWidth={2.2} />
          </TouchableOpacity>

          {/* Navigation card → daily goals */}
          <TouchableOpacity onPress={() => navigation.navigate('Goals')} activeOpacity={0.85} style={styles.navCard}>
            <View style={styles.navIconWrap}>
              <Target size={20} color={tokens.report.primaryDeep} strokeWidth={2.2} />
            </View>
            <View style={styles.navTextCol}>
              <Text style={styles.navTitle}>Daily goals</Text>
              <Text style={styles.navSub}>Set the targets every report compares against</Text>
            </View>
            <ChevronRight size={20} color={tokens.report.primaryDeep} strokeWidth={2.2} />
          </TouchableOpacity>

          <View style={styles.listFooter} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  listFooter: {
    height: 140,
  },
  navCardFirst: {
    marginTop: 24,
  },
  navCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 24,
    marginTop: 0,
    marginBottom: 12,
    padding: 18,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: tokens.report.cardLine,
    backgroundColor: tokens.report.cardBg,
    gap: 14,
  },
  navIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: tokens.report.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: tokens.report.cardLine,
  },
  navTextCol: {
    flex: 1,
  },
  navTitle: {
    color: tokens.report.primaryDeep,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  navSub: {
    color: tokens.report.inkFaint,
    fontSize: 12,
    fontWeight: '500',
    marginTop: 3,
  },
});
