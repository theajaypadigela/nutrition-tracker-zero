import React, { useState } from 'react';
import { Eye, EyeOff, Lock } from 'lucide-react-native';
import { Field, IconButton } from '@/components/kit';

/**
 * A password field with a show/hide button. There is no "forgot password" (nothing here can send an email), and a typo while creating
 * an account would lock the person out, so being able to see what they typed is not a nicety.
 */
export function PasswordField(props: Omit<React.ComponentProps<typeof Field>, 'icon' | 'trailing' | 'secureTextEntry'>) {
  const [shown, setShown] = useState(false);
  return (
    <Field
      label="Password"
      autoCapitalize="none"
      autoCorrect={false}
      {...props}
      icon={Lock}
      secureTextEntry={!shown}
      trailing={
        <IconButton
          icon={shown ? EyeOff : Eye}
          size={32}
          tone="muted"
          accessibilityLabel={shown ? 'Hide password' : 'Show password'}
          onPress={() => setShown((v) => !v)}
        />
      }
    />
  );
}
