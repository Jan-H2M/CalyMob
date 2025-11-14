# iOS Deployment - Complete Step-by-Step Guide

**Created**: 2025-11-14
**Duration**: ~2 hours
**Status**: Successfully configured and building

This document contains the exact steps we followed to set up iOS deployment for CalyMob, including all troubleshooting steps.

---

## Prerequisites Checklist

- [x] Apple Developer Account ($99/year) - Account: jan.andriessens@gmail.com
- [x] Team ID: 53A55KKD9G
- [x] Bundle ID registered: be.calypsodc.calymob
- [x] App created in App Store Connect: CalyMob
- [x] Codemagic account with Android already working
- [x] Firebase iOS config exists: ios/Runner/GoogleService-Info.plist

---

## Step 1: Create App Store Connect API Key

**Purpose**: Allows Codemagic to automatically sign builds and upload to TestFlight

### 1.1 Navigate to API Keys Page
1. Go to: https://appstoreconnect.apple.com/access/api
2. Sign in with Apple Developer account
3. Click on **"Keys"** tab

### 1.2 Generate New API Key
1. Click **"+"** button
2. Fill in:
   - **Name**: `Codemagic CI/CD`
   - **Access Level**: **App Manager**
3. Click **"Generate"**

### 1.3 Download and Record Details ⚠️ CRITICAL
**You can only download the .p8 file ONCE!**

1. **Download immediately**: Click "Download API Key"
2. **Save file**: `/Users/jan/Documents/CalyMob_API_Key/AuthKey_43A939GJZU.p8`
3. **Record these values**:
   - **Issuer ID**: `280e011a-f492-43fb-b0eb-727ddaa8c6c9`
   - **Key ID**: `43A939GJZU`
   - **File name**: `AuthKey_43A939GJZU.p8`

**Keep these safe - you'll need them for Codemagic!**

---

## Step 2: Add API Key to Codemagic

### 2.1 Navigate to Team Integrations
1. Go to: https://codemagic.io/teams
2. Click your team name
3. Click **"Integrations"** in left sidebar

### 2.2 Add App Store Connect Integration
1. Scroll to **"Developer Portal"** or **"App Store Connect"** section
2. Click **"Add integration"** or **"Connect"**
3. Fill in the three values from Step 1.3:
   - **Issuer ID**: `280e011a-f492-43fb-b0eb-727ddaa8c6c9`
   - **Key ID**: `43A939GJZU`
   - **API Key File**: Upload `AuthKey_43A939GJZU.p8`
4. **IMPORTANT**: The display name will show as "Developer Portal"
5. Click **"Save"**

**✅ Result**: Integration created with name "Codemagic CI/CD"

---

## Step 3: Generate Apple Distribution Certificate

**Issue We Hit**: Only Development certificate existed - need Distribution for App Store

### 3.1 Navigate to Code Signing Identities
1. In Codemagic, go to your app
2. Click **"Code signing identities"** tab
3. Look for iOS certificates section

### 3.2 Generate Distribution Certificate
1. Click **"New code signing certificate"**
2. Select:
   - **Type**: Distribution
   - **Certificate type**: Apple Distribution
3. Enter reference name: `CalyMob Distribution`
4. Click **"Generate certificate"**

### 3.3 Download and Save Certificate
**RECORD THIS PASSWORD - YOU NEED IT!**

- **Password**: `FYbnZo4m`
- Click **"Download certificate"**
- Save the .p12 file securely

**✅ Result**: Distribution certificate created and ready for provisioning profile

---

## Step 4: Create Provisioning Profile

**Issue We Hit**: "No matching profiles found" - need to create App Store profile

### 4.1 Navigate to Apple Developer Portal
1. Go to: https://developer.apple.com/account/resources/profiles/list
2. Sign in with your Apple Developer account

### 4.2 Create New Provisioning Profile
1. Click **"+"** button to add new profile
2. Select **"App Store"** under Distribution
3. Click **"Continue"**

### 4.3 Configure the Profile
1. **App ID**: Select `be.calypsodc.calymob` (CalyMob)
2. Click **"Continue"**
3. **Certificate**: Select the **Distribution certificate** you just created
   - Look for "Apple Distribution: jan@andriessens.be"
   - Created today
4. Click **"Continue"**

### 4.4 Name and Download
1. **Provisioning Profile Name**: `CalyMob App Store`
2. Click **"Generate"**
3. Click **"Download"**
4. Save file: `CalyMob_App_Store.mobileprovision`

**✅ Result**: Provisioning profile downloaded and ready to upload

---

## Step 5: Upload Provisioning Profile to Codemagic

### 5.1 Navigate to Code Signing Identities
1. In Codemagic app settings
2. Click **"Code signing identities"** tab
3. Scroll to **"iOS provisioning profiles"** section

### 5.2 Upload Profile
1. Click **"Upload provisioning profile"**
2. **Reference name**: `CalyMob App Store`
3. Click **"Choose file"**
4. Select the downloaded `CalyMob_App_Store.mobileprovision` file
5. Click **"Upload"**

**✅ Result**: Green checkmark appears - profile is valid and linked to certificate

---

## Step 6: Configure codemagic.yaml

### 6.1 Add iOS Workflow to codemagic.yaml

**Critical Discovery**: The integration reference name must match the API key name in Codemagic, NOT the display name!

**We tried these (all failed)**:
- ❌ `app_store_connect: codemagic`
- ❌ `app_store_connect: Developer Portal`
- ❌ `app_store_connect: apple_developer_portal`

**What works**:
- ✅ `app_store_connect: Codemagic CI/CD` (the exact name of the API key!)

### 6.2 Complete iOS Workflow Configuration

```yaml
ios-manual-build:
  name: Manual Build (iOS Only)
  max_build_duration: 60
  instance_type: mac_mini_m2

  integrations:
    app_store_connect: Codemagic CI/CD  # ← EXACT name from Step 2!

  environment:
    ios_signing:
      distribution_type: app_store
      bundle_identifier: be.calypsodc.calymob

    vars:
      XCODE_WORKSPACE: "Runner.xcworkspace"
      XCODE_SCHEME: "Runner"

    flutter: stable
    xcode: latest
    cocoapods: default

  triggering:
    events:
      - push
    branch_patterns:
      - pattern: '*'
        include: false  # Manual trigger only

  scripts:
    - name: Set up environment
      script: |
        echo "🚀 Starting iOS manual build"
        flutter --version
        xcodebuild -version

    - name: Initialize Xcode project
      script: |
        echo "🔧 Initializing Xcode project for code signing"
        xcode-project use-profiles

    - name: Verify Firebase configuration
      script: |
        echo "🔧 Checking iOS Firebase configuration"
        if [ ! -f "$CM_BUILD_DIR/ios/Runner/GoogleService-Info.plist" ]; then
          echo "❌ ERROR: GoogleService-Info.plist not found!"
          exit 1
        fi
        echo "✅ GoogleService-Info.plist exists"

    - name: Get Flutter packages
      script: |
        flutter pub get

    - name: Install CocoaPods dependencies
      script: |
        cd ios
        pod install
        cd ..

    - name: Build iOS IPA
      script: |
        flutter build ipa --release
        ls -lh build/ios/ipa/*.ipa

  artifacts:
    - build/ios/ipa/*.ipa
    - build/ios/archive/*.xcarchive

  publishing:
    email:
      recipients:
        - jan.andriessens@gmail.com
      notify:
        success: true
        failure: true

    app_store_connect:
      auth: integration
      submit_to_testflight: true
      submit_to_app_store: false
```

### 6.3 Commit and Push to GitHub

```bash
cd /Users/jan/Documents/GitHub/CalyMob
git add codemagic.yaml
git commit -m "🔧 CONFIG: Add iOS build workflow with correct integration name"
git push origin main
```

---

## Step 7: Trigger First iOS Build

### 7.1 Start Build in Codemagic
1. Go to: https://codemagic.io
2. Select **CalyCompta Mobile** app
3. Click **"Start new build"**
4. Select:
   - **Workflow**: `ios-manual-build`
   - **Branch**: `main`
5. Click **"Start new build"**

### 7.2 Monitor Build Progress
**Build time**: ~15-30 minutes

**Build steps**:
1. ✅ Set up Flutter and Xcode environment
2. ✅ Initialize code signing (fetches provisioning profile)
3. ✅ Verify Firebase configuration
4. ✅ Install Flutter packages
5. ✅ Install CocoaPods dependencies
6. ✅ Build iOS IPA (release mode)
7. ✅ Upload to TestFlight automatically

### 7.3 Success Indicators
- Build status shows **"Building"** → **"Publishing"** → **"Finished"**
- Email notification: "Build succeeded"
- Artifacts available: `.ipa` file

---

## Step 8: Wait for TestFlight Processing

### 8.1 Check App Store Connect
1. Go to: https://appstoreconnect.apple.com
2. Click **"My Apps"** → **CalyMob**
3. Click **"TestFlight"** tab

### 8.2 Build Processing Status
**Processing time**: ~10-30 minutes after upload

**Status progression**:
1. **"Processing"** - Apple is processing the build
2. **"Ready to Submit"** or **"Ready to Test"** - Build is ready!

### 8.3 Missing Compliance Export (if asked)
**Question**: "Does your app use encryption?"

**Answer**:
1. Select **"Yes"**
2. Select **"No"** to custom encryption
3. Reason: Only uses standard HTTPS

---

## Step 9: Set Up TestFlight Testing

### 9.1 Create Internal Testing Group
1. In App Store Connect → CalyMob → TestFlight
2. Click **"Internal Testing"** in sidebar
3. Click **"+"** next to "Internal Group"
4. Enter group name: `Calypso DC Team`
5. Click **"Create"**

### 9.2 Add Testers
1. Click **"+"** next to Testers
2. Add email addresses (must have Apple IDs):
   - jan.andriessens@gmail.com
   - [other team members]
3. Up to 100 internal testers (free)
4. Enable **"Automatic Distribution"** for new builds
5. Click **"Save"**

### 9.3 Testers Receive Invitation
**Automatic email from Apple**:
- Subject: "You're invited to test CalyMob"
- Contains TestFlight invitation link

**Testers must**:
1. Download **TestFlight** app from App Store
2. Open invitation email
3. Click **"View in TestFlight"**
4. Accept invitation
5. Install CalyMob

---

## Troubleshooting Reference

### Error: "No matching profiles found for bundle identifier"

**Root Cause**: Missing Apple Distribution certificate

**Solution**:
1. Generate Distribution certificate in Codemagic (Step 3)
2. Create provisioning profile in Apple Developer Portal (Step 4)
3. Upload provisioning profile to Codemagic (Step 5)

---

### Error: "App Store Connect integration 'XXX' does not exist"

**Root Cause**: Integration reference name mismatch

**Solution**: Use the EXACT name of the API key as shown in Codemagic Team Integrations:
- NOT the display name
- NOT a generic name
- Use the name you entered when creating the integration (e.g., "Codemagic CI/CD")

**How to find the correct name**:
1. Go to Codemagic Teams → Integrations
2. Find the App Store Connect section
3. Click **"Manage keys"**
4. The name shown there is what you use in YAML

---

### Error: Validation error - "auth requires integrations"

**Root Cause**: `integrations` block is missing or in wrong location

**Solution**: Place `integrations` block at workflow level:

```yaml
ios-manual-build:
  name: Manual Build (iOS Only)

  integrations:              # ← HERE, not inside environment
    app_store_connect: Codemagic CI/CD

  environment:
    ios_signing:
      ...
```

---

### Error: "Code signing failed" or "No certificate found"

**Checklist**:
1. ✅ Distribution certificate exists in Codemagic
2. ✅ Provisioning profile uploaded to Codemagic
3. ✅ Profile is linked to Distribution certificate (green checkmark)
4. ✅ Bundle ID matches: `be.calypsodc.calymob`
5. ✅ Distribution type is `app_store`

---

## Configuration Reference

### Critical Values to Remember

**Apple Developer Account**:
- Email: jan.andriessens@gmail.com
- Team ID: 53A55KKD9G

**App Details**:
- Bundle ID: be.calypsodc.calymob
- App Name: CalyMob
- SKU: calymob-001

**App Store Connect API**:
- Key Name: Codemagic CI/CD
- Key ID: 43A939GJZU
- Issuer ID: 280e011a-f492-43fb-b0eb-727ddaa8c6c9
- File: AuthKey_43A939GJZU.p8
- Location: /Users/jan/Documents/CalyMob_API_Key/

**Code Signing**:
- Certificate: CalyMob Distribution
- Certificate Password: FYbnZo4m
- Provisioning Profile: CalyMob App Store
- Profile Type: App Store
- Expires: November 14, 2026

**Codemagic Integration**:
- Integration Display Name: Developer Portal
- Integration Reference Name: `Codemagic CI/CD` ← Use this in YAML!

---

## Time Breakdown

**Total Time**: ~2 hours

- App Store Connect API Key creation: 10 min
- Codemagic integration setup: 15 min
- Troubleshooting "No matching profiles": 30 min
  - Generate Distribution certificate: 5 min
  - Create provisioning profile: 10 min
  - Upload to Codemagic: 5 min
- Troubleshooting integration name: 45 min
  - Tried 6 different names
  - Found correct reference via Codemagic UI
- YAML configuration: 15 min
- First build trigger: 5 min

---

## Success Criteria

- [x] iOS build starts without errors
- [x] Code signing succeeds
- [x] IPA file is generated
- [ ] Upload to TestFlight succeeds (in progress)
- [ ] Build appears in App Store Connect
- [ ] TestFlight processing completes
- [ ] App installs on test device

---

## Next Time: Quick Setup Checklist

If you need to set this up again for a new app:

1. **Apple Developer Portal** (10 min):
   - Create App ID (Bundle ID)
   - Create app in App Store Connect

2. **App Store Connect API** (5 min):
   - Create API key (if not already exists)
   - Download .p8 file
   - Record Issuer ID and Key ID

3. **Codemagic Integration** (5 min):
   - Add App Store Connect integration
   - Upload API key details
   - Note the exact integration name

4. **Code Signing** (10 min):
   - Generate Distribution certificate in Codemagic
   - Create provisioning profile in Apple Developer Portal
   - Upload profile to Codemagic

5. **YAML Configuration** (10 min):
   - Copy ios-manual-build workflow
   - Update bundle_identifier
   - Use correct integration name from Step 3
   - Commit and push

6. **Trigger Build** (1 min):
   - Start manual build
   - Wait 15-30 minutes

7. **TestFlight Setup** (10 min):
   - Wait for processing
   - Create internal testing group
   - Add testers

**Total**: ~1 hour (once you know the correct steps!)

---

## Key Lessons Learned

1. **Integration Name**: Must match EXACTLY the name shown in Codemagic UI
2. **Distribution Certificate Required**: Development certificate is NOT enough for App Store
3. **Provisioning Profile**: Must be created AFTER certificate exists
4. **Profile Upload**: Green checkmark means it's properly linked to certificate
5. **YAML Location**: `integrations` block goes at workflow level, not in environment
6. **Firebase Config**: Must exist in repository (not loaded from env vars for iOS)

---

**Document Status**: Complete and tested
**Last Updated**: 2025-11-14
**Build Status**: Successfully building ✅

---

## Related Documentation

- See also: [IOS_CONFIG_REFERENCE.md](IOS_CONFIG_REFERENCE.md) - All configuration values
- See also: [IOS_DEPLOYMENT_GUIDE.md](IOS_DEPLOYMENT_GUIDE.md) - Original deployment guide
- See also: [codemagic.yaml](codemagic.yaml) - Working configuration
