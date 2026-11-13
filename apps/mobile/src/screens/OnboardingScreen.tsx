import { useEffect, useState } from 'react';

import { useHealth } from '@/health/HealthProvider';
import {
  AGE_RANGES,
  applySuggestions,
  EMPTY_PROFILE_FORM,
  GOALS,
  INJURIES,
  suggestionsFrom,
  validateProfile,
  type ProfileErrors,
  type ProfileForm,
  type ProfileSuggestions,
} from '@/profile/model';
import { useProfile } from '@/profile/ProfileProvider';
import { useServices } from '@/services';
import { Banner, Body, Button, Card, Choices, ErrorText, Header, IconBubble, NumberField, Screen, SectionTitle } from '@/ui/kit';

const GOAL_LABELS: Record<(typeof GOALS)[number], string> = {
  move_more: 'Move more',
  build_strength: 'Build strength',
  lose_weight: 'Lose weight',
  improve_flexibility: 'Be more flexible',
};

const INJURY_LABELS: Record<(typeof INJURIES)[number], string> = {
  neck_injury: 'Neck',
  shoulder_injury: 'Shoulder',
  elbow_injury: 'Elbow',
  wrist_injury: 'Wrist',
  lower_back_injury: 'Lower back',
  hip_injury: 'Hip',
  knee_injury: 'Knee',
  ankle_injury: 'Ankle',
};

const LEVELS = [
  { value: 1 as const, label: 'Beginner' },
  { value: 2 as const, label: 'Intermediate' },
  { value: 3 as const, label: 'Advanced' },
];

const describe = (s: ProfileSuggestions): string =>
  [s.weightKg === undefined ? null : `weight ${s.weightKg} kg`, s.ageRange === undefined ? null : `age range ${s.ageRange}`]
    .filter(Boolean)
    .join(' and ');

const healthName = (platform: string) => (platform === 'android' ? 'Health Connect' : 'Apple Health');

export function OnboardingScreen({ platform }: { platform: 'ios' | 'android' }) {
  const { health, today } = useServices();
  const { state, connect, busy } = useHealth();
  const { save } = useProfile();

  const [form, setForm] = useState<ProfileForm>(EMPTY_PROFILE_FORM);
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [suggestions, setSuggestions] = useState<ProfileSuggestions>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | undefined>();

  // Once connected, look for values worth offering. They are shown, not applied.
  useEffect(() => {
    let active = true;
    if (state !== 'connected') return;
    health
      .readProfileHints()
      .then((hints) => active && setSuggestions(suggestionsFrom(hints, today())))
      .catch(() => active && setSuggestions({}));
    return () => {
      active = false;
    };
  }, [state, health, today]);

  const set = <K extends keyof ProfileForm>(key: K, value: ProfileForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    // A complaint about a field goes away as soon as the user changes that field.
    setErrors((current) => (key in current ? { ...current, [key]: undefined } : current));
  };
  // Suggestions only count while connected: disconnecting hides whatever was found before.
  const offered = state === 'connected' ? suggestions : {};
  const hasSuggestions = offered.weightKg !== undefined || offered.ageRange !== undefined;
  const canOfferHealth = state === 'off' || state === 'denied';

  const submit = async () => {
    const result = validateProfile(form);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setSaving(true);
    setSaveError(undefined);
    try {
      await save(result.values);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Could not save your profile.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen testID="onboarding">
      <Header eyebrow="Welcome to Aura Fit" title="About you" />
      <Body muted>This shapes your plan. It is not medical advice: tell us about injuries and we will avoid exercises that load them.</Body>

      {canOfferHealth ? (
        <Card testID="health-offer">
          <IconBubble name="heart" tone="danger" />
          <Body>Connect {healthName(platform)} to fill in your weight{platform === 'ios' ? ' and age range' : ''}, and later to adjust sessions to your sleep and activity.</Body>
          <Button label={`Connect ${healthName(platform)}`} kind="secondary" icon="link" busy={busy} onPress={() => void connect()} testID="connect-health" />
        </Card>
      ) : null}

      {hasSuggestions ? (
        <Banner icon="sparkles" tone="good" testID="health-suggestion">
          <Body>
            {healthName(platform)} has your {describe(offered)}. Use {offered.weightKg !== undefined && offered.ageRange !== undefined ? 'them' : 'it'} here?
          </Body>
          <Button
            label="Use these values"
            kind="secondary"
            icon="checkmark"
            onPress={() => {
              setForm((current) => applySuggestions(current, offered));
              setSuggestions({});
            }}
            testID="use-suggestion"
          />
          <Button label="No, I will type them" kind="ghost" onPress={() => setSuggestions({})} testID="dismiss-suggestion" />
        </Banner>
      ) : null}

      <SectionTitle>You</SectionTitle>
      <Card>
        <Choices
          label="Age range"
          options={AGE_RANGES.map((value) => ({ value, label: value }))}
          selected={form.ageRange ? [form.ageRange] : []}
          onToggle={(value) => set('ageRange', value)}
          error={errors.ageRange}
        />
        <NumberField
          label="Weight (kg)"
          value={form.weightKg}
          onChangeText={(text) => set('weightKg', text)}
          maxLength={3}
          error={errors.weightKg}
          testID="weight-input"
        />
      </Card>
      <SectionTitle>Your training</SectionTitle>
      <Card>
        <Choices
          label="Goal"
          options={GOALS.map((value) => ({ value, label: GOAL_LABELS[value] }))}
          selected={form.goal ? [form.goal] : []}
          onToggle={(value) => set('goal', value)}
          error={errors.goal}
        />
        <Choices
          label="Level"
          options={LEVELS}
          selected={form.fitnessLevel ? [form.fitnessLevel] : []}
          onToggle={(value) => set('fitnessLevel', value)}
          error={errors.fitnessLevel}
        />
        <NumberField
          label="Minutes per day"
          value={form.minutesPerDay}
          onChangeText={(text) => set('minutesPerDay', text)}
          maxLength={3}
          error={errors.minutesPerDay}
          testID="minutes-input"
        />
      </Card>
      <SectionTitle>Your body</SectionTitle>
      <Card>
        <Choices
          label="Injuries to work around"
          options={INJURIES.map((value) => ({
            value,
            label: INJURY_LABELS[value],
          }))}
          selected={form.injuries}
          onToggle={(value) => set('injuries', form.injuries.includes(value) ? form.injuries.filter((i) => i !== value) : [...form.injuries, value])}
        />
      </Card>

      <ErrorText>{saveError}</ErrorText>
      <Button label="Save and continue" icon="arrow-forward" busy={saving} onPress={() => void submit()} testID="save-profile" />
    </Screen>
  );
}
