import { AssistantError, deleteAccount, sendChat } from './client';

const plan = {
  schema_version: '1.0.0',
  id: 'p',
  created_at: '2026-11-10T09:00:00Z',
  goal: 'move_more',
  notes: '',
  days: [{ day: 1, title: 'Core', minutes: 5, blocks: [{ type: 'main', items: [{ exercise_id: 'plank', sets: 1, amount: 20 }] }] }],
};
const json = (status: number, body: unknown) => jest.fn(async () => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response);

describe('sendChat', () => {
  it('posts the message with the token and returns the reply', async () => {
    const fetchFn = json(200, { reply: 'Hello', plan: null, injuries_added: [] });
    const result = await sendChat(fetchFn, 'http://a.test', 'token', 'hi', 'key-1');
    expect(result).toEqual({ reply: 'Hello', plan: null, planRemoved: false, injuriesAdded: [], usage: null });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://a.test/api/chat');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ authorization: 'Bearer token', 'content-type': 'application/json', 'idempotency-key': 'key-1' });
    expect(init.body).toBe(JSON.stringify({ message: 'hi' }));
  });

  it('returns a changed plan and added injuries', async () => {
    const result = await sendChat(json(200, { reply: 'Done', plan: { id: 'plan-2', plan }, injuries_added: ['knee_injury', 7] }), 'http://a.test', 't', 'x', 'k');
    expect(result.plan).toEqual({ id: 'plan-2', plan });
    expect(result.injuriesAdded).toEqual(['knee_injury']);
  });

  it('keeps the reply when the plan that came back cannot be read, and says the plan has to be loaded again', async () => {
    const result = await sendChat(json(200, { reply: 'Done', plan: { id: 'plan-2', plan: { nope: true } } }), 'http://a.test', 't', 'x', 'k');
    expect(result).toEqual({ reply: 'Done', plan: null, planRemoved: true, injuriesAdded: [], usage: null });
  });

  it('says when the old plan was taken away', async () => {
    const result = await sendChat(json(200, { reply: 'Noted', plan: null, plan_removed: true, injuries_added: ['knee_injury'] }), 'http://a.test', 't', 'x', 'k');
    expect(result.planRemoved).toBe(true);
  });

  it('says what happened in words fit for the user, never the server text', async () => {
    const message = async (fetchFn: jest.Mock) => sendChat(fetchFn as never, 'http://a.test', 't', 'x', 'k').catch((e: unknown) => (e instanceof AssistantError ? e.message : 'other'));
    expect(await message(json(401, { message: 'jwt expired: detail' }))).toBe('Your session has expired. Sign in again.');
    expect(await message(json(400, { message: 'detail' }))).toBe('That message could not be sent. Try a shorter one.');
    expect(await message(json(429, { error: 'TOO_MANY_REQUESTS', message: 'detail' }))).toMatch(/Wait a moment and try again/);
    expect(await message(json(500, { message: 'detail' }))).toBe('The assistant is not available right now. Try again later.');
    expect(await message(json(200, { reply: 5 }))).toBe('The answer could not be read. Try again.');
    expect(await message(jest.fn(async () => Promise.reject(new TypeError('Network request failed'))))).toBe('Could not reach the assistant. Check your connection and try again.');
  });

  it('returns the allowance the service reports', async () => {
    const usage = { tier: 'free', limit: 10, remaining: 2, resetsAt: '2026-11-12T22:00:00.000Z' };
    const result = await sendChat(json(200, { reply: 'Hi', plan: null, injuries_added: [], usage }), 'http://a.test', 't', 'x', 'k');
    expect(result.usage).toEqual(usage);
  });

  it('tells a used-up allowance apart from a busy coach, and carries when it comes back', async () => {
    const usage = { tier: 'free', limit: 10, remaining: 0, resetsAt: '2026-11-12T22:00:00.000Z' };
    const limited = await sendChat(json(429, { error: 'USAGE_LIMIT', message: 'detail', details: usage }) as never, 'http://a.test', 't', 'x', 'k').catch((e: unknown) => e);
    expect(limited).toBeInstanceOf(AssistantError);
    expect((limited as AssistantError).usage).toEqual(usage);
    expect((limited as AssistantError).message).toBe('You have used your coach messages for now.');

    const busy = await sendChat(json(429, { error: 'TOO_MANY_REQUESTS', message: 'detail' }) as never, 'http://a.test', 't', 'x', 'k').catch((e: unknown) => e);
    expect((busy as AssistantError).usage).toBeUndefined();
    expect((busy as AssistantError).message).toMatch(/still busy/);
  });

  it('explains a message that was already sent and an allowance that could not be checked', async () => {
    const message = async (fetchFn: jest.Mock) => sendChat(fetchFn as never, 'http://a.test', 't', 'x', 'k').catch((e: unknown) => (e as Error).message);
    expect(await message(json(409, { error: 'DUPLICATE_REQUEST', message: 'detail' }))).toBe('That message was already sent. Open the Coach tab again to see the answer.');
    expect(await message(json(503, { error: 'USAGE_UNAVAILABLE', message: 'detail' }))).toBe('The coach is not available right now. Try again in a few minutes.');
  });

  it('gives up after the time limit', async () => {
    jest.useFakeTimers();
    const never = jest.fn((_url: string, init: RequestInit) => new Promise((_, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted')))));
    const pending = sendChat(never as never, 'http://a.test', 't', 'x', 'k', 1000).catch((e: Error) => e.message);
    jest.advanceTimersByTime(1000);
    expect(await pending).toBe('The assistant took too long. Try again.');
    jest.useRealTimers();
  });
});

describe('deleteAccount', () => {
  it('sends DELETE with the token and resolves on 204', async () => {
    const fetchFn = json(204, null);
    await deleteAccount(fetchFn, 'http://a.test', 'token');
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://a.test/api/account');
    expect(init.method).toBe('DELETE');
    expect(init.headers).toMatchObject({ authorization: 'Bearer token' });
  });

  it('fails with a message fit for the user', async () => {
    await expect(deleteAccount(json(500, {}), 'http://a.test', 't')).rejects.toThrow('Your account could not be deleted right now. Try again later.');
    await expect(deleteAccount(json(401, {}), 'http://a.test', 't')).rejects.toThrow('Your session has expired. Sign in again.');
  });
});
