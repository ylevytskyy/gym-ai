import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, Alert, Platform } from "react-native";
import { router } from "expo-router";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import DateTimePicker from "@react-native-community/datetimepicker";
import { format, parse } from "date-fns";
import { Screen } from "@src/components/Screen";
import { Card } from "@src/components/Card";
import { Chip } from "@src/components/Chip";
import { Button } from "@src/components/Button";
import { TextField } from "@src/components/TextField";
import { useTheme } from "@src/theme/ThemeProvider";
import { useProfileStore } from "@src/store/profileStore";
import {
  ALL_FITNESS_LEVELS,
  ALL_GOALS,
  FITNESS_LEVEL_LABELS,
  GOAL_LABELS,
  type FitnessLevel,
  type Goal,
} from "@src/types";
import { savePhotoToAppStorage } from "@src/lib/storage";

export default function ProfileEdit() {
  const theme = useTheme();
  const profile = useProfileStore((s) => s.profile);
  const setProfile = useProfileStore((s) => s.setProfile);

  const [name, setName] = useState(profile?.name ?? "");
  const [photoUri, setPhotoUri] = useState<string | null>(profile?.photo_uri ?? null);
  const [dob, setDob] = useState<string>(
    profile?.date_of_birth ?? format(new Date(1990, 0, 1), "yyyy-MM-dd"),
  );
  const [weight, setWeight] = useState(String(profile?.weight_kg ?? ""));
  const [height, setHeight] = useState(String(profile?.height_cm ?? ""));
  const [fitnessLevel, setFitnessLevel] = useState<FitnessLevel>(
    profile?.fitness_level ?? "beginner",
  );
  const [goals, setGoals] = useState<Goal[]>(profile?.primary_goals ?? []);
  const [dobOpen, setDobOpen] = useState(false);

  const toggleGoal = (g: Goal) => {
    setGoals((curr) =>
      curr.includes(g) ? curr.filter((x) => x !== g) : [...curr, g],
    );
  };

  const pickPhoto = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      quality: 0.8,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (!res.canceled && res.assets[0]) {
      try {
        const stored = await savePhotoToAppStorage(res.assets[0].uri);
        setPhotoUri(stored);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Unknown";
        Alert.alert("Could not save photo", msg);
      }
    }
  };

  const save = () => {
    if (!profile) return;
    const weightN = Number(weight);
    const heightN = Number(height);
    if (
      !name.trim() ||
      isNaN(weightN) ||
      isNaN(heightN) ||
      goals.length === 0
    ) {
      Alert.alert("Check your inputs", "Name, weight, height, and at least one goal are required.");
      return;
    }
    setProfile({
      ...profile,
      name: name.trim(),
      photo_uri: photoUri,
      date_of_birth: dob,
      weight_kg: weightN,
      height_cm: heightN,
      fitness_level: fitnessLevel,
      primary_goals: goals,
    });
    router.back();
  };

  return (
    <Screen scrollable>
      <View style={{ alignItems: "center", marginBottom: 16 }}>
        <Pressable onPress={pickPhoto}>
          <View
            style={[
              styles.avatar,
              {
                backgroundColor: theme.colors.surfaceAlt,
                borderColor: theme.colors.border,
              },
            ]}
          >
            {photoUri ? (
              <Image
                source={{ uri: photoUri }}
                style={{ width: "100%", height: "100%" }}
                contentFit="cover"
              />
            ) : (
              <Text style={{ fontSize: 36, color: theme.colors.textMuted }}>
                {name ? name[0]?.toUpperCase() : "?"}
              </Text>
            )}
          </View>
        </Pressable>
        <Pressable onPress={pickPhoto}>
          <Text
            style={{
              color: theme.colors.primary,
              fontWeight: "600",
              marginTop: 8,
            }}
          >
            Change photo
          </Text>
        </Pressable>
      </View>

      <Card>
        <TextField label="Name" value={name} onChangeText={setName} />
      </Card>

      <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>
        DATE OF BIRTH
      </Text>
      <Card>
        <Pressable onPress={() => setDobOpen(true)}>
          <Text style={{ color: theme.colors.text, fontSize: 16 }}>
            {format(parse(dob, "yyyy-MM-dd", new Date()), "MMMM d, yyyy")}
          </Text>
        </Pressable>
        {dobOpen ? (
          <DateTimePicker
            value={parse(dob, "yyyy-MM-dd", new Date())}
            mode="date"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            maximumDate={new Date()}
            onChange={(_e, picked) => {
              if (Platform.OS === "android") setDobOpen(false);
              if (picked) setDob(format(picked, "yyyy-MM-dd"));
            }}
            themeVariant={theme.dark ? "dark" : "light"}
          />
        ) : null}
      </Card>

      <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>
        BODY
      </Text>
      <Card>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <View style={{ flex: 1 }}>
            <TextField
              label="Weight (kg)"
              value={weight}
              onChangeText={setWeight}
              keyboardType="decimal-pad"
            />
          </View>
          <View style={{ flex: 1 }}>
            <TextField
              label="Height (cm)"
              value={height}
              onChangeText={setHeight}
              keyboardType="number-pad"
            />
          </View>
        </View>
      </Card>

      <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>
        FITNESS LEVEL
      </Text>
      <Card>
        <View
          style={{
            flexDirection: "row",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          {ALL_FITNESS_LEVELS.map((f) => (
            <Chip
              key={f}
              label={FITNESS_LEVEL_LABELS[f]}
              selected={fitnessLevel === f}
              onPress={() => setFitnessLevel(f)}
            />
          ))}
        </View>
      </Card>

      <Text style={[styles.sectionLabel, { color: theme.colors.textMuted }]}>
        GOALS
      </Text>
      <Card>
        <View
          style={{
            flexDirection: "row",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          {ALL_GOALS.map((g) => (
            <Chip
              key={g}
              label={GOAL_LABELS[g]}
              selected={goals.includes(g)}
              onPress={() => toggleGoal(g)}
            />
          ))}
        </View>
      </Card>

      <View style={{ marginTop: 24, marginBottom: 24 }}>
        <Button label="Save" size="lg" onPress={save} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    marginTop: 16,
    marginBottom: 6,
  },
});
