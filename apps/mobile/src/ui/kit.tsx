/** Small shared building blocks. Plain React Native; colours follow the system light/dark setting. */

import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
  type TextInputProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export function usePalette() {
  const dark = useColorScheme() === 'dark';
  return {
    background: dark ? '#0F1115' : '#F6F7F9',
    surface: dark ? '#1A1D24' : '#FFFFFF',
    text: dark ? '#F2F4F7' : '#12151A',
    muted: dark ? '#9AA3B2' : '#5B6472',
    border: dark ? '#2B303A' : '#DDE1E7',
    accent: '#208AEF',
    onAccent: '#FFFFFF',
    danger: dark ? '#FF8A80' : '#C62828',
    good: dark ? '#7BD88F' : '#1B7F3B',
  };
}

export function Screen({ children, testID }: { children: ReactNode; testID?: string }) {
  const palette = usePalette();
  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.background }]} testID={testID}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        // A number pad has no return key: dragging the form puts it away, and the form can
        // always be scrolled clear of the keyboard.
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function Title({ children }: { children: ReactNode }) {
  const palette = usePalette();
  return (
    <Text accessibilityRole="header" style={[styles.title, { color: palette.text }]}>
      {children}
    </Text>
  );
}

export function Body({ children, muted, testID }: { children: ReactNode; muted?: boolean; testID?: string }) {
  const palette = usePalette();
  return (
    <Text style={[styles.body, { color: muted ? palette.muted : palette.text }]} testID={testID}>
      {children}
    </Text>
  );
}

export function Label({ children }: { children: ReactNode }) {
  const palette = usePalette();
  return <Text style={[styles.label, { color: palette.muted }]}>{children}</Text>;
}

export function ErrorText({ children }: { children: ReactNode }) {
  const palette = usePalette();
  if (!children) return null;
  return (
    <Text accessibilityRole="alert" style={[styles.error, { color: palette.danger }]}>
      {children}
    </Text>
  );
}

export function Card({ children, testID }: { children: ReactNode; testID?: string }) {
  const palette = usePalette();
  return (
    <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]} testID={testID}>
      {children}
    </View>
  );
}

export function Button({
  label,
  onPress,
  kind = 'primary',
  busy = false,
  disabled = false,
  testID,
}: {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary';
  busy?: boolean;
  disabled?: boolean;
  testID?: string;
}) {
  const palette = usePalette();
  const primary = kind === 'primary';
  const inactive = busy || disabled;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy }}
      disabled={inactive}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.button,
        primary ? { backgroundColor: palette.accent } : { borderColor: palette.border, borderWidth: 1 },
        (pressed || inactive) && styles.dimmed,
      ]}>
      {busy ? (
        <ActivityIndicator color={primary ? palette.onAccent : palette.accent} />
      ) : (
        <Text style={[styles.buttonLabel, { color: primary ? palette.onAccent : palette.accent }]}>{label}</Text>
      )}
    </Pressable>
  );
}

/**
 * A field for a whole number. The iOS number pad has no key to put it away and covers the
 * rest of a form, so iOS gets the numbers keyboard with a Done key instead; anything that is
 * not a digit is dropped as it is typed.
 */
export function NumberField({
  onChangeText,
  ...field
}: { label: string; error?: string | undefined; onChangeText: (digits: string) => void } & Omit<TextInputProps, 'onChangeText' | 'keyboardType'>) {
  return (
    <Field
      {...field}
      keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'number-pad'}
      returnKeyType="done"
      onChangeText={(text) => onChangeText(text.replace(/\D/g, ''))}
    />
  );
}

export function Field({ label, error, ...input }: { label: string; error?: string | undefined } & TextInputProps) {
  const palette = usePalette();
  return (
    <View style={styles.field}>
      <Label>{label}</Label>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={palette.muted}
        style={[styles.input, { color: palette.text, backgroundColor: palette.surface, borderColor: error ? palette.danger : palette.border }]}
        {...input}
      />
      <ErrorText>{error}</ErrorText>
    </View>
  );
}

/** A row of options where one (or, with `multiple`, several) can be chosen. */
export function Choices<T extends string | number>({
  label,
  options,
  selected,
  onToggle,
  error,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  selected: readonly T[];
  onToggle: (value: T) => void;
  error?: string | undefined;
}) {
  const palette = usePalette();
  return (
    <View style={styles.field}>
      <Label>{label}</Label>
      <View style={styles.chips}>
        {options.map((option) => {
          const on = selected.includes(option.value);
          return (
            <Pressable
              key={String(option.value)}
              accessibilityRole="button"
              accessibilityLabel={`${label}: ${option.label}`}
              accessibilityState={{ selected: on }}
              onPress={() => onToggle(option.value)}
              style={[
                styles.chip,
                { borderColor: on ? palette.accent : palette.border, backgroundColor: on ? palette.accent : palette.surface },
              ]}>
              <Text style={{ color: on ? palette.onAccent : palette.text }}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <ErrorText>{error}</ErrorText>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 20, gap: 16 },
  title: { fontSize: 28, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 22 },
  label: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  error: { fontSize: 14 },
  card: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 12 },
  button: { minHeight: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  buttonLabel: { fontSize: 17, fontWeight: '600' },
  dimmed: { opacity: 0.6 },
  field: { gap: 8 },
  input: { minHeight: 50, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, fontSize: 17 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
});
