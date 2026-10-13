import React from 'react';
import { Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Avatar } from '@/components/kit';
import { useProfile } from '@/state/ProfileContext';
import { initialsOf } from '@/utils/format';

/** The signed-in profile's initials; opens Settings. It sits at the right of every tab's title. */
export function ProfileButton() {
  const navigation = useNavigation();
  const { profile } = useProfile();
  return (
    <Pressable
      onPress={() => navigation.navigate('Settings')}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel="Open settings"
    >
      <Avatar initials={initialsOf(profile?.name)} size={40} />
    </Pressable>
  );
}
