# Codebreaker

Two-player code-cracking game (like Mastermind with digits 0–9).
The whole game is `app/src/main/assets/www/index.html` — the same file runs as the Android app and as the installable web app.

## Modes
- **Pass the phone** — fully offline, one device.
- **Online** — each player on their own phone. Backend is the Supabase project `codebreaker`
  (ref `qivhqwkkgvmkgmmguaqd`, free tier). Tables are locked; clients only call `cb_*` SQL functions,
  authenticated by a per-install player secret. Secret codes never leave the server until a game ends.
  Turn alerts: web push sent by the `cb-notify` edge function (`supabase/functions/cb-notify`); VAPID keys live in table `cb_config`.

## Web app (iPhone / Chrome install)
Published from the `gh-pages` branch to https://nickjohn117.github.io/codebreaker/
```
git subtree push --prefix app/src/main/assets/www origin gh-pages
```
iPhone: open in Safari → Share → Add to Home Screen (needed for turn alerts). `sw.js` caches the app for offline use.

## Android app
```
source build-env.sh
./gradlew -I local-build.gradle --project-cache-dir /private/tmp/codebreaker-build/project-cache assembleDebug
adb install -r /private/tmp/codebreaker-build/app/outputs/apk/debug/app-debug.apk
```
Toolchain lives in `~/.codebreaker-toolchain` (paths in `build-env.sh`) — deliberately outside Documents,
because Documents syncs to iCloud and "Optimize Mac Storage" offloads files, which crashed Java mid-build.
Build output and Gradle's project cache also go to /private/tmp for the same reason.
Signed with the Mac's debug key (`~/.android/debug.keystore`) — keep it so updates install over the top.
The Android app can play online but can't receive turn alerts while closed (WebView has no web push);
installing the web app from Chrome gets alerts.
