/**
 * Shared building blocks. Colours follow the system light/dark setting; the brand is the
 * blue-to-cyan gradient of the app icon.
 */

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useState, type ComponentProps, type ReactNode } from 'react';
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
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { haptic } from './haptics';

export type IconName = ComponentProps<typeof Ionicons>['name'];
export type Tone = 'accent' | 'good' | 'warn' | 'danger' | 'neutral';

const LIGHT = {
  background: '#F2F5FA',
  surface: '#FFFFFF',
  surfaceAlt: '#EBF0F7',
  text: '#0B1220',
  muted: '#5E6B7E',
  border: '#E2E8F0',
  accent: '#0A66E0',
  accentSoft: 'rgba(10,102,224,0.10)',
  onAccent: '#FFFFFF',
  danger: '#DC3B40',
  dangerSoft: 'rgba(220,59,64,0.10)',
  good: '#0F7A3B',
  goodSoft: 'rgba(21,150,74,0.12)',
  warn: '#B45309',
  warnSoft: 'rgba(245,158,11,0.14)',
  neutralSoft: 'rgba(94,107,126,0.12)',
  gradient: ['#0A5FEB', '#0079B4'] as readonly [string, string],
  shadow: true,
};

const DARK: typeof LIGHT = {
  background: '#06080D',
  surface: '#11151F',
  surfaceAlt: '#1A2030',
  text: '#F3F6FB',
  muted: '#8B96A9',
  border: '#212938',
  accent: '#3D9DFF',
  accentSoft: 'rgba(61,157,255,0.16)',
  onAccent: '#FFFFFF',
  danger: '#FF6B6E',
  dangerSoft: 'rgba(255,107,110,0.14)',
  good: '#4ADE80',
  goodSoft: 'rgba(74,222,128,0.14)',
  warn: '#FBBF24',
  warnSoft: 'rgba(251,191,36,0.14)',
  neutralSoft: 'rgba(139,150,169,0.16)',
  gradient: ['#0F62EE', '#0079B4'] as readonly [string, string],
  shadow: false,
};

export type Palette = typeof LIGHT;

export function usePalette(): Palette {
  return useColorScheme() === 'dark' ? DARK : LIGHT;
}

/** The strong and the soft colour of a tone. */
export function toneColors(palette: Palette, tone: Tone): { strong: string; soft: string } {
  switch (tone) {
    case 'good':
      return { strong: palette.good, soft: palette.goodSoft };
    case 'warn':
      return { strong: palette.warn, soft: palette.warnSoft };
    case 'danger':
      return { strong: palette.danger, soft: palette.dangerSoft };
    case 'neutral':
      return { strong: palette.muted, soft: palette.neutralSoft };
    default:
      return { strong: palette.accent, soft: palette.accentSoft };
  }
}

/** Raised surfaces get a soft shadow in light mode; in dark mode a hairline border reads better. */
function surfaceStyle(palette: Palette): ViewStyle {
  return palette.shadow
    ? { backgroundColor: palette.surface, ...styles.shadow }
    : { backgroundColor: palette.surface, borderColor: palette.border, borderWidth: StyleSheet.hairlineWidth };
}

export function Screen({ children, testID }: { children: ReactNode; testID?: string }) {
  const palette = usePalette();
  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.background }]} edges={['top', 'left', 'right']} testID={testID}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        // A number pad has no return key: dragging the form puts it away, and the form can
        // always be scrolled clear of the keyboard.
        keyboardDismissMode="on-drag"
        automaticallyAdjustKeyboardInsets
        showsVerticalScrollIndicator={false}>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

/** The top of a screen: a small line above a large title, and an optional control on the right. */
export function Header({ eyebrow, title, right }: { eyebrow?: string; title: string; right?: ReactNode }) {
  const palette = usePalette();
  return (
    <View style={styles.header}>
      <View style={styles.fill}>
        {eyebrow ? <Text style={[styles.eyebrow, { color: palette.accent }]}>{eyebrow}</Text> : null}
        <Title>{title}</Title>
      </View>
      {right}
    </View>
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

/** A heading inside a screen, above a group of cards or rows. */
export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  const palette = usePalette();
  return (
    <View style={styles.sectionTitleRow}>
      <Text accessibilityRole="header" style={[styles.sectionTitle, { color: palette.text }]}>
        {children}
      </Text>
      {right}
    </View>
  );
}

export function Body({ children, muted, testID, center }: { children: ReactNode; muted?: boolean; testID?: string; center?: boolean }) {
  const palette = usePalette();
  return (
    <Text style={[styles.body, { color: muted ? palette.muted : palette.text }, center && styles.center]} testID={testID}>
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

export function Card({ children, testID, style }: { children: ReactNode; testID?: string; style?: StyleProp<ViewStyle> }) {
  const palette = usePalette();
  return (
    <View style={[styles.card, surfaceStyle(palette), style]} testID={testID}>
      {children}
    </View>
  );
}

/** A coloured banner: an icon and a few lines, for a notice that should stand out from the cards. */
export function Banner({ icon, tone = 'accent', children, testID }: { icon: IconName; tone?: Tone; children: ReactNode; testID?: string }) {
  const palette = usePalette();
  const { strong, soft } = toneColors(palette, tone);
  return (
    <View style={[styles.banner, { backgroundColor: soft }]} testID={testID}>
      <Ionicons name={icon} size={22} color={strong} style={styles.bannerIcon} />
      <View style={[styles.fill, styles.gapSmall]}>{children}</View>
    </View>
  );
}

/** The gradient card that carries the main thing on a screen. Text inside should use `HeroText`. */
export function HeroCard({ children, testID }: { children: ReactNode; testID?: string }) {
  const palette = usePalette();
  return (
    <View style={[styles.heroOuter, palette.shadow && styles.heroShadow]}>
      <LinearGradient colors={palette.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero} testID={testID}>
        {/* Two soft rings echo the circle of the app icon. */}
        <View pointerEvents="none" style={[styles.ring, styles.ringLarge]} />
        <View pointerEvents="none" style={[styles.ring, styles.ringSmall]} />
        {children}
      </LinearGradient>
    </View>
  );
}

export function HeroText({ children, kind = 'body', testID }: { children: ReactNode; kind?: 'eyebrow' | 'title' | 'body'; testID?: string }) {
  return (
    <Text
      accessibilityRole={kind === 'title' ? 'header' : undefined}
      style={kind === 'eyebrow' ? styles.heroEyebrow : kind === 'title' ? styles.heroTitle : styles.heroBody}
      testID={testID}>
      {children}
    </Text>
  );
}

/** A small rounded label with an optional icon. `onHero` draws it for a gradient background. */
export function Pill({ label, icon, tone = 'accent', onHero, testID }: { label: string; icon?: IconName; tone?: Tone; onHero?: boolean; testID?: string }) {
  const palette = usePalette();
  const { strong, soft } = toneColors(palette, tone);
  const color = onHero ? '#FFFFFF' : strong;
  return (
    <View style={[styles.pill, { backgroundColor: onHero ? 'rgba(255,255,255,0.2)' : soft }]} testID={testID}>
      {icon ? <Ionicons name={icon} size={14} color={color} /> : null}
      <Text style={[styles.pillLabel, { color }]}>{label}</Text>
    </View>
  );
}

/** A round icon on a tinted background. */
export function IconBubble({ name, tone = 'accent', size = 40, gradient, onHero }: { name: IconName; tone?: Tone; size?: number; gradient?: boolean; onHero?: boolean }) {
  const palette = usePalette();
  const { strong, soft } = onHero ? { strong: '#FFFFFF', soft: 'rgba(255,255,255,0.2)' } : toneColors(palette, tone);
  const frame = { width: size, height: size, borderRadius: size / 2 };
  if (gradient) {
    return (
      <LinearGradient colors={palette.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.bubble, frame]}>
        <Ionicons name={name} size={size * 0.5} color="#FFFFFF" />
      </LinearGradient>
    );
  }
  return (
    <View style={[styles.bubble, frame, { backgroundColor: soft }]}>
      <Ionicons name={name} size={size * 0.5} color={strong} />
    </View>
  );
}

/** One number with what it counts. The whole tile is read out as one `accessibilityLabel`. */
export function Stat({
  value,
  label,
  icon,
  tone = 'accent',
  testID,
  accessibilityLabel,
}: {
  value: string;
  label: string;
  icon?: IconName;
  tone?: Tone;
  testID?: string;
  accessibilityLabel?: string;
}) {
  const palette = usePalette();
  const { strong } = toneColors(palette, tone);
  const empty = value === 'No data' || value === '—';
  return (
    <View style={[styles.stat, surfaceStyle(palette)]} accessible accessibilityLabel={accessibilityLabel ?? `${label}: ${value}`} testID={testID}>
      {icon ? <Ionicons name={icon} size={18} color={strong} /> : null}
      <Text style={[empty ? styles.statEmpty : styles.statValue, { color: empty ? palette.muted : palette.text }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={[styles.statLabel, { color: palette.muted }]} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

/** Lays children out two to a row. */
export function Grid({ children }: { children: ReactNode }) {
  return <View style={styles.grid}>{children}</View>;
}

/** A line in a list: an optional icon, a title with a line under it, and something on the right. */
export function ListRow({
  icon,
  tone,
  title,
  subtitle,
  right,
  testID,
  accessibilityLabel,
  last,
}: {
  icon?: IconName;
  tone?: Tone;
  title: string;
  subtitle?: string;
  right?: ReactNode;
  testID?: string;
  accessibilityLabel?: string;
  last?: boolean;
}) {
  const palette = usePalette();
  return (
    <View
      style={[styles.row, !last && { borderBottomColor: palette.border, borderBottomWidth: StyleSheet.hairlineWidth }]}
      accessible={accessibilityLabel !== undefined}
      accessibilityLabel={accessibilityLabel}
      testID={testID}>
      {icon ? <IconBubble name={icon} tone={tone} size={36} /> : null}
      <View style={[styles.fill, styles.gapTiny]}>
        <Text style={[styles.rowTitle, { color: palette.text }]}>{title}</Text>
        {subtitle ? <Text style={[styles.rowSubtitle, { color: palette.muted }]}>{subtitle}</Text> : null}
      </View>
      {typeof right === 'string' ? <Text style={[styles.rowRight, { color: palette.muted }]}>{right}</Text> : right}
    </View>
  );
}

/** A thin bar that fills from left to right; `value` runs from 0 to 1. */
export function ProgressBar({ value, onHero }: { value: number; onHero?: boolean }) {
  const palette = usePalette();
  const share = `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%` as const;
  return (
    <View style={[styles.track, { backgroundColor: onHero ? 'rgba(255,255,255,0.25)' : palette.surfaceAlt }]}>
      {onHero ? (
        <View style={[styles.trackFill, { width: share, backgroundColor: '#FFFFFF' }]} />
      ) : (
        <LinearGradient colors={palette.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.trackFill, { width: share }]} />
      )}
    </View>
  );
}

export type ButtonKind = 'primary' | 'secondary' | 'ghost' | 'danger' | 'inverse';

export function Button({
  label,
  onPress,
  kind = 'primary',
  icon,
  busy = false,
  disabled = false,
  compact = false,
  testID,
}: {
  label: string;
  onPress: () => void;
  kind?: ButtonKind;
  icon?: IconName;
  busy?: boolean;
  disabled?: boolean;
  compact?: boolean;
  testID?: string;
}) {
  const palette = usePalette();
  const inactive = busy || disabled;
  const look: Record<ButtonKind, { background?: string; color: string }> = {
    primary: { color: palette.onAccent },
    secondary: { background: palette.accentSoft, color: palette.accent },
    ghost: { color: palette.accent },
    danger: { background: palette.dangerSoft, color: palette.danger },
    inverse: { background: '#FFFFFF', color: '#0A55C8' },
  };
  const { background, color } = look[kind];
  const content = busy ? (
    <ActivityIndicator color={color} />
  ) : (
    <View style={styles.buttonInner}>
      {icon ? <Ionicons name={icon} size={compact ? 17 : 20} color={color} /> : null}
      <Text style={[compact ? styles.buttonLabelCompact : styles.buttonLabel, { color }]}>{label}</Text>
    </View>
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy }}
      disabled={inactive}
      onPress={() => {
        if (kind === 'primary' || kind === 'inverse') haptic.press();
        else haptic.select();
        onPress();
      }}
      testID={testID}
      style={({ pressed }) => [
        compact ? styles.buttonCompact : styles.button,
        background ? { backgroundColor: background } : null,
        pressed && styles.pressed,
        inactive && styles.dimmed,
      ]}>
      {kind === 'primary' ? (
        <LinearGradient colors={palette.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[StyleSheet.absoluteFill, styles.buttonGradient]} />
      ) : null}
      {content}
    </Pressable>
  );
}

/** A round button with just an icon; `label` is what a screen reader says. */
export function IconButton({ icon, label, onPress, testID, disabled }: { icon: IconName; label: string; onPress: () => void; testID?: string; disabled?: boolean }) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      hitSlop={8}
      onPress={() => {
        haptic.select();
        onPress();
      }}
      testID={testID}
      style={({ pressed }) => [styles.iconButton, surfaceStyle(palette), pressed && styles.pressed, disabled && styles.dimmed]}>
      <Ionicons name={icon} size={20} color={palette.text} />
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

export function Field({ label, error, onFocus, onBlur, ...input }: { label: string; error?: string | undefined } & TextInputProps) {
  const palette = usePalette();
  const [focused, setFocused] = useState(false);
  const borderColor = error ? palette.danger : focused ? palette.accent : palette.border;
  return (
    <View style={styles.field}>
      <Label>{label}</Label>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={palette.muted}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        style={[styles.input, { color: palette.text, backgroundColor: palette.surface, borderColor }]}
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
              onPress={() => {
                haptic.select();
                onToggle(option.value);
              }}
              style={({ pressed }) => [
                styles.chip,
                on
                  ? { backgroundColor: palette.accent, borderColor: palette.accent }
                  : { backgroundColor: palette.surface, borderColor: palette.border },
                pressed && styles.pressed,
              ]}>
              {on ? <Ionicons name="checkmark" size={15} color={palette.onAccent} /> : null}
              <Text style={[styles.chipLabel, { color: on ? palette.onAccent : palette.text }]}>{option.label}</Text>
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
  fill: { flex: 1 },
  center: { textAlign: 'center' },
  gapTiny: { gap: 2 },
  gapSmall: { gap: 6 },
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 40, gap: 16 },
  header: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, marginBottom: 4 },
  eyebrow: { fontSize: 13, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 2 },
  title: { fontSize: 34, fontWeight: '800', letterSpacing: -0.8 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  sectionTitle: { fontSize: 20, fontWeight: '700', letterSpacing: -0.3 },
  body: { fontSize: 16, lineHeight: 23 },
  label: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.9 },
  error: { fontSize: 14, fontWeight: '500' },
  shadow: {
    shadowColor: '#0B1A33',
    shadowOpacity: 0.07,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  card: { borderRadius: 22, padding: 18, gap: 12 },
  banner: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderRadius: 18, padding: 16 },
  bannerIcon: { marginTop: 1 },
  heroOuter: { borderRadius: 28 },
  hero: { borderRadius: 28, padding: 22, gap: 12, overflow: 'hidden' },
  heroShadow: {
    shadowColor: '#0A6CFF',
    shadowOpacity: 0.32,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
  ring: { position: 'absolute', borderRadius: 999, borderColor: 'rgba(255,255,255,0.16)' },
  ringLarge: { width: 260, height: 260, right: -90, top: -110, borderWidth: 28 },
  ringSmall: { width: 120, height: 120, right: 40, bottom: -70, borderWidth: 14 },
  heroEyebrow: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' },
  heroTitle: { color: '#FFFFFF', fontSize: 30, fontWeight: '800', letterSpacing: -0.6, lineHeight: 34 },
  heroBody: { color: 'rgba(255,255,255,0.92)', fontSize: 16, lineHeight: 22 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  pillLabel: { fontSize: 13, fontWeight: '700' },
  bubble: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  stat: { flexGrow: 1, flexBasis: '45%', borderRadius: 20, padding: 16, gap: 4 },
  statValue: { fontSize: 26, fontWeight: '800', letterSpacing: -0.5, fontVariant: ['tabular-nums'] },
  statEmpty: { fontSize: 17, fontWeight: '600', paddingVertical: 5 },
  statLabel: { fontSize: 13, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  rowTitle: { fontSize: 16, fontWeight: '600' },
  rowSubtitle: { fontSize: 14 },
  rowRight: { fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  trackFill: { height: 6, borderRadius: 3 },
  button: { minHeight: 54, borderRadius: 999, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, overflow: 'hidden' },
  buttonCompact: { minHeight: 40, borderRadius: 999, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, overflow: 'hidden' },
  buttonGradient: { borderRadius: 999 },
  buttonInner: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  buttonLabel: { fontSize: 17, fontWeight: '700', letterSpacing: -0.2 },
  buttonLabelCompact: { fontSize: 15, fontWeight: '700' },
  iconButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  dimmed: { opacity: 0.5 },
  field: { gap: 8 },
  input: { minHeight: 54, borderWidth: 1.5, borderRadius: 16, paddingHorizontal: 16, fontSize: 17 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10 },
  chipLabel: { fontSize: 15, fontWeight: '600' },
});
