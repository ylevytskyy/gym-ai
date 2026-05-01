import React, { useMemo } from "react";
import { SectionList, StyleSheet, Text, View, Pressable } from "react-native";
import { router } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTranslation } from "react-i18next";
import { Screen } from "@src/components/Screen";
import { ExerciseImageThumbnail } from "@src/components/ExerciseImageThumbnail";
import { useTheme } from "@src/theme/ThemeProvider";
import { getCatalog, exerciseText } from "@src/lib/catalog";
import type { Exercise, ExerciseCategory } from "@src/types";

const CATEGORY_ORDER: ExerciseCategory[] = [
  "desk_break",
  "mobility",
  "flexibility",
  "core",
  "strength_upper",
  "strength_lower",
  "cardio",
  "stair",
];

interface Section {
  title: string;
  key: ExerciseCategory;
  data: Exercise[];
}

export default function ExercisesTab() {
  const theme = useTheme();
  const { t } = useTranslation();

  const sections: Section[] = useMemo(() => {
    const catalog = getCatalog();
    const byCat = new Map<ExerciseCategory, Exercise[]>();
    for (const cat of CATEGORY_ORDER) byCat.set(cat, []);
    for (const ex of catalog.exercises) {
      byCat.get(ex.category)?.push(ex);
    }
    return CATEGORY_ORDER.map((cat) => ({
      title: t(`enums:exerciseCategories.${cat}`),
      key: cat,
      data: byCat.get(cat) ?? [],
    })).filter((s) => s.data.length > 0);
  }, [t]);

  return (
    <Screen>
      <Text style={[styles.header, { color: theme.colors.text }]}>
        {t("exercises.listTitle")}
      </Text>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => (
          <Text
            style={[styles.sectionLabel, { color: theme.colors.textMuted }]}
          >
            {section.title.toUpperCase()}
          </Text>
        )}
        renderItem={({ item }) => <Row exercise={item} />}
        ItemSeparatorComponent={() => (
          <View
            style={{
              height: 1,
              backgroundColor: theme.colors.border,
              marginLeft: 60,
            }}
          />
        )}
        contentContainerStyle={{ paddingBottom: 32 }}
      />
    </Screen>
  );
}

function Row({ exercise }: { exercise: Exercise }) {
  const theme = useTheme();
  const { t } = useTranslation();
  const text = exerciseText(exercise.id);
  const sep = t("exercises.bodyPartSeparator");
  const subtitle = exercise.body_parts
    .map((p) => t(`enums:bodyParts.${p}`))
    .join(sep);

  return (
    <Pressable
      onPress={() => router.push(`/exercises/${exercise.id}` as any)}
      style={styles.row}
      android_ripple={{ color: theme.colors.border }}
    >
      <ExerciseImageThumbnail exerciseId={exercise.id} size={48} />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text
          style={{ color: theme.colors.text, fontSize: 16, fontWeight: "600" }}
          numberOfLines={1}
        >
          {text.name}
        </Text>
        <Text
          style={{ color: theme.colors.textMuted, fontSize: 12, marginTop: 2 }}
          numberOfLines={1}
        >
          {subtitle}
        </Text>
      </View>
      <Ionicons
        name="chevron-forward"
        size={18}
        color={theme.colors.textMuted}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { fontSize: 28, fontWeight: "700", marginBottom: 8 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    marginTop: 18,
    marginBottom: 6,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
  },
});
