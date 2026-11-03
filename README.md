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

## Install on your iPhone, free

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
- **Explore:** 62 built-in exercises, custom movements, media and alternatives.
- **Progress:** training days, completed sets, primary-muscle sets and load history.

Every acknowledged edit is saved locally. Completed sessions keep snapshots, so template changes do not rewrite history. Return mode starts enabled and caps working sets at two.

Use **Settings > Export backup** regularly. On iPhone, save through the share sheet to Google Drive or Files. Enable Drive in Files if needed. On another phone, open the same app address and choose **Restore backup**. Restoration replaces the current library and includes chosen images and unfinished sessions. Keys are excluded. Exported files contain your workout information and are not encrypted by FORM.

Do not clear Safari website data without a backup. Persistent storage can be requested in Settings; the browser decides whether to grant it. A static host serves the app files, not your personal workout history.

## Images and videos

Open an exercise's editor, use **Google Images**, save an image you can use, then **Choose image**. Imported images are stored offline and included in backups.

Paste a YouTube video link or add a **YouTube Data API v3** key in Settings. Restrict a browser key to your production address and that API. **Find missing tutorials** searches for short, embeddable tutorials; opening an exercise also searches if a key is available. The key lasts for the browser session. Automatic discovery needs an enabled API project and available quota. Videos stream from YouTube and are not downloaded or included in backups.

Analysis is calculated locally. **Review & export summary** copies only the summary you choose to share; FORM does not contact an AI service.

Fitbit heart rate and workout steps can be entered in a saved session's details. Automatic Fitbit/Google Health sync is not configured. iPhone web apps cannot reliably deliver timed background alerts; elapsed/rest timers catch up when reopened.

## Validate

```powershell
npm run typecheck
npm test
npm run lint
npm run build
npm run test:e2e
```

Browser tests need Playwright Chromium and WebKit (`npx playwright install chromium webkit`). The production preview is started and stopped by the test runner.
