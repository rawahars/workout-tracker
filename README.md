# FORM

An offline-first workout tracker for your iPhone Home Screen.

## Run locally

```powershell
npm ci
npm run build
npm run preview
```

Open `http://127.0.0.1:4173` on your computer. This is a local preview, not an iPhone installation address.

For development, use `npm run web`.

## Deploy from GitHub with Cloudflare Workers

Connect this repository to a Worker named `workout-tracker`, then use:

| Setting | Value |
|---|---|
| Production branch | `main` |
| Root directory | Repository root |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Optional preview command | `npx wrangler preview` |

`wrangler.jsonc` supplies the compatibility date, Worker name, and `dist` assets directory. `npm run deploy:check` validates deployment locally without uploading anything. No app API keys are needed to build or deploy.

Open the deployed HTTPS address in Safari and select **Share > Add to Home Screen**. Keep the same production address for subsequent updates.

## Alternative: upload to Cloudflare Pages

1. Create a free Cloudflare account.
2. Open **Workers & Pages > Create > Pages > Direct Upload**.
3. Upload the contents of the built `dist` folder. Choose a stable project name.
4. Open its `https://YOUR-PROJECT.pages.dev` address in Safari.
5. Tap **Share > Add to Home Screen**, then open FORM from its icon.
6. Let the first online load finish before going offline.

Keep the same production address when deploying updates. Local data belongs to that address. No Apple Developer membership or running laptop is required.

## Use

- **Today:** scheduled workouts or a freestyle session.
- **Routines:** programs contain links to shared workout templates.
- **Calendar:** all completed sessions, including freestyle and backdated logs.
- **Explore:** 63 built-in exercises, including treadmill, with default tutorials, image previews, custom media and alternatives.
- **Progress:** training days, completed sets, primary-muscle sets and load history.

Every acknowledged edit is saved locally. Completed sessions keep snapshots, so template changes do not rewrite history. Return mode starts enabled and caps working sets at two.

During an active workout, tap the clock icon to start a countdown. It can be paused, resumed or cleared and plays a short alarm on completion. On supported Safari versions, the chime briefly requests playback mode to sound despite Silent Mode, then restores the previous audio mode. This may pause other music. Keep the app open and media volume up; alarms while closed or locked are not guaranteed. Safari may require another tap to enable audio after a reload. The remaining duration is preserved across reloads.

Screens support browser Back and Safari's left-edge back gesture. Individual logs remain separate: the dashboard counts same-day sessions with a gap of at most 120 minutes as one workout, and Recent sessions uses small day headings.

Use **Settings > Export backup** regularly. On iPhone, save through the share sheet to Google Drive or Files. Enable Drive in Files if needed. On another phone, open the same app address and choose **Restore backup**. Restoration replaces the current library and includes chosen images and unfinished sessions. Keys are excluded. Exported files contain your workout information and are not encrypted by FORM.

Do not clear Safari website data without a backup. Persistent storage can be requested in Settings; the browser decides whether to grant it. A static host serves the app files, not your personal workout history.

## Images and videos

Every built-in exercise has a selected YouTube tutorial and a tutorial-thumbnail image preview, available without an API key. Existing libraries receive these defaults without resetting workout history or replacing manually chosen media. Videos and remote previews need an internet connection; logging remains available offline.

For your own image, open an exercise's editor, use **Google Images**, save an image you can use, then **Choose image**. Imported images are stored offline and included in backups. You can also paste your preferred YouTube video link.

Enter your own **YouTube Data API v3** key in Settings to refresh automatically on every page reload. Automatic/default videos and their thumbnails update; manually chosen images and videos are preserved. **Refresh exercise media** also runs this process without reloading. The key stays in browser-session storage and is never included in backups or source code. Restrict it to your production address and the YouTube Data API.

Each eligible exercise uses an API search request, so repeated reloads can exhaust your project's quota. A failed or interrupted refresh keeps previously saved media; progress and errors appear in Settings. Videos stream from YouTube and are never downloaded or included in backups.

Analysis is calculated locally. **Review & export summary** copies only the summary you choose to share; FORM does not contact an AI service.

Fitbit heart rate and workout steps can be entered manually or imported from a selected Google Health workout in a saved session's details. iPhone web apps cannot reliably deliver timed background alerts; elapsed/rest timers catch up when reopened.

## Google Health / Fitbit setup

Google Health uses OAuth consent, **not a YouTube-style API key**. The app requests read-only activity/fitness and health-metrics access. Sleep, GPS and write permissions are not requested.

1. Link your Fitbit account to your Google account in the Fitbit / Google Health mobile app and sync your watch.
2. In Google Cloud, enable **Google Health API**, configure an External OAuth consent screen, and add your account as a test user while the app is in Testing.
3. Create an OAuth client of type **Web application**. Set the authorized JavaScript origin to `https://workout-tracker.harshrawat015.workers.dev` and authorized redirect URI to `https://workout-tracker.harshrawat015.workers.dev/api/health/callback`.
4. Allow these scopes on the consent screen:

```text
https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly
https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly
```

In **Cloudflare Worker > Settings > Variables and Secrets**, add these as secrets:

| Secret | Value |
|---|---|
| `GOOGLE_HEALTH_CLIENT_ID` | OAuth Web application client ID |
| `GOOGLE_HEALTH_CLIENT_SECRET` | OAuth client secret |
| `HEALTH_COOKIE_KEY` | Base64-encoded random 32-byte encryption key |

Generate the encryption key locally:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Copy it directly into Cloudflare. Do not put these credentials in the app, GitHub, backups, or chat. Save/deploy the Worker settings, then use **Settings > Open Google Health > Connect Google Health**.

After connecting, select a date and load wearable data. In a saved session, use **Session details > Import Google Health metrics**, choose the matching recorded workout, review it, and attach its metrics. Only the metrics you attach are saved in workout history; raw Google responses and authentication tokens are not included in backups. Day summaries distinguish missing data from a measured zero.

The connection uses encrypted, `Secure`, `HttpOnly`, host-only cookies; the encryption key and OAuth client secret stay server-side. No database or live Bluetooth connection is needed. Disconnect clears the connection and attempts Google revocation; previously imported local metrics are retained unless you delete them.

Google Testing-mode refresh tokens expire after seven days, so reconnection is expected during testing. Wider distribution may require Google's app verification. Preview/local OAuth testing needs its own registered redirect URI and credentials.

## Validate

```powershell
npm run typecheck
npm test
npm run lint
npm run build
npm run test:e2e
```

Browser tests need Playwright Chromium and WebKit (`npx playwright install chromium webkit`). The production preview is started and stopped by the test runner.
