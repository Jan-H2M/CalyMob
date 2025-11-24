# 🏪 CalyCompta - App Store Publication Checklist

## ✅ PHASE 1: Preparation (Do Now)

### 1. Apple Developer Account
- [ ] Register at https://developer.apple.com/programs/enroll/
- [ ] Choose "Organization" (Calypso Diving Club)
- [ ] Get D-U-N-S number (free, takes 5-14 days)
- [ ] Upload proof of legal entity (KBO extract Belgium)
- [ ] Pay $99/year
- [ ] Wait for approval (2-10 business days)

### 2. Xcode Installation
- [ ] Open App Store
- [ ] Search "Xcode"
- [ ] Install (~15 GB, 1-2 hours)
- [ ] Run: `sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer`
- [ ] Run: `sudo xcodebuild -runFirstLaunch`
- [ ] Accept license agreement

### 3. CocoaPods
```bash
sudo gem install cocoapods
cd /Users/jan/Documents/GitHub/CalyCompta/calycompta_mobile/ios
pod install
```

## ✅ PHASE 2: App Store Connect Setup

### 4. Register App
- [ ] Go to https://appstoreconnect.apple.com
- [ ] Click "My Apps" → "+" → "New App"
- [ ] Platform: iOS
- [ ] Name: CalyCompta
- [ ] Primary Language: French
- [ ] Bundle ID: be.calypso.calycompta (check availability first!)
- [ ] SKU: CALYCOMPTA001

### 5. App Metadata

#### Required Assets:
- [ ] App Icon (1024x1024 px, no transparency, PNG)
- [ ] iPhone 6.7" Screenshots (1290x2796 px) - min 1, max 10
- [ ] iPhone 5.5" Screenshots (1242x2208 px) - min 1, max 10

#### Text Content:
- [ ] App Name: CalyCompta
- [ ] Subtitle (30 chars): Gestion comptable pour clubs
- [ ] Description (4000 chars max):
```
CalyCompta est l'application de gestion comptable pour le Calypso Diving Club.

Fonctionnalités:
• Suivi des dépenses et remboursements
• Gestion des demandes de remboursement
• Approbation des dépenses
• Intégration Firebase pour synchronisation temps réel

Réservée aux membres du club Calypso.
```

- [ ] Keywords (100 chars): comptabilité,plongée,club,finances,calypso,remboursement,dépenses
- [ ] Support URL: https://calypso.be/support (ou votre support email)
- [ ] Marketing URL (optional): https://calypso.be
- [ ] Privacy Policy URL: https://calypso.be/privacy (REQUIRED!)

#### App Information:
- [ ] Category: Primary: Finance, Secondary: Productivity
- [ ] Content Rights: Does not contain third-party content
- [ ] Age Rating: 4+ (no objectionable content)
- [ ] Copyright: © 2025 Calypso Diving Club

#### Pricing:
- [ ] Price: Free
- [ ] Availability: Belgium only (or worldwide)

## ✅ PHASE 3: Build & Upload

### 6. Configure Xcode Project
```bash
cd /Users/jan/Documents/GitHub/CalyCompta/calycompta_mobile

# Open Xcode project
open ios/Runner.xcworkspace
```

In Xcode:
- [ ] Select "Runner" project in left sidebar
- [ ] Select "Runner" target under TARGETS
- [ ] General tab:
  - [ ] Display Name: CalyCompta
  - [ ] Bundle Identifier: be.calypso.calycompta
  - [ ] Version: 1.0.0
  - [ ] Build: 1
- [ ] Signing & Capabilities tab:
  - [ ] Team: Select your Apple Developer Account
  - [ ] Automatically manage signing: ✓ Enabled
  - [ ] Bundle Identifier: be.calypso.calycompta

### 7. Add App Icon
- [ ] Create 1024x1024 PNG icon (no transparency)
- [ ] In Xcode: Assets.xcassets → AppIcon
- [ ] Drag icon to "App Store iOS" slot

### 8. Build Release Version
```bash
# Clean previous builds
flutter clean

# Get dependencies
flutter pub get

# Build IPA for App Store
flutter build ipa --release
```

Output: `build/ios/ipa/calycompta_mobile.ipa`

### 9. Upload to App Store Connect

**Option A: Via Xcode**
```bash
# Open Xcode
open build/ios/archive/Runner.xcarchive

# In Xcode Organizer:
# 1. Click "Distribute App"
# 2. Choose "App Store Connect"
# 3. Click "Upload"
# 4. Wait for upload to complete
```

**Option B: Via Transporter App**
```bash
# Download Transporter from App Store
# Open Transporter
# Drag calycompta_mobile.ipa
# Click "Deliver"
```

## ✅ PHASE 4: App Review Submission

### 10. Submit for Review
In App Store Connect:
- [ ] Go to "App Store" tab
- [ ] Click "1.0 Prepare for Submission"
- [ ] Fill all required fields (screenshots, description, etc.)
- [ ] App Review Information:
  - [ ] Demo account username: demo@calypso.be
  - [ ] Demo account password: demo123 (create test account!)
  - [ ] Notes: "App for Calypso Diving Club members only"
- [ ] Click "Submit for Review"

### 11. Wait for Review
- ⏱️ Initial review: 24-48 hours average
- ⏱️ Full review: 2-7 days
- 📧 You'll receive email updates

### 12. Review Outcomes

**If Approved ✅**
- App goes live automatically (or on scheduled date)
- Members can download from App Store!

**If Rejected ❌**
- Read rejection reason carefully
- Fix issues
- Resubmit (no extra fee)
- Common rejections:
  - Missing demo account
  - Broken features
  - Privacy policy issues
  - Misleading screenshots

## ✅ PHASE 5: Post-Launch

### 13. Monitor & Update
- [ ] Check reviews in App Store Connect
- [ ] Respond to user feedback
- [ ] Fix bugs and push updates
- [ ] Update version number for each release

### 14. Future Updates
```bash
# Increment version
# In pubspec.yaml: version: 1.0.1+2

# Build new release
flutter build ipa --release

# Upload to App Store Connect
# Submit for review (faster than initial)
```

---

## 📋 Quick Commands Reference

```bash
# Check if Xcode is properly installed
xcode-select -p

# Install CocoaPods
sudo gem install cocoapods

# Install iOS dependencies
cd ios && pod install && cd ..

# Clean and rebuild
flutter clean && flutter pub get

# Build for App Store
flutter build ipa --release

# Run on connected iPhone (for testing)
flutter run --release

# Check for issues
flutter doctor
```

---

## 🆘 Common Issues & Solutions

### "No valid code signing identity found"
→ Make sure you selected your Team in Xcode signing settings

### "CocoaPods not installed"
→ Run: `sudo gem install cocoapods`

### "Bundle ID already in use"
→ Change bundle ID in Xcode and App Store Connect

### "Missing compliance"
→ In App Store Connect, answer export compliance questions

---

## 📞 Support Resources

- Apple Developer Forums: https://developer.apple.com/forums/
- Flutter iOS Deployment: https://docs.flutter.dev/deployment/ios
- App Store Review Guidelines: https://developer.apple.com/app-store/review/guidelines/

---

## 💰 Costs Summary

| Item | Cost | Frequency |
|------|------|-----------|
| Apple Developer | $99 | Per year |
| D-U-N-S Number | Free | One-time |
| App Review | Free | Per submission |
| **TOTAL YEAR 1** | **$99** | - |
| **TOTAL YEAR 2+** | **$99** | Annual renewal |

---

## ⏰ Timeline Estimate

| Phase | Duration |
|-------|----------|
| Developer Account Approval | 2-10 days |
| Xcode Installation | 1-2 hours |
| App Preparation | 2-4 hours |
| Build & Upload | 1 hour |
| App Review | 2-7 days |
| **TOTAL** | **~2-3 weeks** |

---

## 🎯 Current Status

- [ ] Phase 1: Preparation
- [ ] Phase 2: App Store Connect Setup
- [ ] Phase 3: Build & Upload
- [ ] Phase 4: App Review
- [ ] Phase 5: Live on App Store! 🎉
