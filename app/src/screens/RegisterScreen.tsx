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

/** The Worker's own limits (routes/auth.ts), checked here too so the button does not offer what the server will refuse. */
const MIN_PASSWORD = 8;
const MAX_USERNAME = 40;

/** Make an account. A new account is a new profile: it goes on to the recovery code and the call setup, as a new profile always did. */
export default function RegisterScreen() {
  const navigation = useNavigation();
  const { selectProfile } = useProfile();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ready = username.trim().length > 0 && password.length >= MIN_PASSWORD;

  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setUsernameError(null);
    setError(null);
    try {
      const created = await api.register(username.trim(), password);
      await selectProfile(created.profile, { isNew: true, secret: created.secret });
    } catch (e) {
      if (e instanceof ApiError && e.code === 'name_taken') setUsernameError('That username is taken. Try another.');
      else setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      title="Create your account"
      subtitle="A short voice call each evening logs what you ate."
      footer={
        <Button
          testID="go-login"
          label="Already have an account? Log in"
          variant="ghost"
          fullWidth
          onPress={() => navigation.dispatch(StackActions.replace('Login'))}
        />
      }
    >
      <Card>
        <View style={{ gap: space.lg }}>
          {error ? (
            <Notice tone="danger" testID="register-error">
              {error}
            </Notice>
          ) : null}
          <Field
            testID="register-username"
            label="Username"
            icon={User}
            value={username}
            onChangeText={setUsername}
            maxLength={MAX_USERNAME}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username-new"
            textContentType="username"
            error={usernameError}
            hint="You'll log in with this. It's also the name shown in the app."
          />
          <PasswordField
            testID="register-password"
            value={password}
            onChangeText={setPassword}
            autoComplete="password-new"
            textContentType="newPassword"
            returnKeyType="done"
            onSubmitEditing={submit}
            hint={`At least ${MIN_PASSWORD} characters. There is no way to reset it, so choose one you'll remember.`}
          />
          <Button
            testID="register-submit"
            label={busy ? 'Creating…' : 'Create account'}
            size="lg"
            fullWidth
            loading={busy}
            disabled={!ready}
            onPress={submit}
          />
        </View>
      </Card>
    </AuthLayout>
  );
}
