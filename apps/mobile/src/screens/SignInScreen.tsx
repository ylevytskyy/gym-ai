import { useState } from 'react';

import { sendCode, verifyCode } from '@/auth/sign-in';
import { useServices } from '@/services';
import { Body, Button, ErrorText, Field, Screen, Title } from '@/ui/kit';

/** Email, then the one-time code from the email. Signing in is noticed by AuthProvider. */
export function SignInScreen() {
  const { supabase } = useServices();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const submit = async (action: () => Promise<{ ok: true } | { ok: false; message: string }>, then?: () => void) => {
    setBusy(true);
    setError(undefined);
    const result = await action();
    setBusy(false);
    if (result.ok) then?.();
    else setError(result.message);
  };

  if (step === 'email') {
    return (
      <Screen testID="sign-in-email">
        <Title>Aura Fit</Title>
        <Body muted>Short workouts without equipment. Enter your email and we will send you a code to sign in.</Body>
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          placeholder="you@example.com"
          testID="email-input"
        />
        <ErrorText>{error}</ErrorText>
        <Button label="Send code" busy={busy} onPress={() => submit(() => sendCode(supabase, email), () => setStep('code'))} testID="send-code" />
      </Screen>
    );
  }

  return (
    <Screen testID="sign-in-code">
      <Title>Check your email</Title>
      <Body muted>We sent a code to {email.trim().toLowerCase()}. Enter it here.</Body>
      <Field
        label="Code"
        value={code}
        onChangeText={setCode}
        keyboardType="number-pad"
        maxLength={12}
        autoComplete="one-time-code"
        placeholder="123456"
        testID="code-input"
      />
      <ErrorText>{error}</ErrorText>
      <Button label="Sign in" busy={busy} onPress={() => submit(() => verifyCode(supabase, email, code))} testID="verify-code" />
      <Button
        label="Use a different email"
        kind="secondary"
        onPress={() => {
          setStep('email');
          setCode('');
          setError(undefined);
        }}
      />
    </Screen>
  );
}
