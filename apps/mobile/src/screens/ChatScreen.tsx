import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AssistantError, sendChat } from '@/assistant/client';
import { useAuth } from '@/auth/AuthProvider';
import { loadMessages, type ChatMessage } from '@/chat/repository';
import { usePlan } from '@/plan/PlanProvider';
import { useProfile } from '@/profile/ProfileProvider';
import { useServices } from '@/services';
import { haptic } from '@/ui/haptics';
import { Body, ErrorText, Header, IconBubble, usePalette } from '@/ui/kit';

const MAX_MESSAGE = 1000;

/** A line the app adds to the conversation itself, to say what changed. */
type Note = { id: string; kind: 'plan' | 'injuries'; text: string };
type Entry = { type: 'message'; message: ChatMessage } | { type: 'note'; note: Note };

/** Ready-made first messages: one tap puts them in the field. */
const STARTERS = ['Make it easier', 'I only have ten minutes', 'My knee hurts', 'How am I doing?'];

const readable = (injury: string) => injury.replace(/_/g, ' ');

/**
 * The conversation with the assistant. The service stores each exchange and applies any plan
 * change itself; this screen shows what came back and reloads what changed.
 */
export function ChatScreen({ refreshKey = 0 }: { refreshKey?: number }) {
  const palette = usePalette();
  const services = useServices();
  const { session } = useAuth();
  const userId = session?.user.id;
  const token = session?.access_token;
  const plan = usePlan();
  const profile = useProfile();

  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [loadError, setLoadError] = useState<string | undefined>();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | undefined>();
  /** The message on its way: shown at once, and taken back if it could not be sent. */
  const [pending, setPending] = useState<string | undefined>();
  // Set before any re-render, so two quick presses send one message.
  const sendStarted = useRef(false);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    loadMessages(services.supabase, userId)
      .then((messages) => active && setEntries(messages.map((message) => ({ type: 'message', message }))))
      .catch((error: unknown) => {
        if (!active) return;
        setEntries([]);
        setLoadError(error instanceof Error ? error.message : 'Could not load your conversation.');
      });
    return () => {
      active = false;
    };
    // Loaded again each time the tab is opened: the conversation may have been cleared elsewhere.
  }, [services.supabase, userId, refreshKey]);

  const send = async () => {
    const message = text.trim();
    if (!token || message === '' || sendStarted.current) return;
    sendStarted.current = true;
    setSending(true);
    setSendError(undefined);
    setPending(message);
    try {
      const answer = await sendChat(services.fetch, services.assistantUrl, token, message);
      const id = services.newId();
      const added: Entry[] = [
        { type: 'message', message: { id: `${id}-user`, role: 'user', content: message } },
        { type: 'message', message: { id: `${id}-assistant`, role: 'assistant', content: answer.reply } },
      ];
      if (answer.injuriesAdded.length > 0) {
        added.push({ type: 'note', note: { id: `${id}-injuries`, kind: 'injuries', text: `Added to your profile: ${answer.injuriesAdded.map(readable).join(', ')}.` } });
        void profile.refresh();
      }
      if (answer.plan) {
        added.push({ type: 'note', note: { id: `${id}-plan`, kind: 'plan', text: 'Your plan was updated. See the Today tab.' } });
        plan.replace(answer.plan);
      }
      if (answer.planRemoved) {
        added.push({ type: 'note', note: { id: `${id}-plan`, kind: 'plan', text: 'Your plan needs to be made again. See the Today tab.' } });
        plan.reload();
      }
      setEntries((current) => [...(current ?? []), ...added]);
      setText('');
    } catch (error) {
      // The typed text stays, so nothing has to be written again.
      setSendError(error instanceof AssistantError ? error.message : 'The message could not be sent. Try again.');
      // The service may have finished after the app stopped waiting: show what is really stored.
      plan.reload();
      void profile.refresh();
    } finally {
      sendStarted.current = false;
      setPending(undefined);
      setSending(false);
    }
  };

  const canSend = text.trim() !== '' && !sending;
  const mine = (content: string, testID: string, dim?: boolean) => (
    <View testID={testID} style={[styles.bubble, styles.mine, dim && styles.dimmed]}>
      <LinearGradient colors={palette.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      <Text style={[styles.bubbleText, { color: palette.onAccent }]}>{content}</Text>
    </View>
  );

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.background }]} edges={['top', 'left', 'right']} testID="chat">
      {/* Found on the emulator: without this on Android too, the keyboard covers the message field and Send. */}
      <KeyboardAvoidingView style={styles.fill} behavior="padding">
        <ScrollView
          ref={scroll}
          style={styles.fill}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}>
          <Header eyebrow="AI coach" title="Coach" />
          {entries === null ? <Body muted>Loading your conversation…</Body> : null}
          <ErrorText>{loadError}</ErrorText>
          {entries !== null && entries.length === 0 && !loadError ? (
            <View testID="chat-empty" style={styles.empty}>
              <IconBubble name="sparkles" gradient size={64} />
              <Body muted center>
                Ask about your plan, or tell the coach what you need: “make it easier”, “I only have ten minutes”, “my knee hurts”.
              </Body>
              <View style={styles.starters}>
                {STARTERS.map((starter) => (
                  <Pressable
                    key={starter}
                    accessibilityRole="button"
                    accessibilityLabel={`Write: ${starter}`}
                    onPress={() => {
                      haptic.select();
                      setText(starter);
                    }}
                    style={({ pressed }) => [styles.starter, { backgroundColor: palette.accentSoft }, pressed && styles.dimmed]}>
                    <Text style={[styles.starterText, { color: palette.accent }]}>{starter}</Text>
                  </Pressable>
                ))}
              </View>
              <Body muted center>
                The coach is an AI. It can change your plan, but it is not a doctor and gives no medical advice.
              </Body>
            </View>
          ) : null}
          {(entries ?? []).map((entry) =>
            entry.type === 'note' ? (
              <View key={entry.note.id} style={[styles.note, { backgroundColor: palette.surfaceAlt }]}>
                <Ionicons name={entry.note.kind === 'plan' ? 'calendar' : 'medkit'} size={14} color={palette.muted} />
                <Text style={[styles.noteText, { color: palette.muted }]} testID={entry.note.kind === 'plan' ? 'chat-plan-changed' : 'chat-injuries-added'}>
                  {entry.note.text}
                </Text>
              </View>
            ) : entry.message.role === 'user' ? (
              <View key={entry.message.id}>{mine(entry.message.content, 'message-user')}</View>
            ) : (
              <View
                key={entry.message.id}
                testID="message-assistant"
                style={[styles.bubble, styles.theirs, { backgroundColor: palette.surface, borderColor: palette.border }]}>
                <Text style={[styles.bubbleText, { color: palette.text }]}>{entry.message.content}</Text>
              </View>
            ),
          )}
          {pending !== undefined ? mine(pending, 'message-user', true) : null}
          {sending ? (
            <View style={[styles.bubble, styles.theirs, styles.typing, { backgroundColor: palette.surface, borderColor: palette.border }]}>
              <ActivityIndicator size="small" color={palette.accent} />
              <Text style={[styles.typingText, { color: palette.muted }]}>The coach is thinking…</Text>
            </View>
          ) : null}
          <ErrorText>{sendError}</ErrorText>
        </ScrollView>
        <View style={[styles.composer, { borderTopColor: palette.border, backgroundColor: palette.background }]}>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Message the coach"
            placeholderTextColor={palette.muted}
            multiline
            maxLength={MAX_MESSAGE}
            editable={!sending}
            accessibilityLabel="Message"
            testID="chat-input"
            style={[styles.input, { color: palette.text, borderColor: palette.border, backgroundColor: palette.surface }]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send"
            accessibilityState={{ disabled: !canSend, busy: sending }}
            disabled={!canSend}
            onPress={() => {
              haptic.press();
              void send();
            }}
            testID="chat-send"
            style={({ pressed }) => [styles.send, !canSend && styles.dimmed, pressed && styles.pressed]}>
            <LinearGradient colors={palette.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            {sending ? <ActivityIndicator color={palette.onAccent} /> : <Ionicons name="arrow-up" size={22} color={palette.onAccent} />}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  fill: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 20, gap: 12 },
  empty: { gap: 16, alignItems: 'center', paddingTop: 24 },
  starters: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  starter: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
  starterText: { fontSize: 15, fontWeight: '600' },
  dimmed: { opacity: 0.5 },
  pressed: { transform: [{ scale: 0.94 }] },
  bubble: { maxWidth: '84%', paddingHorizontal: 16, paddingVertical: 11, borderRadius: 22, overflow: 'hidden' },
  bubbleText: { fontSize: 16, lineHeight: 23 },
  mine: { alignSelf: 'flex-end', borderBottomRightRadius: 6 },
  theirs: { alignSelf: 'flex-start', borderWidth: StyleSheet.hairlineWidth, borderBottomLeftRadius: 6 },
  typing: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  typingText: { fontSize: 15 },
  note: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center', gap: 6, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, maxWidth: '92%' },
  noteText: { fontSize: 13, fontWeight: '600', flexShrink: 1 },
  composer: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 12, paddingVertical: 10, gap: 10, borderTopWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, minHeight: 46, maxHeight: 120, borderWidth: 1, borderRadius: 23, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, fontSize: 16 },
  send: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
