# Releasing Math Dash

The game lives in `www/` (plain HTML/JS). Capacitor wraps it into the native apps in `ios/` and `android/`.

## One-time setup on your computer
1. Install Node.js (LTS) – https://nodejs.org
2. In this folder: `npm install`
3. **Android:** install Android Studio – https://developer.android.com/studio (any OS)
4. **iOS:** a Mac with Xcode from the Mac App Store

## Android (Google Play)
1. `npx cap sync` then `npx cap open android` (opens Android Studio; let Gradle finish syncing).
2. Optional test: plug in an Android phone with USB debugging on and press ▶ Run.
3. **Build → Generate Signed App Bundle or APK → Android App Bundle.**
   - First time: "Create new…" keystore. Save the `.jks` file and both passwords somewhere safe (password manager + a backup). **You need this exact file for every future update.** It's git-ignored on purpose; never commit it.
   - Build variant: `release`. Output: `android/app/release/app-release.aab`.
4. Play Console → Create app → "Math Dash", Game, Free.
5. Fill in the store listing, content rating, data safety, target audience, using `store/LISTING.md`.
6. Release → Production (or Internal testing first) → upload the `.aab` → Submit for review.
   - Accept **Play App Signing** when asked (Google keeps a backup of the signing key).

## iOS (App Store)
1. `npx cap sync` then `npx cap open ios` (opens Xcode).
2. Click the **App** project → **Signing & Capabilities** → Team: **The Ferrules LLC**. Bundle Identifier must stay `com.theferrules.mathdash`.
3. Optional test: plug in your iPhone, pick it as the target, press ▶.
4. App Store Connect (https://appstoreconnect.apple.com) → Apps → **+ New App** → iOS, name "Math Dash", bundle ID `com.theferrules.mathdash`, SKU `mathdash`.
5. In Xcode: target "Any iOS Device" → **Product → Archive** → **Distribute App → App Store Connect → Upload**.
6. Back in App Store Connect: fill in the listing from `store/LISTING.md`, upload screenshots, pick the uploaded build, **Submit for Review**.

## Privacy policy & support pages
Both stores need these URLs. They're in `docs/`.
1. Replace `CONTACT_EMAIL` in `docs/index.html` and `docs/privacy.html` with your support email.
2. Merge to `main`, then GitHub → repo **Settings → Pages** → Source: "Deploy from a branch" → `main` / `/docs`.
3. URLs become `https://sergiopryce.github.io/math-dash-assests/` and `.../privacy.html`.

## Shipping an update
1. Change the game in `www/`.
2. Bump the version – **both numbers must go up every upload**:
   - Android: `android/app/build.gradle` → `versionCode` (1 → 2 → 3…) and `versionName` ("1.0" → "1.1").
   - iOS: Xcode → App target → General → **Version** (1.0 → 1.1) and **Build** (1 → 2…).
3. `npx cap sync`
4. Build & upload exactly like the first time (same keystore on Android), then submit the new version for review.

## Regenerating icons / splash
Replace `resources/icon-only.png` (1024×1024) and `resources/splash.png` (2732×2732), then `npm run assets`.
