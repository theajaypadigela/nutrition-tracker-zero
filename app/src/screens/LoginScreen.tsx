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
export default function LoginScreen({ reauthenticate = false }: { reauthenticate?: boolean } = {}) {
  const navigation = useNavigation();
  const { profile, selectProfile } = useProfile();
  const [username, setUsername] = useState(reauthenticate ? profile?.name ?? '' : '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = username.trim().length > 0 && password.length > 0;

  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      const loggedIn = await api.login(username.trim(), password);
      await selectProfile(loggedIn.profile, { secret: loggedIn.secret });
      if (reauthenticate) navigation.goBack();
    } catch (e) {
      setError(e instanceof ApiError && e.code === 'invalid_credentials' ? 'Wrong username or password.' : errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title={reauthenticate ? 'Log in again' : 'Welcome back'}
      subtitle={reauthenticate ? 'Log in to load your saved personal settings and targets.' : "Log in to see what you've logged."}
      footer={
        reauthenticate ? <Button label="Back" variant="ghost" fullWidth onPress={() => navigation.goBack()} /> : <Button
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
            editable={!reauthenticate}
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

/** Restore access when a previous install has no saved credential; the profile's data stays intact. */
export function ReauthenticateScreen() {
  return <LoginScreen reauthenticate />;
}
