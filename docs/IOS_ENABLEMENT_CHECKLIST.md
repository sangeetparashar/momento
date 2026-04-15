# iOS Enablement Checklist: Momento -> TestFlight

> **Goal:** Take the existing Android Expo app and deploy it to iOS TestFlight with real testers.
> **Date:** 2026-04-14
> **Bundle ID:** `com.momento.network`
> **Expo SDK:** 54 | **React Native:** 0.81.5

---

## Pre-Flight Assessment

### What's Already iOS-Ready
- [x] Expo managed workflow (no native ios/ folder needed)
- [x] Bundle identifier configured: `com.momento.network`
- [x] All Expo plugins are cross-platform (location, image-picker, notifications, secure-store, web-browser)
- [x] Privy OAuth uses `expo-web-browser` — works on iOS without changes
- [x] Deep link scheme `momento://` configured in app.json
- [x] Platform.OS checks in place for keyboard, fonts, tabs, notifications
- [x] Wallet adapter protocol supports iOS via ASWebAuthenticationSession
- [x] EAS build profiles exist (development with iOS simulator flag)
- [x] Dark mode UI style configured
- [x] Portrait-only orientation set

### What's Missing / Needs Update
- [ ] Apple Developer Account enrollment ($99/year)
- [ ] App Store Connect app registration
- [ ] APNs key for push notifications
- [ ] EAS submit config has PLACEHOLDER values
- [ ] Missing iOS permission strings (photo library, camera)
- [ ] Missing encryption declaration (avoids TestFlight compliance popup)
- [ ] `console.error` -> `console.warn` fix in useAuth.ts (dev red screen)
- [ ] Uncommitted code changes (3 files)
- [ ] No `development-device` EAS profile for physical iPhone testing

---

## Phase 1: Apple Developer Account Setup
**Time estimate: 1 day (enrollment) + up to 48 hours (approval)**
**Where: Apple Developer Portal**

- [ ] **1.1** Go to https://developer.apple.com/programs/ and click "Enroll"
- [ ] **1.2** Sign in with your Apple ID (must have 2FA enabled)
- [ ] **1.3** Select entity type: **Individual** ($99/year)
- [ ] **1.4** Fill in legal name, phone, address
- [ ] **1.5** Pay the $99 annual fee
- [ ] **1.6** Wait for approval email (Individual: ~48 hours)
- [ ] **1.7** After approval, sign in at https://developer.apple.com/account
- [ ] **1.8** Record your **Apple Team ID**: _____________ (10-char, found under Membership)

---

## Phase 2: App Store Connect Registration
**Time estimate: 15 minutes**
**Where: App Store Connect**

- [ ] **2.1** Go to https://appstoreconnect.apple.com
- [ ] **2.2** Click "My Apps" -> "+" -> "New App"
- [ ] **2.3** Configure:
  - Platform: **iOS**
  - Name: **Momento**
  - Primary language: **English (U.S.)**
  - Bundle ID: Select **com.momento.network** (or register it first)
  - SKU: **momento-ios-001**
- [ ] **2.4** Click "Create"
- [ ] **2.5** Record your **App Store Connect App ID**: _____________ (numeric, from App Information page URL)

---

## Phase 3: APNs Key for Push Notifications
**Time estimate: 10 minutes**
**Where: Apple Developer Portal + Terminal**

- [ ] **3.1** Go to https://developer.apple.com/account/resources/authkeys/list
- [ ] **3.2** Click "+" to create a new key
- [ ] **3.3** Key name: `Momento Push Key`
- [ ] **3.4** Check "Apple Push Notifications service (APNs)"
- [ ] **3.5** Click "Continue" -> "Register"
- [ ] **3.6** **Download the .p8 file** (ONE-TIME DOWNLOAD — save securely!)
- [ ] **3.7** Record the **Key ID**: _____________ (10-char)
- [ ] **3.8** Upload to EAS:
  ```bash
  cd apps/mobile
  eas credentials --platform ios
  ```
  Select: Push Notifications -> Upload -> provide .p8 path, Key ID, Team ID

---

## Phase 4: Code Changes
**Time estimate: 15 minutes**
**Where: Local codebase**

### 4a. Update `apps/mobile/eas.json` — Replace Placeholders

- [ ] **4a.1** Replace submit.production.ios values:
  ```json
  "ios": {
    "appleId": "<YOUR_APPLE_ID_EMAIL>",
    "ascAppId": "<NUMERIC_APP_STORE_CONNECT_ID>",
    "appleTeamId": "<YOUR_10_CHAR_TEAM_ID>"
  }
  ```

- [ ] **4a.2** Add a `development-device` profile for physical iPhone testing:
  ```json
  "development-device": {
    "extends": "base",
    "developmentClient": true,
    "distribution": "internal",
    "env": {
      "EXPO_PUBLIC_API_URL": "https://momento-api-ten.vercel.app/api",
      "EXPO_PUBLIC_PRIVY_APP_ID": "cmjbzyj4q00twlb0d1uc5w0sb",
      "EXPO_PUBLIC_SOLANA_RPC_URL": "https://mainnet.helius-rpc.com/?api-key=b04d4e94-cc50-4905-a43d-909652645bd2",
      "EXPO_PUBLIC_SOLANA_NETWORK": "mainnet-beta"
    }
  }
  ```

### 4b. Update `apps/mobile/app.json` — iOS Permissions & Encryption

- [ ] **4b.1** Add missing iOS permission strings and encryption declaration:
  ```json
  "ios": {
    "supportsTablet": false,
    "bundleIdentifier": "com.momento.network",
    "infoPlist": {
      "NSLocationWhenInUseUsageDescription": "Momento needs your location to show nearby creators and posts.",
      "NSPhotoLibraryUsageDescription": "Momento needs access to your photos to create posts.",
      "NSCameraUsageDescription": "Momento needs camera access to take photos for posts.",
      "ITSAppUsesNonExemptEncryption": false
    }
  }
  ```

### 4c. Fix `apps/mobile/src/hooks/useAuth.ts` — Red Screen Prevention

- [ ] **4c.1** Line ~120: Change `console.error` to `console.warn` for Privy wallet proxy initialization warning (prevents red error screen on iOS dev builds too)

### 4d. Commit All Changes

- [ ] **4d.1** Commit the 3 uncommitted files (env.ts, AuthBridge.tsx, api.ts)
- [ ] **4d.2** Commit the iOS enablement changes (eas.json, app.json, useAuth.ts)

---

## Phase 5: First iOS Build — Simulator
**Time estimate: 15-30 minutes (cloud build)**
**Where: Terminal**

- [ ] **5.1** Ensure EAS CLI is installed: `npm install -g eas-cli`
- [ ] **5.2** Log in to EAS: `eas login`
- [ ] **5.3** Run simulator build:
  ```bash
  cd apps/mobile
  eas build --profile development --platform ios
  ```
- [ ] **5.4** When prompted:
  - Log in with Apple ID: **Y**
  - Enter Apple ID email and password
  - Enter 2FA code from device
  - Let EAS manage certificates: **Y**
  - Confirm bundle ID: `com.momento.network`
- [ ] **5.5** Wait for build completion (~15-30 min)
- [ ] **5.6** Download and test on iOS Simulator (Xcode required on Mac)

### Simulator Smoke Test
- [ ] App launches without crash
- [ ] Splash screen displays correctly
- [ ] Login screen renders (Google OAuth button visible)
- [ ] Privy OAuth flow opens web browser and completes
- [ ] Location permission prompt appears
- [ ] Feed loads with nearby content
- [ ] Bottom tabs navigate correctly
- [ ] Wallet screen accessible

---

## Phase 6: iOS Build — Physical Device
**Time estimate: 20-35 minutes**
**Where: Terminal + iPhone**

- [ ] **6.1** Run device build:
  ```bash
  eas build --profile development-device --platform ios
  ```
- [ ] **6.2** EAS will show a QR code to register the device UDID — scan on iPhone
- [ ] **6.3** Wait for build completion
- [ ] **6.4** Install via QR code link or Expo dashboard

### Device Smoke Test
- [ ] All simulator tests pass on real device
- [ ] Location accuracy is good (GPS vs WiFi)
- [ ] Push notification permission prompt appears
- [ ] Haptic feedback works
- [ ] Photo picker can access iOS photo library
- [ ] Deep link `momento://` scheme works (test with Safari: type `momento://` in address bar)
- [ ] Wallet creation + sign transaction flow works
- [ ] App performs well (no OOM, smooth scrolling)

---

## Phase 7: TestFlight Deployment
**Time estimate: 45 min - 2 hours (build + processing)**
**Where: Terminal + App Store Connect**

### Build & Submit
- [ ] **7.1** Build production iOS:
  ```bash
  eas build --profile production --platform ios
  ```
- [ ] **7.2** Wait for build (~15-30 min)
- [ ] **7.3** Submit to App Store Connect:
  ```bash
  eas submit --platform ios --latest
  ```
- [ ] **7.4** When prompted for App-Specific Password:
  1. Go to https://appleid.apple.com/account/manage
  2. Sign-In and Security -> App-Specific Passwords -> "+"
  3. Label: `EAS Submit`
  4. Copy the generated password (format: xxxx-xxxx-xxxx-xxxx)
  5. Paste when EAS asks
- [ ] **7.5** Wait for upload (~5-10 min)

### Configure TestFlight
- [ ] **7.6** Go to App Store Connect -> Momento -> TestFlight tab
- [ ] **7.7** Wait for build processing (yellow -> green, ~5-30 min)
- [ ] **7.8** Click the build number
- [ ] **7.9** Export Compliance:
  - "Does your app use encryption?" -> **Yes** (HTTPS)
  - "Is it exempt?" -> **Yes** (standard HTTPS/TLS)
  - (If you set `ITSAppUsesNonExemptEncryption: false` in app.json, this step is skipped automatically)
- [ ] **7.10** Create Internal Testing group:
  - Click "+" -> "New Internal Group" -> Name: `Team`
- [ ] **7.11** Add testers by Apple ID email
- [ ] **7.12** Testers receive email invitation

### Tester Installation
- [ ] **7.13** Each tester downloads TestFlight from App Store (free)
- [ ] **7.14** Open invitation email on iPhone -> tap "Accept"
- [ ] **7.15** Open TestFlight -> tap "Install" next to Momento
- [ ] **7.16** Verify app works on tester devices

---

## Phase 8: Post-TestFlight Checklist

### For Future App Store Submission
- [ ] **8.1** Prepare screenshots:
  - iPhone 6.9" (1320 x 2868px) — required
  - iPhone 6.7" (1290 x 2796px) — required
- [ ] **8.2** Write app description and keywords
- [ ] **8.3** Create Privacy Policy URL (required by Apple)
- [ ] **8.4** Set up app review notes with test credentials
- [ ] **8.5** Complete age rating questionnaire

### Optional Enhancements
- [ ] **8.6** Add `GoogleService-Info.plist` for direct Firebase push (instead of Expo Push)
- [ ] **8.7** Configure universal links (associated domains) for web-to-app flows
- [ ] **8.8** Add Face ID / Touch ID support via passkeys
- [ ] **8.9** Set up OTA updates: `eas update --branch production --message "description"`

---

## Quick Reference

| Item | Value |
|------|-------|
| Bundle ID | `com.momento.network` |
| Expo SDK | 54.0.33 |
| React Native | 0.81.5 |
| EAS Project ID | `9a287df3-a2fd-4fdc-8e55-33fbfad22608` |
| Privy App ID | `cmjbzyj4q00twlb0d1uc5w0sb` |
| API URL | https://momento-api-ten.vercel.app/api |
| Apple submit email (placeholder) | developer@momento.app |
| Firebase Project | momento-890ae |

---

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| Apple Developer enrollment takes >48hrs | Blocks everything | Apply ASAP, individual accounts are fastest |
| Privy native extensions fail on iOS build | Auth broken | Privy SDK v0.63.9 supports iOS — test on simulator first |
| Missing iOS permission -> App Store rejection | Delayed launch | Added all permission strings in Phase 4 |
| Crypto/wallet dependencies don't compile on iOS | Wallet broken | All deps are Expo-managed, no native iOS code needed |
| TestFlight build rejected for encryption compliance | Delayed testing | Set `ITSAppUsesNonExemptEncryption: false` |
| Push notifications don't work on iOS | Degraded UX | Upload APNs key (Phase 3), test via Expo dashboard |
| New Architecture (Fabric) issues on iOS | Crashes | Can disable `"newArchEnabled": false` as fallback |
