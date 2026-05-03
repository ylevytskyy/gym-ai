// Thin wrapper around expo-speech. Chains instruction steps so each finishes
// before the next speaks — this gives a natural pause and surfaces onDone
// cleanly. Callers use useSpeech() to get { speaking, speakSteps, stop }.

import * as Speech from "expo-speech";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SupportedLanguage } from "@src/i18n";

const BCP47: Record<SupportedLanguage, string> = {
  en: "en-US",
  uk: "uk-UA",
};

/**
 * Returns true if the device reports any voice whose BCP-47 tag starts with
 * the target 2-letter code (e.g. "uk"). iOS ships `uk-UA` (Lesya); Android
 * may not have it unless the user has installed Google TTS with Ukrainian.
 */
export async function hasVoiceFor(lang: SupportedLanguage): Promise<boolean> {
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    const prefix = lang.toLowerCase();
    return voices.some((v) => v.language.toLowerCase().startsWith(prefix));
  } catch {
    // If the platform refuses the query, assume the voice exists rather than
    // showing a false-negative warning.
    return true;
  }
}

export function useSpeech() {
  const [speaking, setSpeaking] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      Speech.stop();
    };
  }, []);

  const speakSteps = useCallback(
    (steps: string[], lang: SupportedLanguage) => {
      Speech.stop();
      if (steps.length === 0) return;
      setSpeaking(true);
      let i = 0;
      const speakNext = () => {
        if (!mounted.current || i >= steps.length) {
          if (mounted.current) setSpeaking(false);
          return;
        }
        const step = steps[i++];
        Speech.speak(step, {
          language: BCP47[lang],
          onDone: () => speakNext(),
          onStopped: () => {
            if (mounted.current) setSpeaking(false);
          },
          onError: () => {
            if (mounted.current) setSpeaking(false);
          },
        });
      };
      speakNext();
    },
    [],
  );

  const stop = useCallback(() => {
    Speech.stop();
    setSpeaking(false);
  }, []);

  return { speaking, speakSteps, stop };
}
