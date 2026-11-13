import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AssistantError, sendChat } from '@/assistant/client';
import { useAuth } from '@/auth/AuthProvider';
import { loadMessages, type ChatMessage } from '@/chat/repository';
import { usePlan } from '@/plan/PlanProvider';
import { useProfile } from '@/profile/ProfileProvider';
import { useServices } from '@/services';
import { Body, Button, ErrorText, Title, usePalette } from '@/ui/kit';

const MAX_MESSAGE = 1000;

/** A line the app adds to the conversation itself, to say what changed. */
type Note = { id: string; kind: 'plan' | 'injuries'; text: string };
type Entry = { type: 'message'; message: ChatMessage } | { type: 'note'; note: Note };

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

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: palette.background }]} edges={['top', 'left', 'right']} testID="chat">
      {/* Found on the emulator: without this on Android too, the keyboard covers the message field and Send. */}
      <KeyboardAvoidingView style={styles.fill} behavior="padding">
        <ScrollView
          ref={scroll}
          style={styles.fill}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}>
          <Title>Coach</Title>
          {entries === null ? <Body muted>Loading your conversation…</Body> : null}
          <ErrorText>{loadError}</ErrorText>
          {entries !== null && entries.length === 0 && !loadError ? (
            <View testID="chat-empty" style={styles.empty}>
              <Body muted>
                Ask about your plan, or tell the coach what you need: “make it easier”, “I only have ten minutes”, “my knee hurts”.
              </Body>
              <Body muted>The coach is an AI. It can change your plan, but it is not a doctor and gives no medical advice.</Body>
            </View>
          ) : null}
          {(entries ?? []).map((entry) =>
            entry.type === 'note' ? (
              <Text key={entry.note.id} style={[styles.note, { color: palette.muted }]} testID={entry.note.kind === 'plan' ? 'chat-plan-changed' : 'chat-injuries-added'}>
                {entry.note.text}
              </Text>
            ) : (
              <View
                key={entry.message.id}
                testID={`message-${entry.message.role}`}
                style={[
                  styles.bubble,
                  entry.message.role === 'user'
                    ? [styles.mine, { backgroundColor: palette.accent }]
                    : [styles.theirs, { backgroundColor: palette.surface, borderColor: palette.border }],
                ]}>
                <Text style={{ color: entry.message.role === 'user' ? palette.onAccent : palette.text, fontSize: 16, lineHeight: 22 }}>{entry.message.content}</Text>
              </View>
            ),
          )}
          {pending !== undefined ? (
            <View testID="message-user" style={[styles.bubble, styles.mine, styles.dimmed, { backgroundColor: palette.accent }]}>
              <Text style={{ color: palette.onAccent, fontSize: 16, lineHeight: 22 }}>{pending}</Text>
            </View>
          ) : null}
          {sending ? <Body muted>The coach is thinking…</Body> : null}
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
          <Button label="Send" busy={sending} disabled={text.trim() === ''} onPress={() => void send()} testID="chat-send" />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  fill: { flex: 1 },
  content: { padding: 20, gap: 12 },
  empty: { gap: 12 },
  dimmed: { opacity: 0.6 },
  bubble: { maxWidth: '85%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16 },
  mine: { alignSelf: 'flex-end' },
  theirs: { alignSelf: 'flex-start', borderWidth: 1 },
  note: { alignSelf: 'center', fontSize: 13, textAlign: 'center' },
  composer: { padding: 12, gap: 8, borderTopWidth: StyleSheet.hairlineWidth },
  input: { minHeight: 44, maxHeight: 120, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
});
