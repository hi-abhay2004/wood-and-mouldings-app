# Wood & Mouldings — Mobile

Native Expo shell around the existing web app at `https://wood-and-mouldings.vercel.app`. Renders the site in a WebView (session cookies, navigation, localStorage all work as in a real browser) and adds native push notifications on top — it does not reimplement any of the web app's UI or business logic.

## Architecture

```
Expo Shell (this repo)
  └── WebView → https://wood-and-mouldings.vercel.app (source of truth for all UI/auth/data)

Web app backend (gala-kitchen-project repo)
  └── Project/labour-assignment status change
        → writes an in-app Notification row
        → fires an Expo push to the assigned Labour's registered device(s)
              → this app receives it, tap opens the relevant page in the WebView
```

Push token registration/unregistration happens by injecting a `fetch()` call *into the WebView's own page context* (not from native code) — this way the request automatically carries the page's session cookie via `credentials: "include"`, with no native cookie-reading library needed. If the user isn't logged in yet, registration silently no-ops (401, ignored) and will succeed on the next page load once they are.

## Setup

```bash
npm install
npx expo start
```

Then open in a development build, Android emulator, or iOS simulator. **Push notifications require a physical device** (not a simulator) and an EAS project — see below.

## Environment variables

- `EXPO_PUBLIC_WEB_APP_URL` — the web app's URL. Set in `.env` (already configured to `https://wood-and-mouldings.vercel.app`). Public by design (`EXPO_PUBLIC_*` vars are inlined into the bundle) — never put secrets here.

## Push notifications — one-time EAS setup required

Expo push tokens require the project to be linked to an EAS project (`Constants.expoConfig.extra.eas.projectId`). Without this, `registerForPushNotificationsAsync()` in `src/lib/push-notifications.ts` logs a warning and returns `null` — the rest of the app still works, just without push.

```bash
npx eas login
npx eas init
```

This writes the `extra.eas.projectId` into `app.json` automatically.

## Production builds (Android/iOS)

```bash
npx eas build:configure   # first time only, after eas init
npx eas build --platform android
npx eas build --platform ios   # requires an Apple Developer account
```

iOS additionally needs push notification credentials configured through EAS (`eas credentials`) before a production push will deliver — EAS walks you through this on first build.

## Testing checklist

1. **App launch** — install/open the app, the web app loads inside the WebView.
2. **Auth persistence** — log in, close the app fully, reopen — still logged in (session cookie persisted by the WebView's cookie store).
3. **Push registration** — log in, grant the notification permission prompt, confirm a `push_device_tokens` row appears for that user in the database.
4. **Status update → push** — as a Vendor, assign Labour to a measurement/installation request; confirm the assigned Labour's device receives a push (requires that Labour to have logged into the mobile app at least once).
5. **Notification tap** — tap a received notification (app closed, backgrounded, and foregrounded — all three) — the WebView opens directly to the assigned job, not just the app root.
6. **Unrelated users** — confirm a Labour/Vendor/Salesperson *not* party to the change receives nothing.
7. **Back navigation (Android)** — navigate a few pages deep inside the WebView, press the hardware back button — goes back within the site before falling through to exiting the app.
8. **Offline/error state** — turn off network, reload — error screen with Retry appears instead of a blank/crashed WebView.
9. **External links** — tap a link to a different domain (if any exist in the web app) — opens in the system browser, not inside the WebView.

## Known gap

App icon/splash assets are still Expo's defaults (`assets/images/`) — no Wood & Mouldings branded icon exists yet. Swap those files in when branded assets are available; nothing else needs to change.
