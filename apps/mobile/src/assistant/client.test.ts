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
    const result = await sendChat(fetchFn, 'http://a.test', 'token', 'hi');
    expect(result).toEqual({ reply: 'Hello', plan: null, planRemoved: false, injuriesAdded: [] });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://a.test/api/chat');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ authorization: 'Bearer token', 'content-type': 'application/json' });
    expect(init.body).toBe(JSON.stringify({ message: 'hi' }));
  });

  it('returns a changed plan and added injuries', async () => {
    const result = await sendChat(json(200, { reply: 'Done', plan: { id: 'plan-2', plan }, injuries_added: ['knee_injury', 7] }), 'http://a.test', 't', 'x');
    expect(result.plan).toEqual({ id: 'plan-2', plan });
    expect(result.injuriesAdded).toEqual(['knee_injury']);
  });

  it('keeps the reply when the plan that came back cannot be read, and says the plan has to be loaded again', async () => {
    const result = await sendChat(json(200, { reply: 'Done', plan: { id: 'plan-2', plan: { nope: true } } }), 'http://a.test', 't', 'x');
    expect(result).toEqual({ reply: 'Done', plan: null, planRemoved: true, injuriesAdded: [] });
  });

  it('says when the old plan was taken away', async () => {
    const result = await sendChat(json(200, { reply: 'Noted', plan: null, plan_removed: true, injuries_added: ['knee_injury'] }), 'http://a.test', 't', 'x');
    expect(result.planRemoved).toBe(true);
  });

  it('says what happened in words fit for the user, never the server text', async () => {
    const message = async (fetchFn: jest.Mock) => sendChat(fetchFn as never, 'http://a.test', 't', 'x').catch((e: unknown) => (e instanceof AssistantError ? e.message : 'other'));
    expect(await message(json(401, { message: 'jwt expired: detail' }))).toBe('Your session has expired. Sign in again.');
    expect(await message(json(400, { message: 'detail' }))).toBe('That message could not be sent. Try a shorter one.');
    expect(await message(json(429, { message: 'detail' }))).toMatch(/Wait a moment and try again/);
    expect(await message(json(500, { message: 'detail' }))).toBe('The assistant is not available right now. Try again later.');
    expect(await message(json(200, { reply: 5 }))).toBe('The answer could not be read. Try again.');
    expect(await message(jest.fn(async () => Promise.reject(new TypeError('Network request failed'))))).toBe('Could not reach the assistant. Check your connection and try again.');
  });

  it('gives up after the time limit', async () => {
    jest.useFakeTimers();
    const never = jest.fn((_url: string, init: RequestInit) => new Promise((_, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted')))));
    const pending = sendChat(never as never, 'http://a.test', 't', 'x', 1000).catch((e: Error) => e.message);
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
