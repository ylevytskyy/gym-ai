import beginnerPlan from '../../../../examples/plans/beginner-3day-plan.json';
import { sessionOn, weekOf } from './calendar';
import type { WorkoutLogRow, WorkoutPlan } from './model';

// Days: 1 "Easy full body", 2 "Core and cardio", 3 "Legs and hips". Made 2026-11-05.
const plan = beginnerPlan as unknown as WorkoutPlan;
const log = (day_number: number, completed_at: string): WorkoutLogRow => ({ id: `l${completed_at}`, plan_id: 'p', day_number, completed_at, health_record_id: null });
// Thursday.
const now = new Date('2026-11-12T10:00:00');

describe('sessionOn', () => {
  it('shows today the day Today would show', () => {
    expect(sessionOn(plan, [log(1, '2026-11-11T09:00:00')], '2026-11-12', now)).toMatchObject({ kind: 'today', day: { day: 2 }, doneToday: false });
  });

  it('projects upcoming days one plan day per calendar day, wrapping to the first', () => {
    const logs = [log(1, '2026-11-11T09:00:00')];
    expect(sessionOn(plan, logs, '2026-11-13', now)).toMatchObject({ kind: 'upcoming', day: { day: 3 } });
    expect(sessionOn(plan, logs, '2026-11-14', now)).toMatchObject({ kind: 'upcoming', day: { day: 1 } });
    expect(sessionOn(plan, logs, '2026-11-15', now)).toMatchObject({ kind: 'upcoming', day: { day: 2 } });
  });

  it('starts upcoming days after the session already done today', () => {
    const logs = [log(2, '2026-11-12T08:00:00')];
    expect(sessionOn(plan, logs, '2026-11-12', now)).toMatchObject({ kind: 'today', day: { day: 2 }, doneToday: true });
    expect(sessionOn(plan, logs, '2026-11-13', now)).toMatchObject({ kind: 'upcoming', day: { day: 3 } });
  });

  it('shows a past date with a finished session as done, with that plan day', () => {
    const logs = [log(2, '2026-11-11T09:00:00'), log(1, '2026-11-09T19:30:00')];
    expect(sessionOn(plan, logs, '2026-11-09', now)).toMatchObject({ kind: 'done', day: { day: 1 } });
  });

  it('shows a past date without a session as a rest day', () => {
    expect(sessionOn(plan, [log(1, '2026-11-09T19:30:00')], '2026-11-10', now)).toEqual({ kind: 'rest' });
  });

  it('shows a date before the plan was stored as before the plan', () => {
    expect(sessionOn(plan, [], '2026-11-07', now, '2026-11-08T07:30:00')).toEqual({ kind: 'before_plan' });
    expect(sessionOn(plan, [], '2026-11-08', now, '2026-11-08T07:30:00')).toEqual({ kind: 'rest' });
  });

  it('does not trust the date written inside the plan, which the model writes', () => {
    // The example says 2026-11-05; without the stored date nothing counts as before the plan.
    expect(sessionOn(plan, [], '2026-11-01', now)).toEqual({ kind: 'rest' });
  });

  it('shows a past session of a day the plan no longer has as done without a day', () => {
    expect(sessionOn(plan, [log(9, '2026-11-10T09:00:00')], '2026-11-10', now)).toEqual({ kind: 'done' });
  });
});

describe('weekOf', () => {
  it('lists the seven days of the week, Monday first', () => {
    expect(weekOf('2026-11-12')).toEqual(['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15']);
    // Sunday belongs to the week that started the Monday before.
    expect(weekOf('2026-11-15')[0]).toBe('2026-11-09');
    // Across a month end.
    expect(weekOf('2026-12-01')).toEqual(['2026-11-30', '2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04', '2026-12-05', '2026-12-06']);
  });
});
