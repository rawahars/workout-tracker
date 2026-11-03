import { expect, test } from '@playwright/test';
import { seedState } from '../src/seed';
import { defaultTutorials } from '../src/default-tutorials';
import { ACTIVITY_SCOPE, HEART_SCOPE } from '../src/health-contract';
import { finishSession, startSession } from '../src/domain';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('tab', { name: 'Today tab' })).toBeVisible();
});
test('logs a freestyle workout, survives reload and appears in the calendar and progress', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.getByRole('button', { name: 'Start freestyle workout' }).click();
  await page.getByRole('button', { name: 'Add exercise', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search exercises' }).fill('Flat dumbbell');
  await page.getByRole('button', { name: 'Select Flat dumbbell chest press' }).click();
  await expect(page.getByText(/load.volume|volume kg|kg volume/i)).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Flat dumbbell chest press set 1 kg', exact: true }).fill('12.5');
  await page.getByRole('textbox', { name: 'Flat dumbbell chest press set 1 reps', exact: true }).fill('10');
  await page.getByRole('checkbox', { name: 'Complete Flat dumbbell chest press set 1', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Complete Flat dumbbell chest press set 1', exact: true })).toBeChecked();
  await page.reload();
  await page.getByRole('button', { name: 'Resume workout', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Complete Flat dumbbell chest press set 1', exact: true })).toBeChecked();
  await expect(page.getByRole('textbox', { name: 'Flat dumbbell chest press set 1 kg', exact: true })).toHaveValue('12.5');
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Finish workout', exact: true }).click();
  await expect(page.getByText('Work recorded', { exact: true })).toBeVisible();
  await expect(page.getByText(/load.volume|volume kg|kg volume/i)).toHaveCount(0);
  await page.getByRole('button', { name: 'Save as workout template' }).click();
  await page.getByRole('button', { name: 'Close', exact: true }).last().click();
  await page.getByRole('tab', { name: 'Calendar tab' }).click();
  await expect(page.getByRole('button', { name: /View Freestyle workout/ })).toBeVisible();
  await page.getByRole('tab', { name: 'Progress tab' }).click();
  await expect(page.getByText('12.5 kg', { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/load.volume|volume kg|kg volume/i)).toHaveCount(0);
  expect(errors).toEqual([]);
});
test('reopens and logs offline after the app shell is installed', async ({ page, context }) => {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise<void>(resolve => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }));
  });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Today tab' })).toBeVisible();
  await page.getByRole('button', { name: 'Start freestyle workout' }).click();
  await page.getByRole('button', { name: 'Add exercise', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search exercises' }).fill('Plank');
  await page.getByRole('button', { name: 'Select Plank', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Complete Plank set 1', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Complete Plank set 1', exact: true })).toBeChecked();
  await page.reload();
  await page.getByRole('button', { name: 'Resume workout', exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Complete Plank set 1', exact: true })).toBeChecked();
});
test('caches a non-redirected root document on canonical HTML hosts', async ({ page, request }) => {
  const redirect = await request.get('/index.html', { maxRedirects: 0 });
  expect([301, 302, 307, 308]).toContain(redirect.status());
  expect(redirect.headers().location).toBe('/');
  const cached = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    for (const name of await caches.keys()) {
      if (!name.startsWith('form-shell-')) continue;
      const response = await (await caches.open(name)).match(registration.scope);
      if (response) return { status: response.status, redirected: response.redirected };
    }
    return null;
  });
  expect(cached).toEqual({ status: 200, redirected: false });
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Today tab' })).toBeVisible();
});
test('never serves the cached app shell for API navigations', async ({ page }) => {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise<void>(resolve => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }));
  });
  const response = await page.goto('/api/health/status');
  expect([200, 404]).toContain(response!.status());
  const body = await response!.text();
  expect(body).not.toContain('id="root"');
  if (response!.status() === 200) {
    expect(response!.headers()['content-type']).toContain('application/json');
    expect(JSON.parse(body)).toHaveProperty('connected', false);
  }
});
test('keeps logging controls inside the iPhone viewport', async ({ page }) => {
  await page.getByRole('button', { name: 'Start freestyle workout' }).click();
  await page.getByRole('button', { name: 'Add exercise', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search exercises' }).fill('Flat dumbbell');
  await page.getByRole('button', { name: 'Select Flat dumbbell chest press' }).click();
  const field = page.getByRole('textbox', { name: 'Flat dumbbell chest press set 1 reps', exact: true });
  const check = page.getByRole('checkbox', { name: 'Complete Flat dumbbell chest press set 1', exact: true });
  for (const locator of [field, check]) {
    const box = await locator.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  }
});
test.describe('Google Health', () => {
  test.use({ serviceWorkers: 'block' });
  test('shows server setup without asking for secrets in the browser', async ({ page }) => {
    await page.route('**/api/health/status', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      configured: false, connected: false, scopes: [], redirectUri: 'https://form.example/api/health/callback',
      missingConfiguration: ['GOOGLE_HEALTH_CLIENT_ID', 'GOOGLE_HEALTH_CLIENT_SECRET', 'HEALTH_COOKIE_KEY'],
    }) }));
    await page.getByRole('button', { name: 'Open settings', exact: true }).click();
    await page.getByRole('button', { name: 'Open Google Health', exact: true }).click();
    await expect(page.getByText('One-time server setup', { exact: true })).toBeVisible();
    await expect(page.getByText('HEALTH_COOKIE_KEY', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Authorized OAuth redirect URI')).toHaveValue('https://form.example/api/health/callback');
    await expect(page.getByRole('button', { name: 'Connect Google Health', exact: true })).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: 'GOOGLE_HEALTH_CLIENT_SECRET' })).toHaveCount(0);
  });
  test('imports only the chosen workout metrics and preserves the existing session', async ({ page }) => {
    const initial = seedState();
    const active = startSession(initial, initial.workouts[0], undefined, Date.now() - 3600000);
    active.active!.exercises[0]!.sets[0]!.done = true;
    const state = finishSession(active);
    const session = state.sessions[0]!;
    session.notes = 'Synthetic session notes';
    session.metrics = { source: 'manual', averageHeartRate: 95, maxHeartRate: 120, steps: 42 };
    const backup = { app: 'FORM', version: 1, createdAt: new Date().toISOString(), state, images: {} };
    await page.getByRole('button', { name: 'Open settings', exact: true }).click();
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Restore backup', exact: true }).click();
    await (await chooser).setFiles({ name: 'session.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Replace with this backup', exact: true }).click();
    await expect(page.getByRole('tab', { name: 'Calendar tab' })).toBeVisible();
    const startTime = `${session.day}T08:00:00Z`, endTime = `${session.day}T09:00:00Z`;
    const workout = { id: 'synthetic-workout', name: 'Recorded strength workout', type: 'WEIGHT_TRAINING', startTime, endTime, activeSeconds: 3300, device: 'Versa 4' };
    await page.route('**/api/health/status', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      configured: true, connected: true, scopes: [ACTIVITY_SCOPE, HEART_SCOPE], redirectUri: 'https://form.example/api/health/callback', missingConfiguration: [],
    }) }));
    let queriedDay: string | undefined;
    await page.route('**/api/health/overview', route => {
      queriedDay = route.request().postDataJSON().day;
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ summary: { steps: 6500, averageHeartRate: 78, maxHeartRate: 150, warnings: [] }, workouts: [workout], truncated: false }) });
    });
    await page.route('**/api/health/workout', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      workout, metrics: { source: 'google-health', averageHeartRate: 132, maxHeartRate: 176, steps: 850, providerWorkoutId: workout.id, providerStartTime: startTime, providerEndTime: endTime, syncedAt: Date.now() }, warnings: [],
    }) }));
    await page.getByRole('tab', { name: 'Calendar tab' }).click();
    await page.getByRole('button', { name: new RegExp(`View ${session.name}`) }).click();
    await page.getByRole('button', { name: 'Session details & metrics', exact: true }).click();
    await page.getByRole('button', { name: 'Import Google Health metrics', exact: true }).click();
    await page.getByRole('button', { name: 'Load wearable data', exact: true }).click();
    await expect(page.getByText(workout.name, { exact: true })).toBeVisible();
    expect(queriedDay).toBe(session.day);
    await page.getByRole('button', { name: 'View workout metrics', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Attach these metrics to session', exact: true })).toBeEnabled();
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Attach these metrics to session', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Average heart rate (bpm)', exact: true })).toHaveValue('132');
    await page.getByRole('button', { name: 'Save details', exact: true }).click();
    await page.getByRole('button', { name: 'View session summary', exact: true }).click();
    await expect(page.getByText('Watch metrics · Google Health', { exact: true })).toBeVisible();
    await expect(page.getByText('850', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Close', exact: true }).last().click();
    await page.getByRole('button', { name: 'Close', exact: true }).last().click();
    await page.getByRole('button', { name: 'Open settings', exact: true }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export backup', exact: true }).click();
    const stream = await (await download).createReadStream();
    const buffers: Buffer[] = [];
    for await (const chunk of stream!) buffers.push(chunk);
    const saved = JSON.parse(Buffer.concat(buffers).toString('utf8')).state.sessions[0];
    expect(saved.notes).toBe(session.notes);
    expect(saved.duration).toBe(session.duration);
    expect(saved.exercises).toEqual(session.exercises);
    expect(saved.metrics.source).toBe('google-health');
    expect(saved.metrics.steps).toBe(850);
    expect(saved.metrics.providerWorkoutId).toBe(workout.id);
  });
  test('keeps partial permissions usable and requests reconnection when access expires', async ({ page }) => {
    await page.route('**/api/health/status', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({
      configured: true, connected: true, scopes: [HEART_SCOPE], redirectUri: 'https://form.example/api/health/callback', missingConfiguration: [],
    }) }));
    let expired = false;
    await page.route('**/api/health/overview', route => route.fulfill({
      status: expired ? 401 : 200, contentType: 'application/json',
      body: JSON.stringify(expired ? { error: { code: 'reconnect_required', message: 'Your Google connection expired. Connect again.' } } : { summary: { averageHeartRate: 66, maxHeartRate: 100, warnings: ['Activity permission was not granted.'] }, workouts: [], truncated: false }),
    }));
    await page.getByRole('tab', { name: 'Progress tab' }).click();
    await page.getByRole('button', { name: 'Google Health wearable data', exact: true }).click();
    await page.getByRole('button', { name: 'Load wearable data', exact: true }).click();
    await expect(page.getByText('Activity permission was not granted.', { exact: true })).toBeVisible();
    await expect(page.getByText('66', { exact: true })).toBeVisible();
    expired = true;
    await page.getByRole('button', { name: 'Load wearable data', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Connect Google Health', exact: true })).toBeVisible();
    await expect(page.getByText('Your Google connection expired. Connect again.', { exact: true })).toBeVisible();
  });
});
test('edits shared templates without duplicating them and filters the movement library', async ({ page }) => {
  await page.getByRole('tab', { name: 'Routines tab' }).click();
  await page.getByRole('button', { name: 'View The Foundation', exact: true }).click();
  await page.getByRole('button', { name: 'View Upper body A', exact: true }).click();
  await page.getByRole('button', { name: 'Edit workout', exact: true }).click();
  await page.getByRole('textbox', { name: 'Workout name', exact: true }).fill('Upper A updated');
  await page.getByRole('button', { name: 'Save workout', exact: true }).click();
  await expect(page.getByText('Upper A updated', { exact: true }).last()).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).last().click();
  await page.getByRole('button', { name: 'Close', exact: true }).last().click();
  await page.getByRole('button', { name: 'View Strength essentials', exact: true }).click();
  await expect(page.getByRole('button', { name: 'View Upper A updated', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).last().click();
  await page.getByRole('tab', { name: 'Explore tab' }).click();
  await page.getByRole('textbox', { name: 'Search exercises' }).fill('dead bug');
  await expect(page.getByRole('button', { name: 'View Dead bug', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'View Flat dumbbell chest press', exact: true })).toHaveCount(0);
});
test('exports a valid versioned backup without credentials', async ({ page }) => {
  await page.getByRole('button', { name: 'Open settings', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export backup', exact: true }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^FORM-.*\.json$/);
  const stream = await file.createReadStream();
  const buffers: Buffer[] = [];
  for await (const chunk of stream!) buffers.push(chunk);
  const backup = JSON.parse(Buffer.concat(buffers).toString('utf8'));
  expect(backup.app).toBe('FORM');
  expect(backup.version).toBe(1);
  expect(backup.state.exercises.length).toBeGreaterThan(60);
  expect(backup.state.settings).not.toHaveProperty('youtube-key');
});
test('restores a portable backup with an exercise image and rejects a broken backup', async ({ page }) => {
  const state = structuredClone(seedState());
  state.programs[0]!.name = 'Restored program';
  state.exercises[0]!.image = 'portable_image';
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
  const backup = { app: 'FORM', version: 1, createdAt: new Date().toISOString(), state, images: { portable_image: png } };
  await page.getByRole('button', { name: 'Open settings', exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Restore backup', exact: true }).click();
  await (await chooser).setFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await expect(page.getByText('Backup preview', { exact: true })).toBeVisible();
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Replace with this backup', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Today tab' })).toBeVisible();
  await page.getByRole('tab', { name: 'Routines tab' }).click();
  await expect(page.getByRole('button', { name: 'View Restored program', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Open settings', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export backup', exact: true }).click();
  const file = await download;
  const stream = await file.createReadStream();
  const buffers: Buffer[] = [];
  for await (const chunk of stream!) buffers.push(chunk);
  const restored = JSON.parse(Buffer.concat(buffers).toString('utf8'));
  expect(Object.values(restored.images)).toContain(png);
  expect(restored.state.exercises[0].image).not.toBe('portable_image');
  const invalid = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Restore backup', exact: true }).click();
  await (await invalid).setFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{"version":99}') });
  await expect(page.getByText(/not a valid FORM v1 backup/)).toBeVisible();
});
test.describe('exercise media', () => {
  // WebKit can bypass network fixtures through an active service worker.
  test.use({ serviceWorkers: 'block' });
test('shows default exercise media without a key and logs treadmill time and distance', async ({ page }) => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
  await page.route('https://i.ytimg.com/**', route => route.fulfill({ contentType: 'image/png', body: png }));
  await page.route('https://www.youtube.com/embed/**', route => route.fulfill({ contentType: 'text/html', body: '<html><body>Embedded tutorial</body></html>' }));
  let apiCalls = 0;
  page.on('request', request => { if (request.url().startsWith('https://www.googleapis.com/youtube/')) apiCalls++; });
  await page.getByRole('tab', { name: 'Explore tab' }).click();
  await page.getByRole('textbox', { name: 'Search exercises' }).fill('Flat dumbbell');
  await expect(page.getByRole('img', { name: 'Flat dumbbell chest press preview', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'View Flat dumbbell chest press', exact: true }).click();
  await expect(page.getByText(defaultTutorials['db-bench']!.videoTitle, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Play exercise tutorial', exact: true }).click();
  await expect(page.locator('iframe[title="Exercise tutorial"]')).toHaveAttribute('src', `https://www.youtube.com/embed/${defaultTutorials['db-bench']!.videoId}`);
  expect(apiCalls).toBe(0);
  await page.getByRole('button', { name: 'Close', exact: true }).last().click();
  await page.getByRole('tab', { name: 'Today tab' }).click();
  await page.getByRole('button', { name: 'Start freestyle workout' }).click();
  await page.getByRole('button', { name: 'Add exercise', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search exercises' }).fill('Treadmill');
  await page.getByRole('button', { name: 'Select Treadmill', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Treadmill set 1 minutes', exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Treadmill set 1 km', exact: true })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Complete Treadmill set 2', exact: true })).toHaveCount(0);
});
test('refreshes media on each reload using the entered key and keeps manual media and keys out of backups', async ({ page }) => {
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
  await page.route('https://i.ytimg.com/**', route => route.fulfill({ contentType: 'image/png', body: Buffer.from(png.split(',')[1]!, 'base64') }));
  const state = structuredClone(seedState());
  state.exercises = state.exercises.filter(e => e.id !== 'treadmill').map(e => ({ ...e, hideDefaultVideo: true }));
  state.exercises[0] = { ...state.exercises[0]!, image: 'chosen_image', videoId: 'abcdefghijk', videoSource: 'automatic', hideDefaultVideo: false };
  state.exercises[1] = { ...state.exercises[1]!, videoId: 'ABCDEFGHIJK', videoTitle: 'My manually chosen tutorial', videoSource: 'manual', hideDefaultVideo: false };
  state.exercises[2] = { ...state.exercises[2]!, videoId: '12345678901', videoSource: 'automatic', hideDefaultVideo: false };
  const backup = { app: 'FORM', version: 1, createdAt: new Date().toISOString(), state, images: { chosen_image: png } };
  await page.getByRole('button', { name: 'Open settings', exact: true }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Restore backup', exact: true }).click();
  await (await chooser).setFiles({ name: 'old-library.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Replace with this backup', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Today tab' })).toBeVisible();
  const requests: { query: string; key?: string }[] = [];
  let round = 1;
  await page.route('https://www.googleapis.com/youtube/v3/search?**', async route => {
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'x-goog-api-key', 'access-control-allow-methods': 'GET, OPTIONS' };
    if (route.request().method() === 'OPTIONS') { await route.fulfill({ status: 204, headers }); return; }
    requests.push({ query: new URL(route.request().url()).searchParams.get('q')!, key: (await route.request().allHeaders())['x-goog-api-key'] });
    await route.fulfill({ contentType: 'application/json', headers, body: JSON.stringify({ items: [{ id: { videoId: round === 1 ? 'dQw4w9WgXcQ' : 'abcdefghijk' }, snippet: { title: `Refreshed tutorial ${round}` } }] }) });
  });
  await page.getByRole('button', { name: 'Open settings', exact: true }).click();
  await page.getByLabel('YouTube API key', { exact: true }).fill('test-user-provided-key');
  await page.getByRole('button', { name: 'Use key for this browser session', exact: true }).click();
  await expect(page.getByText('Key saved. Reload the page to refresh exercise media.', { exact: true })).toBeVisible();
  expect(requests).toHaveLength(0);
  await page.reload();
  await page.getByRole('button', { name: 'Open settings', exact: true }).click();
  await expect(page.getByText('3 tutorials updated', { exact: true })).toBeVisible();
  expect(requests).toHaveLength(3);
  expect(requests.every(request => request.key === 'test-user-provided-key')).toBe(true);
  expect(requests.some(request => request.query.includes('Vertical chest press'))).toBe(false);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export backup', exact: true }).click();
  const stream = await (await download).createReadStream();
  const buffers: Buffer[] = [];
  for await (const chunk of stream!) buffers.push(chunk);
  const raw = Buffer.concat(buffers).toString('utf8');
  const exported = JSON.parse(raw);
  expect(raw).not.toContain('test-user-provided-key');
  expect(exported.state.exercises[0].videoId).toBe('dQw4w9WgXcQ');
  expect(exported.state.exercises[1].videoId).toBe('ABCDEFGHIJK');
  expect(exported.images[exported.state.exercises[0].image]).toBe(png);
  expect(exported.state.exercises.some((exercise: { id: string }) => exercise.id === 'treadmill')).toBe(true);
  round = 2;
  await page.reload();
  await page.getByRole('button', { name: 'Open settings', exact: true }).click();
  await expect(page.getByText('3 tutorials updated', { exact: true })).toBeVisible();
  expect(requests).toHaveLength(6);
  await page.getByRole('button', { name: 'Close', exact: true }).last().click();
  await page.getByRole('tab', { name: 'Explore tab' }).click();
  await page.getByRole('textbox', { name: 'Search exercises' }).fill('Flat dumbbell');
  await page.getByRole('button', { name: 'View Flat dumbbell chest press', exact: true }).click();
  await expect(page.getByText('Refreshed tutorial 2', { exact: true })).toBeVisible();
});
});
