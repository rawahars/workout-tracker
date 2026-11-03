import { expect, test } from '@playwright/test';
import { finishSession, startSession } from '../src/domain';
import { seedState } from '../src/seed';
import { Session } from '../src/model';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('tab', { name: 'Today tab' })).toBeVisible();
});
test('browser back closes nested screens and does not revive completed session screens', async ({ page }) => {
  await page.getByRole('tab', { name: 'Routines tab' }).click();
  await page.getByRole('button', { name: 'View The Foundation', exact: true }).click();
  await page.getByRole('button', { name: 'View Upper body A', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Edit workout', exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('button', { name: 'View Upper body A', exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('button', { name: 'View The Foundation', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Close', exact: true })).toHaveCount(0);
  await page.getByRole('tab', { name: 'Today tab' }).click();
  await page.getByRole('button', { name: 'Start freestyle workout' }).click();
  await page.getByRole('button', { name: 'Add exercise', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search exercises' }).fill('Plank');
  await page.getByRole('button', { name: 'Select Plank', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Complete Plank set 1', exact: true }).click();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Finish workout', exact: true }).click();
  await expect(page.getByText('Work recorded', { exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('button', { name: 'Start freestyle workout' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Finish workout', exact: true })).toHaveCount(0);
});
test('counts sessions within two hours as a workout and groups recent sessions by day', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-03T12:00:00') });
  const state = seedState();
  function logged(name: string, day: string, start: string, end: string): Session {
    const active = startSession(state, state.workouts[0], day, new Date(start).getTime());
    active.active!.exercises[0]!.sets[0]!.done = true;
    return { ...finishSession(active, new Date(end).getTime()).sessions[0]!, name };
  }
  state.sessions = [
    logged('Previous day', '2026-11-02', '2026-11-02T08:00:00', '2026-11-02T09:00:00'),
    logged('Morning strength', '2026-11-03', '2026-11-03T08:00:00', '2026-11-03T09:00:00'),
    logged('Cardio finish', '2026-11-03', '2026-11-03T11:00:00', '2026-11-03T11:30:00'),
  ];
  await page.getByRole('button', { name: 'Open settings', exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Restore backup', exact: true }).click();
  await (await chooser).setFiles({ name: 'visits.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ app: 'FORM', version: 1, createdAt: new Date().toISOString(), state, images: {} })) });
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Replace with this backup', exact: true }).click();
  const statistic = page.getByText('Workouts this week', { exact: true }).locator('..');
  await expect(statistic.getByText('2', { exact: true })).toBeVisible();
  await expect(page.getByTestId('recent-day-2026-11-03').getByRole('button')).toHaveCount(2);
  await expect(page.getByTestId('recent-day-2026-11-02').getByRole('button')).toHaveCount(1);
});
test('charts daily training minutes while preserving primary-muscle set totals', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-03T12:00:00') });
  await page.getByRole('tab', { name: 'Progress tab' }).click();
  const chart = page.getByTestId('weekly-training-time');
  await expect(chart.getByText('Minutes', { exact: true })).toBeVisible();
  await expect(chart.getByText('0', { exact: true })).toHaveCount(7);
  const state = seedState();
  function logged(day: string, start: string, duration: number): Session {
    const active = startSession(state, state.workouts[0], day, new Date(start).getTime());
    active.active!.exercises[0]!.sets[0]!.done = true;
    return finishSession(active, active.active!.startedAt + duration * 1000).sessions[0]!;
  }
  state.sessions = [
    logged('2026-10-27', '2026-10-27T08:00:00', 80 * 60),
    logged('2026-11-02', '2026-11-02T08:00:00', 20 * 60 + 30),
    logged('2026-11-02', '2026-11-02T11:00:00', 24 * 60 + 30),
    logged('2026-11-03', '2026-11-03T08:00:00', 75 * 60),
  ];
  await page.getByRole('button', { name: 'Open settings', exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Restore backup', exact: true }).click();
  await (await chooser).setFiles({ name: 'training-time.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ app: 'FORM', version: 1, createdAt: new Date().toISOString(), state, images: {} })) });
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Replace with this backup', exact: true }).click();
  await page.getByRole('tab', { name: 'Progress tab' }).click();
  await expect(chart.getByText('45', { exact: true })).toBeVisible();
  await expect(chart.getByText('75', { exact: true })).toBeVisible();
  await expect(chart.getByText('0', { exact: true })).toHaveCount(5);
  await expect(chart.getByText('Sets', { exact: true })).toHaveCount(0);
  const muscleChart = page.getByText('This week · primary-muscle sets', { exact: true }).locator('..');
  await expect(muscleChart.getByText(state.sessions[0]!.exercises[0]!.muscle, { exact: true })).toBeVisible();
  await expect(muscleChart.getByText('3', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole('tab', { name: 'Progress tab' }).click();
  await expect(chart.getByText('45', { exact: true })).toBeVisible();
  await expect(chart.getByText('75', { exact: true })).toBeVisible();
});
test('marks the scheduled workout finished only after its matching session is saved', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-03T12:00:00') });
  const state = seedState();
  const program = state.programs.find(p => p.id === state.settings.programId)!;
  const workoutId = program.slots.find(slot => slot.day === 2)!.workoutId;
  const workout = state.workouts.find(w => w.id === workoutId)!;
  function logged(id: string, day: string, start: string): Session {
    const active = startSession(state, state.workouts.find(w => w.id === id), day, new Date(start).getTime());
    active.active!.exercises[0]!.sets[0]!.done = true;
    return finishSession(active, active.active!.startedAt + 30 * 60000).sessions[0]!;
  }
  state.sessions = [
    logged(workout.id, '2026-11-02', '2026-11-02T08:00:00'),
    logged(state.workouts.find(w => w.id !== workout.id)!.id, '2026-11-03', '2026-11-03T08:00:00'),
  ];
  await page.getByRole('button', { name: 'Open settings', exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Restore backup', exact: true }).click();
  await (await chooser).setFiles({ name: 'scheduled-completion.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ app: 'FORM', version: 1, createdAt: new Date().toISOString(), state, images: {} })) });
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Replace with this backup', exact: true }).click();
  await expect(page.getByRole('button', { name: "View today's workout", exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: "Start today's workout", exact: true }).click();
  const firstSet = page.getByRole('checkbox').first();
  await firstSet.click();
  await expect(firstSet).toBeChecked();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Finish workout', exact: true }).click();
  await expect(page.getByText('Work recorded', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).last().click();
  await expect(page.getByText('Finished today', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: "Start today's workout", exact: true })).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: "View today's workout", exact: true }).click();
  await expect(page.getByText('Training log', { exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Session name', exact: true })).toHaveValue(workout.name);
  await expect(page.getByRole('button', { name: 'Finish workout', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Close', exact: true }).last().click();
  await page.clock.setSystemTime(new Date('2026-11-10T12:00:00'));
  await page.getByRole('tab', { name: 'Routines tab' }).click();
  await page.getByRole('tab', { name: 'Today tab' }).click();
  await expect(page.getByRole('button', { name: "Start today's workout", exact: true })).toBeVisible();
  await expect(page.getByText('Finished today', { exact: true })).toHaveCount(0);
});
test('countdown pauses, rings once, and survives reload without losing the session', async ({ page }) => {
  await page.addInitScript(() => {
    const probe = window as unknown as { __timerBeeps: number };
    probe.__timerBeeps = 0;
    class FixtureAudioContext {
      state = 'suspended';
      currentTime = 0;
      destination = {};
      resume() { this.state = 'running'; return Promise.resolve(); }
      createGain() {
        return { gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} };
      }
      createOscillator() {
        return {
          frequency: { value: 0 }, type: 'sine', onended: null as (() => void) | null,
          connect() {}, disconnect() {},
          start() { if (this.frequency.value > 0) probe.__timerBeeps++; },
          stop() { this.onended?.(); },
        };
      }
    }
    Object.defineProperty(window, 'AudioContext', { value: FixtureAudioContext, configurable: true });
  });
  await page.reload();
  await page.getByRole('button', { name: 'Start freestyle workout' }).click();
  await page.getByRole('button', { name: 'Open workout timer', exact: true }).click();
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 60000));
  await page.getByRole('textbox', { name: 'Minutes', exact: true }).fill('0');
  await page.getByRole('textbox', { name: 'Seconds', exact: true }).fill('3');
  await page.getByRole('button', { name: 'Start countdown', exact: true }).click();
  await page.clock.fastForward(1000);
  await page.getByRole('button', { name: 'Pause countdown', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Resume countdown', exact: true })).toBeVisible();
  const display = page.getByTestId('countdown-display');
  const paused = (await display.textContent())!;
  await page.clock.fastForward(5000);
  await expect(display).toHaveText(paused);
  await page.getByRole('button', { name: 'Resume countdown', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause countdown', exact: true })).toBeVisible();
  await page.clock.resume();
  await expect(display.getByText('Time is up', { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __timerBeeps: number }).__timerBeeps)).toBe(3);
  await page.clock.fastForward(5000);
  expect(await page.evaluate(() => (window as unknown as { __timerBeeps: number }).__timerBeeps)).toBe(3);
  await page.getByRole('textbox', { name: 'Seconds', exact: true }).fill('30');
  await page.getByRole('button', { name: 'Start new countdown', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Pause countdown', exact: true })).toBeVisible();
  await page.clock.resume();
  await page.reload();
  await page.getByRole('button', { name: 'Resume workout', exact: true }).click();
  await expect(page.getByTestId('countdown-banner')).toBeVisible();
  await page.getByRole('button', { name: 'Enable alarm sound', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Enable alarm sound', exact: true })).toHaveCount(0);
});
