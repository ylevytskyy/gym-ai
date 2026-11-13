import beginnerPlan from '../../../../examples/plans/beginner-3day-plan.json';
import { loadActivePlan, loadPlanLogs, PlanError, requestPlan, type PlanClient } from './repository';

function fakeClient(response: { data?: unknown; error?: unknown }) {
  const calls: { method: string; args: unknown[] }[] = [];
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'order', 'limit']) {
    builder[method] = (...args: unknown[]) => (calls.push({ method, args }), builder);
  }
  builder['maybeSingle'] = async () => response;
  builder['then'] = (resolve: (v: unknown) => unknown) => Promise.resolve(response).then(resolve);
  return { client: { from: (table: string) => (calls.push({ method: 'from', args: [table] }), builder) } as unknown as PlanClient, calls };
}

describe('loadActivePlan', () => {
  it('reads the newest active plan of that user', async () => {
    const { client, calls } = fakeClient({ data: { id: 'plan-1', plan_json: beginnerPlan }, error: null });
    expect(await loadActivePlan(client, 'user-1')).toEqual({ id: 'plan-1', plan: beginnerPlan });
    expect(calls).toContainEqual({ method: 'eq', args: ['user_id', 'user-1'] });
    expect(calls).toContainEqual({ method: 'eq', args: ['status', 'active'] });
    expect(calls).toContainEqual({ method: 'order', args: ['created_at', { ascending: false }] });
  });

  it('is null without a plan, and fails clearly for an unreadable plan or a failed read', async () => {
    expect(await loadActivePlan(fakeClient({ data: null, error: null }).client, 'user-1')).toBeNull();
    await expect(loadActivePlan(fakeClient({ data: { id: 'p', plan_json: { days: [] } }, error: null }).client, 'user-1')).rejects.toThrow('could not be read');
    await expect(loadActivePlan(fakeClient({ data: null, error: { message: 'x' } }).client, 'user-1')).rejects.toBeInstanceOf(PlanError);
  });
});

describe('loadPlanLogs', () => {
  it('reads that user logs for that plan, newest first', async () => {
    const rows = [{ id: 'l1', plan_id: 'plan-1', day_number: 1, completed_at: '2026-11-11T07:00:00Z', health_record_id: null }];
    const { client, calls } = fakeClient({ data: rows, error: null });
    expect(await loadPlanLogs(client, 'user-1', 'plan-1')).toEqual(rows);
    expect(calls).toContainEqual({ method: 'eq', args: ['user_id', 'user-1'] });
    expect(calls).toContainEqual({ method: 'eq', args: ['plan_id', 'plan-1'] });
  });
});

describe('requestPlan', () => {
  const ok = (body: unknown, status = 201) => jest.fn(async () => ({ ok: status < 400, status, json: async () => body }) as Response);

  it('posts the request with the user token and returns the stored plan', async () => {
    const fetchFn = ok({ id: 'plan-9', plan: beginnerPlan });
    const stored = await requestPlan(fetchFn as unknown as typeof fetch, 'http://assistant', 'jwt-token', { duration_days: 3, focus_areas: [] });

    expect(stored).toEqual({ id: 'plan-9', plan: beginnerPlan });
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://assistant/api/plans/generate');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ authorization: 'Bearer jwt-token', 'content-type': 'application/json' });
    expect(JSON.parse(init.body as string)).toEqual({ duration_days: 3, focus_areas: [] });
  });

  it.each([
    [401, 'Your session has expired. Sign in again.'],
    [400, 'A plan could not be made this time. Try again.'],
    [500, 'The plan service is not available right now. Try again later.'],
    [504, 'The plan service is not available right now. Try again later.'],
  ])('explains a %s without repeating server text', async (status, message) => {
    const fetchFn = ok({ error: 'X', message: 'internal detail: model deepseek failed' }, status);
    await expect(requestPlan(fetchFn as unknown as typeof fetch, 'http://a', 't', { duration_days: 3, focus_areas: [] })).rejects.toThrow(message);
  });

  it('rejects a response that is not a usable plan', async () => {
    for (const body of [null, { id: 'p' }, { id: 5, plan: beginnerPlan }, { id: 'p', plan: { days: [] } }]) {
      await expect(requestPlan(ok(body) as unknown as typeof fetch, 'http://a', 't', { duration_days: 3, focus_areas: [] })).rejects.toThrow('could not be read');
    }
  });

  it('explains a lost connection and a timeout', async () => {
    const offline = jest.fn(async () => { throw new TypeError('Network request failed'); });
    await expect(requestPlan(offline as unknown as typeof fetch, 'http://a', 't', { duration_days: 3, focus_areas: [] })).rejects.toThrow('Could not reach the plan service');

    const hangs = jest.fn((_url: string, init: RequestInit) => new Promise<Response>((_, reject) => init.signal!.addEventListener('abort', () => reject(new Error('aborted')))));
    await expect(requestPlan(hangs as unknown as typeof fetch, 'http://a', 't', { duration_days: 3, focus_areas: [] }, 20)).rejects.toThrow('took too long');
  });
});
