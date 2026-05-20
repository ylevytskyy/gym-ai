import React, { useState } from "react";
import { Text, View } from "react-native";
import { Redirect } from "expo-router";
import { useTranslation } from "react-i18next";

import { Button } from "@src/components/Button";
import { Screen } from "@src/components/Screen";
import { TextField } from "@src/components/TextField";
import { useTheme } from "@src/theme/ThemeProvider";
import { supabase } from "@src/lib/supabase";
import { useAuthStore } from "@src/store/authStore";

type Mode = "sign-in" | "sign-up";

export default function SignInScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const authStatus = useAuthStore((s) => s.status);
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      if (mode === "sign-in") {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) setError(error.message);
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
        if (error) {
          setError(error.message);
        } else if (!data.session) {
          setInfo(t("auth.checkEmail"));
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const title = mode === "sign-in" ? t("auth.signInTitle") : t("auth.signUpTitle");
  const cta = mode === "sign-in" ? t("auth.signInCta") : t("auth.signUpCta");
  const toggle =
    mode === "sign-in" ? t("auth.toggleToSignUp") : t("auth.toggleToSignIn");

  const valid = email.trim().length > 0 && password.length >= 6;

  if (authStatus === "signed-in") {
    return <Redirect href="/" />;
  }

  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: "center", gap: theme.spacing.md }}>
        <Text
          style={{
            fontSize: 26,
            fontWeight: "700",
            color: theme.colors.text,
            marginBottom: theme.spacing.md,
          }}
        >
          {title}
        </Text>
        <TextField
          label={t("auth.emailLabel")}
          placeholder={t("auth.emailPlaceholder")}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
        />
        <TextField
          label={t("auth.passwordLabel")}
          placeholder={t("auth.passwordPlaceholder")}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
          textContentType={mode === "sign-in" ? "password" : "newPassword"}
        />
        {error ? (
          <Text style={{ color: theme.colors.danger, fontSize: 13 }}>{error}</Text>
        ) : null}
        {info ? (
          <Text style={{ color: theme.colors.textMuted, fontSize: 13 }}>{info}</Text>
        ) : null}
        <Button
          label={cta}
          onPress={submit}
          loading={loading}
          disabled={!valid}
        />
        <Button
          label={toggle}
          variant="ghost"
          onPress={() => {
            setMode((m) => (m === "sign-in" ? "sign-up" : "sign-in"));
            setError(null);
            setInfo(null);
          }}
        />
      </View>
    </Screen>
  );
}
