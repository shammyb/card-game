# Huntarish native app

Android-first Expo / React Native client; iOS-compatible source. This is a native interface, not a website wrapper. It uses the same Express / Socket.IO server, accounts, authoritative game rules, database and profile records as the website. The practice model and game types are shared with the web project.

## Run on a phone

1. Deploy the server changes in this branch first. Existing browser cookie sessions continue working; mobile uses `/auth/native/login` and `/auth/native/register` to obtain a seven-day session stored in Expo SecureStore. There are no database migrations for this update.
2. In this directory, use Node 22.22.3 or newer, then `npm ci` and `npm start`.
3. Open the QR code in a compatible Expo Go Android app. If the store version does not support SDK 57, use a matching Expo Go build from https://expo.dev/go or a development build.
4. For local server testing, copy `.env.example` to `.env`, set `EXPO_PUBLIC_API_URL` to the computer's reachable LAN address (not localhost on your phone), and restart Expo. Production builds require HTTPS. Do not put secrets in `EXPO_PUBLIC_*` variables.

Default server: `https://api.huntarish.com`. Use different accounts for the app and browser: the server allows only one connected device per account.

The socket sends `EXPO_PUBLIC_WEB_ORIGIN` (default `https://huntarish.com`) explicitly because Android otherwise supplies the API origin, which the server rejects. For local testing set this to the server's `FRONTEND_ORIGIN` (usually `http://localhost:3000`). This is a public origin, not a credential; socket access still requires a valid session. Native HTTP sign-in must not send this header.

## Build and check

- `npm run typecheck`
- `npm run export:android` checks that Metro can bundle Android. This is not an APK.
- `npx eas-cli build --platform android --profile preview` produces an internal APK after signing into an Expo account and linking the project. Do not commit signing credentials. Review any build charges before proceeding.
- `npx eas-cli build --platform ios --profile production` requires Apple signing setup. Store submission is a separate step.

## First version

Version 0.2.0 adds computer practice with five difficulties, oldest-first stack display, and availability/loading feedback. Install the new APK over the existing app to update; it uses the same package and signing key. Preview builds use local versioning: increment `expo.android.versionCode` for each distributed APK and keep the displayed app/package versions in sync.

Includes account registration/login/logout, secure persisted sessions, reconnect, online challenges, shared room codes, all existing game actions (multi-card stack pickup, meld extensions, discards and subsequent rounds), forfeit confirmation, profile name editing and overall/opponent records, plus the same guided practice sequence. Controls have stationary touch targets and adapt to folded/unfolded layouts. Hand sorting supports dealt/rank/suit order.

The first native version uses simple rank/suit cards and text practice instructions. Native flying-card animations, glowing contextual tutorial bubbles, manual card reordering, app icons/splash artwork, store distribution and device-specific polish remain follow-up work.

## Cross-play release checklist

Run the server's `node --test test/mobile.test.cjs` for local cookie/bearer cross-play coverage (in-memory test database). Then, with the updated backend deployed, sign into the app and website with separate test accounts, challenge/accept, play a round, background and restore the app, rotate/fold the device, confirm disconnect/reconnect behaviour, and compare final scores and profile records. Avoid production test forfeits unless you intend them to count toward records. Test on a physical Android phone before distributing an APK.

Backend deploys do not update an installed native binary. Native releases need their own builds; Expo updates are not configured yet.

## Dependency review

The initial SDK 57 install reports 22 transitive audit findings (15 high, 7 moderate), including Expo/Metro build-tool dependencies on braces, node-forge and uuid. Non-breaking updates were applied; the remaining automated suggestion downgrades Expo to SDK 44 and is not a compatible fix. Review these advisories before store release. Do not expose Metro publicly or run builds against untrusted projects.
