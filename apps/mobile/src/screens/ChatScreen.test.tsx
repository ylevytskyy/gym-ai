import { act, fireEvent, screen, userEvent, waitFor } from '@testing-library/react-native';

import { useState } from 'react';

import { createHarness, type HarnessOptions } from '@/testing/harness';

import { ChatScreen } from './ChatScreen';
import { TodayScreen } from './TodayScreen';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));

const plan = (title: string) => ({
  schema_version: '1.0.0',
  id: 'plan-json-id',
  created_at: '2026-11-10T09:00:00Z',
  goal: 'move_more',
  notes: '',
  days: [{ day: 1, title, minutes: 5, blocks: [{ type: 'main', items: [{ exercise_id: 'plank', sets: 1, amount: 20 }] }] }],
});
const profile = { id: 'user-1', age_range: '25-34' as const, weight_kg: 72, goal: 'move_more' as const, fitness_level: 1 as const, injuries: [], minutes_per_day: 15, language: 'en' };
const answer = (body: unknown, status = 200) => jest.fn(async () => ({ ok: status < 300, status, json: async () => body }));
const base: HarnessOptions = { profile, rows: { plans: { id: 'plan-1', plan_json: plan('Quick legs') }, workout_logs: [] } };

beforeEach(() => {
  jest.useFakeTimers({ now: new Date('2026-11-12T10:00:00'), doNotFake: ['nextTick', 'setImmediate'] });
});
afterEach(() => {
  jest.useRealTimers();
});
const user = () => userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

describe('ChatScreen', () => {
  it('shows the earlier conversation, oldest first', async () => {
    const harness = createHarness({
      ...base,
      rows: { ...base.rows, messages: [{ id: 'm1', role: 'user', content: 'Hello coach' }, { id: 'm2', role: 'assistant', content: 'Hello! Ready?' }] },
    });
    await harness.renderScreen(<ChatScreen />);
    expect(await screen.findByText('Hello coach')).toBeTruthy();
    const bubbles = screen.getAllByTestId(/^message-/).map((node) => node.props.testID);
    expect(bubbles).toEqual(['message-user', 'message-assistant']);
  });

  it('invites a first message when there is no conversation yet', async () => {
    const harness = createHarness(base);
    await harness.renderScreen(<ChatScreen />);
    expect(await screen.findByTestId('chat-empty')).toBeTruthy();
  });

  it('sends the message with the token, shows it at once and then the reply', async () => {
    const fetch = answer({ reply: 'Keep it up!', plan: null, injuries_added: [] });
    const harness = createHarness({ ...base, fetch });
    await harness.renderScreen(<ChatScreen />);
    await screen.findByTestId('chat-empty');

    await user().type(screen.getByTestId('chat-input'), 'How am I doing?');
    await user().press(screen.getByTestId('chat-send'));

    expect(await screen.findByText('Keep it up!')).toBeTruthy();
    expect(screen.getByText('How am I doing?')).toBeTruthy();
    expect(screen.getByTestId('chat-input').props.value).toBe('');
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://assistant.test/api/chat');
    expect(init.headers).toMatchObject({ authorization: 'Bearer token' });
    expect(JSON.parse(init.body as string)).toEqual({ message: 'How am I doing?' });
  });

  it('shows the message at once, while the coach is still answering', async () => {
    let finish: (value: unknown) => void = () => undefined;
    const fetch = jest.fn(() => new Promise((resolve) => (finish = resolve)));
    const harness = createHarness({ ...base, fetch });
    await harness.renderScreen(<ChatScreen />);
    await screen.findByTestId('chat-empty');

    await user().type(screen.getByTestId('chat-input'), 'How am I doing?');
    await user().press(screen.getByTestId('chat-send'));

    expect(await screen.findByTestId('message-user')).toBeTruthy();
    expect(screen.getByText('The coach is thinking…')).toBeTruthy();
    expect(screen.queryByTestId('message-assistant')).toBeNull();

    finish({ ok: true, status: 200, json: async () => ({ reply: 'Fine!', plan: null, injuries_added: [] }) });
    expect(await screen.findByText('Fine!')).toBeTruthy();
    expect(screen.getAllByTestId('message-user')).toHaveLength(1);
  });

  it('says that the plan has to be made again when the old one was taken away, and Today offers it', async () => {
    const fetch = answer({ reply: 'Noted. Create a new plan on the Today tab.', plan: null, plan_removed: true, injuries_added: ['knee_injury'] });
    const harness = createHarness({ ...base, fetch });
    await harness.renderScreen(<ChatScreen />);
    await screen.findByTestId('chat-empty');
    await user().type(screen.getByTestId('chat-input'), 'My knee hurts');
    await user().press(screen.getByTestId('chat-send'));
    expect(await screen.findByText('Your plan needs to be made again. See the Today tab.')).toBeTruthy();
    // The plan was asked for again from the server (once at the start, once now).
    await waitFor(() => expect((harness.services.supabase.from as jest.Mock).mock.calls.filter(([table]) => table === 'plans').length).toBe(2));
  });

  it('loads the plan again after a failed send: the service may have finished without the app', async () => {
    const harness = createHarness({ ...base, fetch: answer({}, 500) });
    await harness.renderScreen(<ChatScreen />);
    await screen.findByTestId('chat-empty');
    await user().type(screen.getByTestId('chat-input'), 'Make it easier');
    await user().press(screen.getByTestId('chat-send'));
    await screen.findByText('The assistant is not available right now. Try again later.');
    await waitFor(() => expect((harness.services.supabase.from as jest.Mock).mock.calls.filter(([table]) => table === 'plans').length).toBe(2));
  });

  it('loads the conversation again when the tab is opened again', async () => {
    const harness = createHarness({ ...base, rows: { ...base.rows, messages: [{ id: 'm1', role: 'user', content: 'Hello coach' }] } });
    let visitAgain: () => void = () => undefined;
    function Tab() {
      const [visit, setVisit] = useState(1);
      visitAgain = () => setVisit((n) => n + 1);
      return <ChatScreen refreshKey={visit} />;
    }
    await harness.renderScreen(<Tab />);
    expect(await screen.findByText('Hello coach')).toBeTruthy();
    harness.deleted.push('assistant_messages'); // cleared on the privacy screen
    await act(async () => visitAgain());
    await waitFor(() => expect(screen.queryByText('Hello coach')).toBeNull());
  });

  it('does not send an empty message', async () => {
    const fetch = answer({ reply: 'x' });
    const harness = createHarness({ ...base, fetch });
    await harness.renderScreen(<ChatScreen />);
    await screen.findByTestId('chat-empty');
    await user().type(screen.getByTestId('chat-input'), '   ');
    await user().press(screen.getByTestId('chat-send'));
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps the typed text and says what to do when sending fails', async () => {
    const harness = createHarness({ ...base, fetch: answer({ message: 'internal detail' }, 500) });
    await harness.renderScreen(<ChatScreen />);
    await screen.findByTestId('chat-empty');

    await user().type(screen.getByTestId('chat-input'), 'Make it easier');
    await user().press(screen.getByTestId('chat-send'));

    expect(await screen.findByText('The assistant is not available right now. Try again later.')).toBeTruthy();
    expect(screen.getByTestId('chat-input').props.value).toBe('Make it easier');
    expect(screen.queryByTestId('message-user')).toBeNull();
    expect(screen.queryByText(/internal detail/)).toBeNull();
  });

  it('says that the plan changed, and Today shows the new plan', async () => {
    const fetch = answer({ reply: 'Done, it is lighter now.', plan: { id: 'plan-2', plan: plan('Gentle core') }, injuries_added: [] });
    const harness = createHarness({ ...base, fetch });
    await harness.renderScreen(
      <>
        <TodayScreen />
        <ChatScreen />
      </>,
    );
    expect(await screen.findByText('Quick legs')).toBeTruthy();

    await user().type(screen.getByTestId('chat-input'), 'Make it easier');
    await user().press(screen.getByTestId('chat-send'));

    expect(await screen.findByTestId('chat-plan-changed')).toBeTruthy();
    expect(await screen.findByText('Gentle core')).toBeTruthy();
    expect(screen.queryByText('Quick legs')).toBeNull();
  });

  it('says that an injury was added to the profile', async () => {
    const harness = createHarness({ ...base, fetch: answer({ reply: 'Noted.', plan: null, injuries_added: ['knee_injury'] }) });
    await harness.renderScreen(<ChatScreen />);
    await screen.findByTestId('chat-empty');
    await user().type(screen.getByTestId('chat-input'), 'My knee hurts');
    await user().press(screen.getByTestId('chat-send'));
    expect(await screen.findByText(/Added to your profile: knee injury/)).toBeTruthy();
  });

  it('sends one message for two quick presses', async () => {
    const fetch = answer({ reply: 'ok', plan: null, injuries_added: [] });
    const harness = createHarness({ ...base, fetch });
    await harness.renderScreen(<ChatScreen />);
    await screen.findByTestId('chat-empty');
    await user().type(screen.getByTestId('chat-input'), 'hi');
    const send = screen.getByTestId('chat-send');
    fireEvent.press(send);
    fireEvent.press(send);
    await waitFor(() => expect(screen.getByText('ok')).toBeTruthy());
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
