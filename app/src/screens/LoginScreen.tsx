import React, { useState } from 'react';
import { View } from 'react-native';
import { StackActions, useNavigation } from '@react-navigation/native';
import { User } from 'lucide-react-native';
import { api, ApiError, errorMessage } from '@/api/client';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { PasswordField } from '@/components/auth/PasswordField';
import { Button, Card, Field, Notice } from '@/components/kit';
import { useProfile } from '@/state/ProfileContext';
import { space } from '@/theme';

/** Log in with the username and password made on the create account screen. */
export default function LoginScreen() {
  const navigation = useNavigation();
  const { selectProfile } = useProfile();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = username.trim().length > 0 && password.length > 0;

  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      await selectProfile(await api.login(username.trim(), password));
    } catch (e) {
      setError(e instanceof ApiError && e.code === 'invalid_credentials' ? 'Wrong username or password.' : errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Log in to see what you've logged."
      footer={
        <Button
          testID="go-register"
          label="New here? Create an account"
          variant="ghost"
          fullWidth
          onPress={() => navigation.dispatch(StackActions.replace('Register'))}
        />
      }
    >
      <Card>
        <View style={{ gap: space.lg }}>
          {error ? (
            <Notice tone="danger" testID="login-error">
              {error}
            </Notice>
          ) : null}
          <Field
            testID="login-username"
            label="Username"
            icon={User}
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            textContentType="username"
          />
          <PasswordField
            testID="login-password"
            value={password}
            onChangeText={setPassword}
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="done"
            onSubmitEditing={submit}
          />
          <Button testID="login-submit" label={busy ? 'Logging in…' : 'Log in'} size="lg" fullWidth loading={busy} disabled={!ready} onPress={submit} />
        </View>
      </Card>
    </AuthLayout>
  );
}
