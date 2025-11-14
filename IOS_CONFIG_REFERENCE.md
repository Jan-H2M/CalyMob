# iOS Configuration Reference - CalyMob

**Document Created**: 2025-11-14
**Purpose**: Complete reference of all iOS deployment configuration

---

## Apple Developer Account

- **Account Email**: jan.andriessens@gmail.com (jan@andriessens.be)
- **Team ID**: 53A55KKD9G
- **Status**: Active ($99/year paid)

---

## Bundle ID & App Information

- **Bundle ID**: `be.calypsodc.calymob`
- **App Name**: CalyMob
- **Display Name**: CalyMob
- **SKU**: calymob-001
- **Primary Language**: French (France)
- **Category**: Productivity

---

## App Store Connect API Key

**Created**: 2025-11-14

- **Key Name**: Codemagic CI/CD
- **Key ID**: `43A939GJZU`
- **Issuer ID**: `280e011a-f492-43fb-b0eb-727ddaa8c6c9`
- **File**: AuthKey_43A939GJZU.p8
- **Access Level**: App Manager
- **Location**: `/Users/jan/Documents/CalyMob_API_Key/AuthKey_43A939GJZU.p8`

---

## Codemagic Configuration

### Team Integration Names

1. **Developer Portal Integration**
   - Display Name: "Developer Portal"
   - Type: Apple Developer Portal API
   - Uses: App Store Connect API Key (43A939GJZU)
   - Status: Connected ✅
   - YAML Reference: `apple_developer_portal`

2. **Codemagic API**
   - Display Name: "Codemagic API"
   - Key: (masked)
   - Status: Connected ✅

### Code Signing Identities

#### iOS Certificates
1. **Apple Development Certificate**
   - Type: Development
   - Identity: Apple Development: jan@andriessens.be
   - Status: Active
   - **Note**: This is NOT used for App Store builds

2. **Apple Distribution Certificate** ✅
   - Type: Distribution
   - Reference Name: CalyMob Distribution
   - Password: `FYbnZo4m`
   - File Downloaded: Yes
   - Status: Active
   - **Note**: THIS is the certificate used for App Store/TestFlight builds

#### iOS Provisioning Profiles
1. **CalyMob App Store Profile** ✅
   - Reference Name: CalyMob App Store
   - Type: app_store
   - Bundle ID: be.calypsodc.calymob
   - Certificate: CalyMob Distribution (linked)
   - Expires: November 14, 2026
   - File: CalyMob_App_Store.mobileprovision
   - Status: Uploaded to Codemagic ✅

---

## Firebase Configuration

### iOS Firebase
- **File**: `ios/Runner/GoogleService-Info.plist`
- **Status**: Exists in repository ✅
- **Bundle ID**: be.calypsodc.calymob
- **Project ID**: calycompta
- **Storage Bucket**: calycompta.firebasestorage.app
- **Google App ID**: 1:328464166969:ios:59423f69116580ea8f5de8
- **API Key**: AIzaSyA8x4V38ICW3FE1Ox4VS8zN4vCpQbL5a8A

---

## Xcode Project Configuration

- **Workspace**: Runner.xcworkspace
- **Scheme**: Runner
- **Bundle ID**: be.calypsodc.calymob (verified in project.pbxproj)
- **Info.plist Permissions**:
  - NSCameraUsageDescription: ✅
  - NSPhotoLibraryUsageDescription: ✅

---

## Codemagic YAML Configuration

### Integration Reference
```yaml
integrations:
  app_store_connect: apple_developer_portal
```

### iOS Signing
```yaml
ios_signing:
  distribution_type: app_store
  bundle_identifier: be.calypsodc.calymob
```

### Publishing
```yaml
app_store_connect:
  auth: integration
  submit_to_testflight: true
  submit_to_app_store: false
```

---

## App Store Connect

### App Entry
- **App Name**: CalyMob
- **Bundle ID**: be.calypsodc.calymob
- **Status**: Created ✅
- **URL**: https://appstoreconnect.apple.com

### TestFlight
- **Status**: Not yet configured (pending first build)
- **Next Step**: Set up internal testing group after first successful build

---

## Git Repository

- **Repository**: https://github.com/Jan-H2M/CalyCompta-Mobile.git
- **Branch**: main
- **Latest Commit**: b7bc036 (Fix integration reference to apple_developer_portal)

---

## Build Workflow

### Workflow Name
`ios-manual-build`

### Trigger
- Manual only (no automatic triggers on push)
- Branch: Any (pattern: '*' with include: false)

### Build Steps
1. Set up environment (Flutter + Xcode versions)
2. Initialize Xcode project (`xcode-project use-profiles`)
3. Verify Firebase configuration
4. Get Flutter packages
5. Install CocoaPods dependencies
6. Build iOS IPA (release mode)
7. Upload to TestFlight (automatic)

### Build Machine
- Instance: mac_mini_m2
- Max Duration: 60 minutes

---

## Troubleshooting Notes

### Issue: "App Store Connect integration does not exist"
**Root Cause**: Integration reference name mismatch in codemagic.yaml

**Attempted Solutions**:
1. ❌ `app_store_connect: codemagic`
2. ❌ `app_store_connect: Developer Portal`
3. ✅ `app_store_connect: apple_developer_portal` (CORRECT)

### Issue: "No matching profiles found"
**Root Cause**: Missing Apple Distribution certificate

**Solution**:
1. Generated Distribution certificate via Codemagic
2. Created provisioning profile in Apple Developer Portal
3. Uploaded profile to Codemagic
4. Status: ✅ Resolved

---

## Next Steps (After First Successful Build)

1. **TestFlight Setup**
   - Create internal testing group: "Calypso DC Team"
   - Add testers (email addresses with Apple IDs)
   - Enable automatic distribution

2. **Testing**
   - Install TestFlight on iPhone
   - Accept beta invitation
   - Test core features

3. **Optional: App Store Submission**
   - Complete store listing
   - Add screenshots (6.7" iPhone: 2796 x 1290 px)
   - Create demo account for App Review
   - Submit for review

---

## Important File Locations

### Local Machine
- API Key: `/Users/jan/Documents/CalyMob_API_Key/AuthKey_43A939GJZU.p8`
- Distribution Certificate: Downloaded (password: FYbnZo4m)
- Provisioning Profile: Downloaded CalyMob_App_Store.mobileprovision

### Repository
- Codemagic Config: `/Users/jan/Documents/GitHub/CalyMob/codemagic.yaml`
- Firebase Config: `/Users/jan/Documents/GitHub/CalyMob/ios/Runner/GoogleService-Info.plist`
- Xcode Project: `/Users/jan/Documents/GitHub/CalyMob/ios/Runner.xcodeproj`

---

## Status Checklist

- [x] Apple Developer Account approved
- [x] Bundle ID registered (be.calypsodc.calymob)
- [x] App created in App Store Connect
- [x] App Store Connect API key created
- [x] API key added to Codemagic (Developer Portal integration)
- [x] Apple Distribution certificate generated
- [x] Provisioning profile created and uploaded
- [x] Firebase iOS configuration exists
- [x] iOS workflow added to codemagic.yaml
- [x] Configuration pushed to GitHub
- [ ] **First iOS build successful** ⏳
- [ ] TestFlight configured
- [ ] App tested on iOS device

---

**Last Updated**: 2025-11-14 23:30 UTC
