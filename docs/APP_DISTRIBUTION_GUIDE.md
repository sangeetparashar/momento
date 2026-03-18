# Momento - Mobile App Distribution Guide

> **Audience:** A non-engineer who has never published a mobile app before.
> Every single click, every screen, every field is documented.
> If something says "click X", it means literally click that exact button.
>
> **Time estimate:** Android (2-4 hours) + iOS (3-6 hours)
>
> Last updated: 2026-03-18

---

## Table of Contents

### Part 1: Android
1. [Prerequisites — What You Need Before Starting](#1-prerequisites--android)
2. [Create an Expo Account](#2-create-an-expo-account)
3. [Install Tools on Your Computer](#3-install-tools-on-your-computer)
4. [Create a Google Play Developer Account](#4-create-a-google-play-developer-account)
5. [Set Up Firebase (Push Notifications)](#5-set-up-firebase)
6. [Configure EAS Build](#6-configure-eas-build--android)
7. [Build the Android App](#7-build-the-android-app)
8. [Test on Your Android Device](#8-test-on-your-android-device)
9. [Create the Google Play Store Listing](#9-create-the-google-play-store-listing)
10. [Upload and Publish to Google Play](#10-upload-and-publish-to-google-play)
11. [Post-Launch: Updating the App](#11-post-launch-updating-the-android-app)

### Part 2: iOS
12. [Prerequisites — What You Need Before Starting](#12-prerequisites--ios)
13. [Create an Apple Developer Account](#13-create-an-apple-developer-account)
14. [Configure EAS Build for iOS](#14-configure-eas-build--ios)
15. [Build the iOS App](#15-build-the-ios-app)
16. [Test on Your iPhone (TestFlight)](#16-test-on-your-iphone-testflight)
17. [Create the App Store Listing](#17-create-the-app-store-listing)
18. [Submit for App Review](#18-submit-for-app-review)
19. [Post-Launch: Updating the iOS App](#19-post-launch-updating-the-ios-app)

### Appendix
- [A: Glossary of Terms](#appendix-a-glossary)
- [B: Troubleshooting Common Errors](#appendix-b-troubleshooting)
- [C: App Store Asset Requirements](#appendix-c-asset-requirements)

---

# PART 1: ANDROID

---

## 1. Prerequisites — Android

Before you start, make sure you have:

| # | Item | How to Check | How to Get It |
|---|------|-------------|---------------|
| 1 | A computer (Mac, Windows, or Linux) | You're reading this on one | N/A |
| 2 | Node.js v18 or higher | Open Terminal, type `node --version` | Download from https://nodejs.org (click the "LTS" button) |
| 3 | pnpm package manager | Type `pnpm --version` in Terminal | Run: `npm install -g pnpm` |
| 4 | Git installed | Type `git --version` in Terminal | Download from https://git-scm.com |
| 5 | The Momento code on your computer | You have the `momento/` folder | Clone the repo or copy the folder |
| 6 | A Google account (Gmail) | You can log into Gmail | Create at https://accounts.google.com |
| 7 | A credit/debit card | For the $25 Google Play fee | Any Visa/Mastercard |
| 8 | An Android phone (optional, for testing) | You have one in your hand | You can also use an emulator |
| 9 | The API backend running | See `SETUP_GUIDE.md` | Must be deployed to Vercel or running locally |

### How to open Terminal:
- **Mac:** Press `Cmd + Space`, type `Terminal`, press Enter
- **Windows:** Press `Win + R`, type `cmd`, press Enter (or search for "Command Prompt")
- **Linux:** Press `Ctrl + Alt + T`

### Verify Node.js is installed:
```
node --version
```
You should see something like `v18.17.0` or higher. If you get "command not found":
1. Go to https://nodejs.org
2. Click the big green **"LTS"** button
3. Run the downloaded installer, clicking "Next" through every step
4. Close and re-open your Terminal
5. Try `node --version` again

### Verify pnpm is installed:
```
pnpm --version
```
If you get "command not found":
```
npm install -g pnpm
```

---

## 2. Create an Expo Account

Expo is the service that builds your mobile app. Think of it as a factory that takes your code and produces an installable app file.

1. Open your browser and go to **https://expo.dev**

2. Click **"Sign Up"** (top right corner)

3. Fill in the form:
   - **Username:** Pick something like `momento-team` (this is public)
   - **Email:** Your email address
   - **Password:** At least 8 characters
   - Click **"Create Account"**

4. Check your email for a verification link. Click it.

5. You now have an Expo account. **Write down your username and password** — you'll need them later.

---

## 3. Install Tools on Your Computer

You need to install the EAS CLI (Expo's build tool).

### Step 1: Install EAS CLI
Open Terminal and run:
```
npm install -g eas-cli
```

Wait for it to finish (usually 30-60 seconds). You'll see some progress bars.

### Step 2: Verify installation
```
eas --version
```
You should see a version number like `12.x.x`. If you get "command not found", close Terminal and open a new one, then try again.

### Step 3: Log in to your Expo account
```
eas login
```
- It will ask for your **email** — type the email you used in Step 2
- Then your **password** — type it (you won't see characters as you type, that's normal)
- You should see: `Logged in as your-username`

### Step 4: Navigate to the mobile app folder
```
cd /path/to/momento/apps/mobile
```
Replace `/path/to/momento` with the actual path. For example:
- Mac: `cd ~/Desktop/momento/apps/mobile`
- Windows: `cd C:\Users\YourName\Desktop\momento\apps\mobile`

### Step 5: Install project dependencies
```
pnpm install
```
This downloads all the code libraries the app needs. It may take 2-5 minutes. Wait for it to complete.

---

## 4. Create a Google Play Developer Account

This is required to publish apps on the Google Play Store.

1. Go to **https://play.google.com/console** in your browser

2. Click **"Go to Play Console"**

3. Sign in with your Google account

4. You'll see a setup wizard. Click **"Create a developer account"**

5. **Account type:**
   - Choose **"Personal"** (if publishing under your own name)
   - OR choose **"Organization"** (if publishing under a company name)
   - Click **"Continue"**

6. **Developer name:** Enter the name that will appear on the Play Store (e.g., "Momento Technologies" or your personal name)

7. **Contact information:**
   - Enter your email address
   - Enter your phone number (include country code, e.g., +1 for US/Canada)
   - These are for Google's records, not shown publicly

8. **Pay the $25 registration fee:**
   - Click **"Continue to payment"**
   - Enter your credit/debit card details
   - Click **"Pay"**

9. **Identity verification:**
   - Google will ask you to verify your identity
   - For personal accounts: upload a government ID (passport, driver's license)
   - For organization accounts: provide a D-U-N-S number (business registration)
   - This verification can take **1-5 business days**

10. **Wait for verification email.** You'll receive an email when your account is approved.

> **Important:** You CANNOT upload an app until your identity verification is complete. Start this step early.

---

## 5. Set Up Firebase

Firebase handles push notifications on Android. Without it, users won't receive notifications when someone likes their post or follows them.

### Step 1: Create a Firebase project

1. Go to **https://console.firebase.google.com**

2. Click **"Create a project"** (or **"Add project"** if you have existing projects)

3. **Project name:** Type `Momento`
   - You'll see a project ID generated below (like `momento-abcde`). That's fine.
   - Click **"Continue"**

4. **Google Analytics:** Toggle the switch **OFF** (you don't need it)
   - Click **"Create project"**

5. Wait 15-30 seconds. You'll see a checkmark and "Your new project is ready"
   - Click **"Continue"**

### Step 2: Add Android app to Firebase

1. You'll see the Firebase project dashboard. Click the **Android icon** (looks like a robot head)

2. **Register app:**
   - **Android package name:** Type exactly: `com.momento.app`
   - **App nickname:** Type: `Momento`
   - **Debug signing certificate SHA-1:** Leave blank (skip this)
   - Click **"Register app"**

3. **Download config file:**
   - Click the **"Download google-services.json"** button
   - A file called `google-services.json` will download to your Downloads folder
   - **Move this file** to: `momento/apps/mobile/google-services.json`
     - On Mac: Open Finder, drag the file from Downloads to the `momento/apps/mobile/` folder
     - On Windows: Open File Explorer, cut the file from Downloads and paste it in `momento\apps\mobile\`
   - Click **"Next"** (skip the "Add Firebase SDK" step — Expo handles this)
   - Click **"Next"** again
   - Click **"Continue to console"**

### Step 3: Enable Cloud Messaging

1. In the Firebase console, click the **gear icon** (⚙️) next to "Project Overview" in the top-left

2. Click **"Project settings"**

3. Click the **"Cloud Messaging"** tab at the top

4. Look for **"Cloud Messaging API (V1)"**
   - If it says "Disabled", click the three dots (**⋮**) next to it and click **"Enable"** (this may take you to the Google Cloud Console — just click "Enable" there)
   - If it already says "Enabled", you're good

### Step 4: Get Firebase service account key (for Expo push notifications)

1. Still in Firebase Project Settings, click the **"Service accounts"** tab

2. Click **"Generate new private key"**

3. A popup appears. Click **"Generate key"**

4. A JSON file downloads (named something like `momento-firebase-adminsdk-xxxxx-xxxxxxxxxx.json`)

5. **Remember where this file is saved.** You'll upload it to Expo in the next section.

---

## 6. Configure EAS Build — Android

### Step 1: Initialize EAS in the project

Open Terminal and make sure you're in the mobile app folder:
```
cd /path/to/momento/apps/mobile
```

Run:
```
eas init
```

It will ask:
- "Would you like to create a new project?" → Type **Y** and press Enter
- "What would you like your project to be called?" → Type **momento** and press Enter

This creates a `projectId` in your `app.json` file.

### Step 2: Create the EAS build configuration

Check if `eas.json` already exists:
```
cat eas.json
```

If it doesn't exist, create it. If it does exist, make sure it has these contents. Open the file in any text editor and make it look exactly like this:

```json
{
  "cli": {
    "version": ">= 12.0.0",
    "appVersionSource": "remote"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "android": {
        "buildType": "apk"
      }
    },
    "preview": {
      "distribution": "internal",
      "android": {
        "buildType": "apk"
      }
    },
    "production": {
      "autoIncrement": true
    }
  },
  "submit": {
    "production": {
      "android": {
        "serviceAccountKeyPath": "./play-store-key.json",
        "track": "internal"
      }
    }
  }
}
```

Save the file.

### Step 3: Set up environment variables

Create (or edit) the file `apps/mobile/.env`:
```
EXPO_PUBLIC_API_URL="https://your-api.vercel.app/api"
EXPO_PUBLIC_PRIVY_APP_ID="your-privy-app-id"
EXPO_PUBLIC_SOLANA_RPC_URL="https://devnet.helius-rpc.com/?api-key=your-key"
EXPO_PUBLIC_SOLANA_NETWORK="devnet"
```

Replace the values with your actual credentials. If you don't know these values, ask the engineer who set up the backend, or refer to `SETUP_GUIDE.md`.

### Step 4: Upload Firebase push notification credentials to Expo

Run:
```
eas credentials --platform android
```

You'll see a menu. Use arrow keys to navigate:
1. Select **"Push Notifications: Manage your FCM V1 API Key"** → Press Enter
2. Select **"Upload a Firebase Service Account Key"** → Press Enter
3. It asks for a file path. Type the path to the service account JSON you downloaded in Step 5.4:
   ```
   /Users/YourName/Downloads/momento-firebase-adminsdk-xxxxx-xxxxxxxxxx.json
   ```
   Replace with your actual path
4. Press Enter. You should see a success message.

---

## 7. Build the Android App

### For testing (development build):
```
eas build --profile development --platform android
```

### For Play Store release (production build):
```
eas build --profile production --platform android
```

**What happens next:**
1. EAS packages your code and uploads it to Expo's build servers
2. You'll see a URL in the terminal like: `https://expo.dev/accounts/your-username/projects/momento/builds/xxxxx`
3. The build takes **5-20 minutes**
4. You'll get a notification when it's done

**What to do while waiting:**
- You can close Terminal — the build runs on Expo's servers
- Check the build status at https://expo.dev → Your project → "Builds" tab

**When the build is done:**
- For development: You'll get a link to download an `.apk` file
- For production: You'll get a link to download an `.aab` file (this is what Google Play needs)

### If the build fails:
- Read the error message carefully
- Common fixes:
  - `Missing google-services.json` → Make sure the file is in `apps/mobile/`
  - `Gradle build failed` → Run `eas build --clear-cache --profile development --platform android`
  - `Authentication error` → Run `eas login` again
- See [Appendix B: Troubleshooting](#appendix-b-troubleshooting) for more

---

## 8. Test on Your Android Device

### Option A: Install on a physical Android phone

1. After the build completes, open the download link on your phone's browser (you can email/text yourself the link)

2. Download the `.apk` file

3. Your phone will warn you about installing from unknown sources:
   - Tap **"Settings"** when prompted
   - Toggle **"Allow from this source"** ON
   - Go back and tap **"Install"**

4. Open the app. You should see the Momento login screen.

### Option B: Install on an Android emulator

1. Download Android Studio from https://developer.android.com/studio

2. Open Android Studio → Click **"More Actions"** → **"Virtual Device Manager"**

3. Click **"Create device"**
   - Pick a phone (e.g., "Pixel 7") → Click **"Next"**
   - Select a system image (pick the latest one, e.g., "API 34") → Click **"Next"**
   - Click **"Finish"**

4. Click the **play button** (▶) next to the virtual device to start it

5. Drag and drop the `.apk` file onto the emulator window to install it

---

## 9. Create the Google Play Store Listing

Your developer account must be verified (from Step 4) before you can do this.

### Step 1: Create the app in Play Console

1. Go to https://play.google.com/console

2. Click **"Create app"** (top right)

3. Fill in the form:
   - **App name:** `Momento`
   - **Default language:** English (United States)
   - **App or game:** Select **App**
   - **Free or paid:** Select **Free**

4. Check the declaration boxes:
   - "Developer Program Policies" → Check ✓
   - "US export laws" → Check ✓

5. Click **"Create app"**

### Step 2: Fill in the Store listing

In the left sidebar, click **"Main store listing"** (under "Grow" > "Store presence"):

**App details:**
- **App name:** Momento
- **Short description (80 characters max):** `Discover local creators. Own their tokens. Invest in culture.`
- **Full description (4000 characters max):**
  ```
  Momento is the stock market for culture. Discover creators near you,
  follow their journey, and invest in their success through tokens on
  the Solana blockchain.

  DISCOVER LOCAL CREATORS
  Find musicians, artists, photographers, chefs, and more in your city.
  Every creator is verified through KYC, so you know they're real.

  YOUR OWN SOLANA WALLET
  Get an embedded Solana wallet the moment you sign up. No seed phrases,
  no extensions, no hassle.

  TOKEN-POWERED ECONOMY
  Each creator has their own token. Buy tokens of creators you believe in.
  As they grow, so does your investment.

  LOCATION-BASED FEED
  See what's happening around you. Posts are geotagged so you discover
  content from creators in your neighborhood.

  BUILT ON SOLANA
  Fast transactions, low fees, real blockchain technology under the hood.
  ```

**Graphics (required):**

You need to prepare these images. Use Canva (https://canva.com) or Figma if you don't have a designer:

| Asset | Size | What it is |
|-------|------|------------|
| **App icon** | 512 x 512 px, PNG | The icon shown on the Play Store |
| **Feature graphic** | 1024 x 500 px, PNG | Banner shown at the top of your listing |
| **Phone screenshots** | Min 2, max 8. Size: 1080 x 1920 px (or 16:9 ratio) | Screenshots of the app in use |

To upload:
- Scroll down to **"Graphics"** section
- Click **"App icon"** → Upload your 512x512 icon
- Click **"Feature graphic"** → Upload your 1024x500 banner
- Click **"Phone screenshots"** → Upload 2-8 screenshots

Click **"Save"** at the bottom.

### Step 3: Complete the content rating questionnaire

1. In the left sidebar, click **"Content rating"** (under "Policy and programs")

2. Click **"Start questionnaire"**

3. **Email address:** Enter your email

4. **App category:** Select **"Reference, News, or Educational"** (or closest match)

5. Answer the questions honestly:
   - Violence: No
   - Sexual content: No
   - Profanity: No
   - Controlled substances: No
   - Cryptocurrency/financial: **Yes** (select this — the app involves tokens)
   - User-generated content: **Yes**
   - Personal info collection: **Yes** (the app collects email and location)

6. Click **"Save"** → **"Next"** → **"Submit"**

### Step 4: Set up pricing and distribution

1. In the left sidebar, click **"Countries / regions"** (under "Reach" > "Availability")

2. Click **"Add countries / regions"**

3. Select the countries where you want the app available (or click **"Select all"** for worldwide)

4. Click **"Save"**

### Step 5: Complete the app content section

1. In the left sidebar, click **"App content"** (under "Policy and programs")

2. You'll see a checklist. Complete each item:
   - **Privacy policy:** Enter the URL of your privacy policy (e.g., `https://moment.network` → footer has one). If you don't have one hosted, use a free generator like https://app.termly.io
   - **Ads:** Select "No, my app does not contain ads"
   - **App access:** Select "All functionality is available without special access" (or provide test credentials)
   - **Content ratings:** Already done in Step 3
   - **Target audience:** Select **"18 and over"** (crypto/financial app)
   - **News app:** Select "No"
   - **COVID-19 apps:** Select "No"
   - **Data safety:** Fill in what data your app collects:
     - Location: Yes (approximate and precise)
     - Personal info: Yes (email, name)
     - Photos/videos: Yes (for post creation)
     - Financial info: Yes (wallet/token data)
     - Device identifiers: Yes (push notification tokens)

3. Save each section as you go.

---

## 10. Upload and Publish to Google Play

### Step 1: Create a Google Play service account (for automated uploads)

This allows EAS to upload builds directly to Google Play.

1. Go to https://play.google.com/console

2. Click **"Setup"** (bottom of left sidebar) → **"API access"**

3. If it says "Link to existing Google Cloud project" → Click **"Link"** (or "Create new project")

4. Under "Service accounts", click **"Create new service account"**

5. A popup appears. Click the **"Google Cloud Platform"** link — it opens in a new tab

6. In Google Cloud Console:
   - Click **"+ CREATE SERVICE ACCOUNT"** at the top
   - Service account name: `eas-submit`
   - Service account ID: auto-filled
   - Click **"CREATE AND CONTINUE"**
   - **Role:** Skip this (click "CONTINUE")
   - **Grant users access:** Skip this (click "DONE")

7. Now you're back on the service accounts list. Find `eas-submit`:
   - Click the three dots (**⋮**) on the right → **"Manage keys"**
   - Click **"ADD KEY"** → **"Create new key"**
   - Select **"JSON"** → Click **"CREATE"**
   - A JSON file downloads. **Save this file** as `play-store-key.json` in `apps/mobile/`:
     ```
     momento/apps/mobile/play-store-key.json
     ```

8. Go back to the Google Play Console tab. Click **"Done"** on the popup.

9. Find the `eas-submit` service account in the list. Click **"Grant access"**

10. Under **"App permissions"**:
    - Click **"Add app"** → Select **"Momento"**
    - Check these permissions:
      - ✓ Release to production, exclude devices, and use Play App Signing
      - ✓ Release apps to testing tracks
      - ✓ Manage testing tracks and edit tester lists
    - Click **"Apply"**

11. Under **"Account permissions"**, make sure these are checked:
    - ✓ View app information and download bulk reports
    - Click **"Invite user"**

12. **Wait 24 hours** for the service account permissions to propagate. Google's system takes time.

### Step 2: Upload using EAS Submit

**Option A: Automatic upload (recommended)**

After your production build completes:
```
eas submit --platform android --latest
```

This will:
- Find your latest Android build
- Upload it to Google Play's internal testing track
- Use the `play-store-key.json` credentials

**Option B: Manual upload**

1. Download the `.aab` file from your Expo build page

2. In Google Play Console, go to your app

3. In the left sidebar, click **"Production"** (under "Release")

4. Click **"Create new release"**

5. **App signing:** If it says "Let Google manage and protect your app signing key", click **"Continue"** (recommended)

6. Click **"Upload"** and select your `.aab` file

7. **Release name:** `1.0.0` (or whatever version)

8. **Release notes:** Write what's in this version:
   ```
   Initial release of Momento - discover local creators and invest in culture.
   ```

9. Click **"Review release"**

10. Click **"Start rollout to Production"**

### Step 3: Wait for Google's review

- Google reviews all new apps before publishing
- Review time: **2-7 days** for first submission
- You'll get an email when the app is approved (or if changes are needed)
- Check status in Play Console under your app's overview

---

## 11. Post-Launch: Updating the Android App

When you have code changes and want to release a new version:

1. Make your code changes in the `momento/` codebase

2. Build a new production version:
   ```
   cd apps/mobile
   eas build --profile production --platform android
   ```

3. Wait for the build to complete (5-20 minutes)

4. Submit to Google Play:
   ```
   eas submit --platform android --latest
   ```

5. In Google Play Console, go to your app → "Production" → review the new release → click "Start rollout"

6. Google reviews the update (usually 1-3 days for updates, faster than first submission)

---

# PART 2: iOS

---

## 12. Prerequisites — iOS

Everything from the Android prerequisites, PLUS:

| # | Item | How to Check | How to Get It |
|---|------|-------------|---------------|
| 1 | A Mac computer | You're using macOS | Required for iOS signing (EAS handles this in the cloud, but some steps need a Mac) |
| 2 | An Apple ID | You can log into https://appleid.apple.com | Create at https://appleid.apple.com |
| 3 | $99 USD available | For Apple Developer Program annual fee | Credit/debit card |
| 4 | An iPhone or iPad (optional, for testing) | You have one | You can test via TestFlight without a physical device initially |

> **Note:** Unlike Android, you CANNOT side-load apps onto an iPhone easily. The standard testing flow uses **TestFlight** (Apple's official test distribution). For development, you can use the iOS Simulator in Xcode on a Mac.

---

## 13. Create an Apple Developer Account

1. Go to **https://developer.apple.com/programs/**

2. Click **"Enroll"**

3. Sign in with your Apple ID

4. **Choose your entity type:**
   - **Individual / Sole Proprietor:** For personal accounts ($99/year)
   - **Organization:** For companies ($99/year, requires D-U-N-S number)
   - For most first-time publishers, choose **Individual**

5. Fill in your personal information:
   - Legal first name, last name
   - Phone number
   - Address

6. **Pay the $99 annual fee:**
   - Enter your payment details
   - Click **"Purchase"**

7. **Wait for approval:**
   - Individual accounts: Usually approved within **48 hours**
   - Organization accounts: Can take **1-4 weeks** (requires D-U-N-S verification)
   - You'll get an email when approved

8. After approval, sign in at https://developer.apple.com/account to verify your membership is active.

---

## 14. Configure EAS Build — iOS

### Step 1: Register your app with Apple

EAS can do this automatically. Run (from `apps/mobile/`):
```
eas build --profile development --platform ios
```

The first time, EAS will ask several questions:

1. **"Would you like to log in to your Apple account?"** → Type **Y**

2. **Apple ID:** Type your Apple ID email address

3. **Password:** Type your Apple ID password

4. **Two-factor authentication:** Apple will send a 6-digit code to one of your devices. Type it in.

5. **"Would you like EAS to manage your certificates and provisioning profiles?"** → Type **Y** (this is strongly recommended — EAS handles all the signing complexity for you)

6. **Team:** If you have multiple teams, select the right one. Otherwise it auto-selects.

7. **Bundle identifier:** It should auto-detect `com.momento.app` from your `app.json`. Confirm it.

EAS now creates:
- A distribution certificate (for signing the app)
- A provisioning profile (tells Apple which devices can run the app)
- All stored securely in Expo's cloud

### Step 2: Add Apple Push Notification (APN) key

This is needed for push notifications on iOS.

1. Go to **https://developer.apple.com/account/resources/authkeys/list**

2. Click **"+"** to create a new key

3. **Key name:** `Momento Push Key`

4. Check **"Apple Push Notifications service (APNs)"** ✓

5. Click **"Continue"** → **"Register"**

6. **Download the key file** (`.p8` file). It has a name like `AuthKey_XXXXXXXXXX.p8`
   - **Important:** You can only download this ONCE. Save it carefully.

7. Note the **Key ID** shown on the page (10-character string like `ABCDEF1234`)

8. Note your **Team ID**: Go to https://developer.apple.com/account → look at the top right, or find it under "Membership" in the sidebar. It's a 10-character string.

9. Upload the key to Expo:
   ```
   eas credentials --platform ios
   ```
   - Select **"Push Notifications: Manage your Apple Push Notifications Key"**
   - Select **"Upload a Push Notifications Key"**
   - Enter the path to the `.p8` file
   - Enter the Key ID
   - Enter your Team ID

---

## 15. Build the iOS App

### For testing (development build — runs on registered test devices):
```
eas build --profile development --platform ios
```

### For TestFlight / App Store (production build):
```
eas build --profile production --platform ios
```

**What happens:**
1. EAS uploads your code to Expo's build servers
2. The build runs on macOS machines in the cloud (you don't need a Mac for this step)
3. Takes **10-30 minutes**
4. When done, you'll get a download link for the `.ipa` file

---

## 16. Test on Your iPhone (TestFlight)

TestFlight is Apple's official way to distribute test versions of your app to real iPhones.

### Step 1: Upload the build to App Store Connect

**Option A: Automatic (recommended)**

After your production build finishes:
```
eas submit --platform ios --latest
```

EAS will ask:
- **Apple ID:** Enter your Apple ID
- **App specific password:** You need to create one:
  1. Go to https://appleid.apple.com/account/manage
  2. Click **"Sign-In and Security"** → **"App-Specific Passwords"**
  3. Click **"+"** to generate a new password
  4. Label: `EAS Submit`
  5. Copy the generated password (format: `xxxx-xxxx-xxxx-xxxx`)
  6. Paste it when EAS asks

The upload takes 5-10 minutes.

**Option B: Manual upload**

1. Download the `.ipa` file from your Expo build page

2. Download **Transporter** from the Mac App Store (it's free, made by Apple)

3. Open Transporter → Sign in with your Apple ID

4. Drag and drop the `.ipa` file into Transporter

5. Click **"Deliver"**

### Step 2: Set up TestFlight in App Store Connect

1. Go to **https://appstoreconnect.apple.com**

2. Sign in with your Apple ID

3. Click **"My Apps"**

4. Find **"Momento"** (it should have been auto-created when you ran `eas submit`)
   - If it doesn't exist, click **"+"** → **"New App"**:
     - Platform: iOS
     - Name: Momento
     - Primary language: English
     - Bundle ID: Select `com.momento.app`
     - SKU: `momento-ios-001` (any unique string)
     - Click **"Create"**

5. Click on **"Momento"** to open it

6. Click the **"TestFlight"** tab at the top

7. You should see your uploaded build listed under **"iOS Builds"**
   - The build will show a yellow status "Processing" for 5-30 minutes
   - Wait until it turns green

8. Click the build number

9. **Export Compliance:** A popup appears asking about encryption
   - Click **"Manage"** or answer the questions:
   - "Does your app use encryption?" → Select **"Yes"** (most apps do — HTTPS counts)
   - "Is it exempt?" → Select **"Yes, it qualifies for an exemption"** (standard HTTPS/TLS)
   - Click **"Save"**

### Step 3: Add test users

**Internal testers** (up to 100 people from your team):
1. In TestFlight, click **"Internal Group"** (or create one: **"+"** → **"New Internal Group"**)
2. Group name: `Team`
3. Click **"+"** next to Testers
4. Add testers by their Apple ID email (they must have App Store Connect access)
5. They'll receive an email invitation to test

**External testers** (up to 10,000 people):
1. Click **"+"** → **"New External Group"**
2. Group name: `Beta Testers`
3. Select the build to test → Click **"Next"**
4. **Beta App Review:** Apple reviews the TestFlight build (usually within 24-48 hours)
5. After approval, add testers:
   - Click **"+"** next to Testers
   - Add by email or create a **public link** (anyone with the link can join)

**Testers install the app:**
1. Each tester gets an email invitation
2. They download the **TestFlight** app from the App Store (free)
3. Open the email invitation on their iPhone → Tap **"Accept"**
4. Open TestFlight → Tap **"Install"** next to Momento
5. The app installs on their phone

---

## 17. Create the App Store Listing

1. In App Store Connect, go to your app → **"App Store"** tab

2. **App Information** (left sidebar):
   - **Category:** Social Networking (Primary), Finance (Secondary)
   - **Content rights:** "Does not contain third-party content"
   - **Age Rating:** Click "Edit" and answer the questionnaire (similar to Google Play)

3. **Pricing and Availability** (left sidebar):
   - **Price:** Free
   - **Availability:** Select countries (or worldwide)

4. **Version Information** (main page):
   - **Screenshots (required):**

     | Device | Size | Required? |
     |--------|------|-----------|
     | iPhone 6.9" (iPhone 16 Pro Max) | 1320 x 2868 px | Yes |
     | iPhone 6.7" (iPhone 16 Plus) | 1290 x 2796 px | Yes |
     | iPhone 6.5" (iPhone 11 Pro Max) | 1242 x 2688 px | Recommended |
     | iPad 13" (iPad Pro) | 2048 x 2732 px | Only if you support iPad |

     Upload 3-10 screenshots per device size. You can reuse the same screenshots across sizes if the dimensions match.

   - **Description:** Same as Google Play (see Step 9, Section 2)
   - **Keywords (100 characters max):** `creators,tokens,solana,crypto,local,discover,music,art,invest,culture`
   - **Support URL:** Your website (e.g., `https://moment.network`)
   - **Marketing URL (optional):** `https://moment.network`

5. **App Review Information:**
   - **Contact info:** Your name, phone, email (for Apple reviewers to contact you)
   - **Notes for reviewer:**
     ```
     Test account credentials:
     - Email: testuser@momento.test
     - The app uses Privy authentication (Google/Apple Sign-In)
     - To test, sign in with any Google account
     - The app requires location permission to show nearby creators
     - Test location: Toronto, Ontario, Canada
     ```
   - **Demo account:** If the app requires login, provide test credentials or explain how to access

---

## 18. Submit for App Review

1. Make sure all sections show a green checkmark:
   - ✓ App Information
   - ✓ Pricing and Availability
   - ✓ Version Information (with screenshots)
   - ✓ App Review Information

2. In the top right, click **"Add for Review"**

3. Click **"Submit to App Review"**

4. **Review timeline:**
   - First submission: **1-7 days** (sometimes faster)
   - You'll get an email when it's approved or if changes are needed

5. **Common rejection reasons and how to fix:**

   | Reason | Fix |
   |--------|-----|
   | "Guideline 4.2 - Minimum Functionality" | Add more features or content to the app |
   | "Guideline 5.1.1 - Data Collection and Storage" | Add a privacy policy URL and explain data usage |
   | "Guideline 3.1.1 - In-App Purchase" | If the app sells digital goods, use Apple's In-App Purchase |
   | "Guideline 2.1 - Performance: App Completeness" | Fix crashes or placeholder content |
   | "Metadata Rejected" | Fix the app description, screenshots, or category |

6. **If rejected:**
   - Read the rejection message carefully
   - Fix the issues
   - Resubmit by clicking "Resubmit for Review" in App Store Connect

7. **When approved:**
   - The app automatically goes live on the App Store (unless you set a manual release date)
   - It usually appears in search within 24 hours

---

## 19. Post-Launch: Updating the iOS App

When you have code changes:

1. Make your code changes in the `momento/` codebase

2. Build a new production version:
   ```
   cd apps/mobile
   eas build --profile production --platform ios
   ```

3. Wait for the build (10-30 minutes)

4. Submit to App Store Connect:
   ```
   eas submit --platform ios --latest
   ```

5. In App Store Connect → Your App → **"App Store"** tab:
   - Click **"+"** next to the version in the sidebar to create a new version
   - Version number: e.g., `1.1.0`
   - Add release notes ("What's New in This Version")
   - Select the new build
   - Click **"Add for Review"** → **"Submit to App Review"**

6. Apple reviews the update (usually 1-3 days)

### Over-the-Air Updates (skip app review for small changes):

For non-native code changes (JavaScript/TypeScript only — UI tweaks, bug fixes, etc.), you can use **EAS Update** to push changes directly to users without going through app review:

```
eas update --branch production --message "Fix: improved feed loading"
```

This pushes a JS bundle update. Users get the update next time they open the app. No app review needed. **However**, this only works for JavaScript changes — native module changes (new permissions, new native libraries) still require a full app build and store submission.

---

# APPENDICES

---

## Appendix A: Glossary

| Term | What It Means |
|------|--------------|
| **APK** | Android Package — an installable file for Android phones |
| **AAB** | Android App Bundle — the format Google Play requires (Google generates APKs from it) |
| **IPA** | iOS App — an installable file for iPhones |
| **EAS** | Expo Application Services — cloud build service that compiles your code into APK/IPA files |
| **TestFlight** | Apple's official tool for distributing test versions of iOS apps |
| **Bundle Identifier** | A unique ID for your app (e.g., `com.momento.app`). Must be identical everywhere. |
| **Provisioning Profile** | An Apple certificate that says "this app is allowed to run on these devices" |
| **Signing Certificate** | A cryptographic identity that proves the app came from you |
| **Firebase Cloud Messaging (FCM)** | Google's push notification service for Android |
| **Apple Push Notification service (APNs)** | Apple's push notification service for iOS |
| **Service Account** | A non-human account used for automated tasks (like uploading builds) |
| **D-U-N-S Number** | A unique 9-digit business identifier from Dun & Bradstreet, required for organization Apple Developer accounts |
| **OTA Update** | Over-The-Air — pushing code changes to users without a new app store release |
| **Internal Testing** | A private testing track visible only to your team |
| **Production** | The public version of your app that everyone can download |

---

## Appendix B: Troubleshooting

### "eas: command not found"
```
npm install -g eas-cli
```
Then close and re-open Terminal.

### "Error: Not logged in"
```
eas login
```
Enter your Expo credentials.

### "Build failed: Missing google-services.json"
Make sure `google-services.json` is in `apps/mobile/google-services.json` (not in a subfolder, not renamed).

### "Build failed: Gradle build failed"
Try clearing the cache:
```
eas build --clear-cache --profile development --platform android
```

### "Build failed: Code signing error" (iOS)
Run:
```
eas credentials --platform ios
```
Select "Build Credentials" → "Set up new credentials" → Follow prompts.

### "Apple ID account is not enrolled in the Apple Developer Program"
Your $99 payment hasn't been processed yet, or your account hasn't been approved. Check https://developer.apple.com/account for status.

### "App rejected: Guideline 5.1.1 - Legal - Privacy"
You need a privacy policy URL. Add one to your app's settings in App Store Connect. You can generate a free one at https://app.termly.io or https://www.privacypolicygenerator.info.

### "TestFlight build stuck on Processing"
This is normal for the first build. It can take up to 30 minutes. If it's been over an hour, try:
1. Upload a new build with `eas submit --platform ios --latest`
2. Check App Store Connect for any error messages

### "App crashes on launch"
Check that `EXPO_PUBLIC_API_URL` in `apps/mobile/.env` points to a running API. If testing locally, use your computer's IP address (e.g., `http://192.168.1.100:3000/api`), not `localhost`.

### "Push notifications not working on Android"
1. Verify `google-services.json` is in the right place
2. Verify Firebase Cloud Messaging is enabled
3. Verify the Firebase service account key was uploaded to Expo

### "Push notifications not working on iOS"
1. Verify the APNs key was uploaded to Expo (`eas credentials --platform ios`)
2. Push notifications do NOT work in the iOS Simulator — test on a real device
3. Make sure the app has notification permissions (user must tap "Allow")

---

## Appendix C: Asset Requirements

### Google Play Store

| Asset | Dimensions | Format | Required? |
|-------|-----------|--------|-----------|
| App icon | 512 x 512 px | PNG (32-bit, no alpha) | Yes |
| Feature graphic | 1024 x 500 px | PNG or JPEG | Yes |
| Phone screenshots | 1080 x 1920 px (or 16:9) | PNG or JPEG, min 2, max 8 | Yes |
| 7" tablet screenshots | 1200 x 1920 px | PNG or JPEG | No |
| 10" tablet screenshots | 1600 x 2560 px | PNG or JPEG | No |
| Promo video | YouTube URL | N/A | No |

### Apple App Store

| Asset | Dimensions | Format | Required? |
|-------|-----------|--------|-----------|
| App icon | 1024 x 1024 px | PNG (no alpha, no rounded corners) | Yes |
| iPhone 6.9" screenshots | 1320 x 2868 px | PNG or JPEG, min 3, max 10 | Yes |
| iPhone 6.7" screenshots | 1290 x 2796 px | PNG or JPEG, min 3, max 10 | Yes |
| iPhone 6.5" screenshots | 1242 x 2688 px | PNG or JPEG, min 3, max 10 | Recommended |
| iPad Pro 13" screenshots | 2048 x 2732 px | PNG or JPEG | Only if supporting iPad |
| App preview video | Up to 30 seconds | MOV, M4V, MP4 | No |

### Tips for creating assets without a designer:
1. **Canva** (https://canva.com) — Free, drag-and-drop, has mobile app mockup templates
2. **Figma** (https://figma.com) — Free, more control, good for screenshots
3. **Screenshot Maker** — Search "app store screenshot generator" for tools that add device frames around your screenshots
4. Take real screenshots on a phone/emulator, then add device frames and marketing text using Canva

---

## Quick Reference: The Commands You'll Actually Use

### First time setup:
```bash
cd momento/apps/mobile
npm install -g eas-cli
eas login
eas init
pnpm install
```

### Build for Android testing:
```bash
eas build --profile development --platform android
```

### Build for Google Play:
```bash
eas build --profile production --platform android
eas submit --platform android --latest
```

### Build for iOS testing:
```bash
eas build --profile development --platform ios
```

### Build for App Store:
```bash
eas build --profile production --platform ios
eas submit --platform ios --latest
```

### Push a code-only update (no app review):
```bash
eas update --branch production --message "description of changes"
```
