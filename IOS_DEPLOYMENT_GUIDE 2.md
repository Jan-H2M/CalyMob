# 📱 CalyCompta iOS Deployment Guide

**Status**: ✅ CocoaPods & Basis Setup Compleet | 📋 Volgende Stappen

---

## ✅ Voltooid

### Fase 1: Ontwikkelomgeving
- ✅ Apple Developer Account ($99/jaar)
- ✅ Xcode 26.1 geïnstalleerd
- ✅ Ruby 3.4.7 (via Homebrew)
- ✅ CocoaPods 1.16.2
- ✅ iOS Dependencies: 28 pods geïnstalleerd
- ✅ iOS Deployment Target: iOS 15.0
- ✅ Camera & Photo Library permissions in Info.plist

---

## 📋 TODO: Volgende Stappen

### Stap 1: Firebase iOS App Registreren

**1.1 Ga naar Firebase Console**
- URL: https://console.firebase.google.com
- Project: `calycompta`

**1.2 Registreer iOS App**
1. Klik op "Add app" → iOS
2. **iOS bundle ID**: `be.calypso.calycompta`
   - ⚠️ Dit moet exact overeenkomen met Xcode project
3. **App nickname**: CalyCompta iOS
4. **App Store ID**: (Laat leeg voor nu)

**1.3 Download GoogleService-Info.plist**
1. Download het bestand
2. Plaats in `/Users/jan/Documents/GitHub/CalyCompta/calycompta_mobile/ios/Runner/`
3. Controleer dat het bestand heet: `GoogleService-Info.plist` (hoofdlettergevoelig!)

**1.4 Voeg bestand toe aan Xcode**
```bash
# Open Xcode project
cd /Users/jan/Documents/GitHub/CalyCompta/calycompta_mobile
open ios/Runner.xcworkspace
```

In Xcode:
- Right-click op "Runner" folder (links in sidebar)
- Kies "Add Files to Runner..."
- Selecteer `GoogleService-Info.plist`
- ✅ Vink "Copy items if needed" aan
- ✅ Vink "Runner" target aan
- Klik "Add"

---

### Stap 2: Bundle Identifier Configureren

**In Xcode (Runner.xcworkspace moet open zijn):**

1. Klik op "Runner" project (blauw icon, linksboven)
2. Selecteer "Runner" target (onder TARGETS)
3. Ga naar "Signing & Capabilities" tab
4. **Team**: Selecteer je Apple Developer Account email
5. **Bundle Identifier**: Verander naar `be.calypso.calycompta`
6. ✅ "Automatically manage signing" moet aangevinkt zijn

**Troubleshooting:**
- Als "Failed to register bundle identifier": Bundle ID is al in gebruik
  - Probeer: `be.calypso.calycompta.app` of `be.calypso.calycomptamobile`
  - Update ook in Firebase Console!

---

### Stap 3: App Display Name Aanpassen

**In Xcode:**
1. Klik op "Runner" project → "Runner" target
2. Ga naar "General" tab
3. **Display Name**: Verander naar `CalyCompta`
4. **Version**: `1.0.0`
5. **Build**: `1`

---

### Stap 4: App Icon Toevoegen (Optioneel maar Aanbevolen)

**Handmatige methode:**
1. Gebruik bestaand logo: `/Users/jan/Documents/GitHub/CalyCompta/calycompta_mobile/assets/images/logo-vertical.png`
2. Converteer naar 1024x1024 PNG (gebruik Preview of online tool)
3. In Xcode: klik op `Assets.xcassets`
4. Klik op `AppIcon`
5. Drag & drop 1024x1024 image in "App Store iOS" slot

**Quick tool:**
```bash
# Via browser: https://appicon.co
# Upload logo-vertical.png
# Download iOS icon set
# Extract en plaats in Assets.xcassets/AppIcon.appiconset/
```

---

### Stap 5: Test Build (Lokaal op Simulator)

```bash
cd /Users/jan/Documents/GitHub/CalyCompta/calycompta_mobile

# Check Flutter status
~/development/flutter/bin/flutter doctor -v

# Clean build
~/development/flutter/bin/flutter clean
~/development/flutter/bin/flutter pub get

# Build voor iOS (simulator test)
~/development/flutter/bin/flutter build ios --release --no-codesign

# Of run op simulator
~/development/flutter/bin/flutter run -d "iPhone 15 Pro" --release
```

**Verwachte output:**
```
✓ Built build/ios/iphoneos/Runner.app
```

---

### Stap 6: Echte Device Test (Optioneel)

**Vereist:** iPhone met USB kabel

```bash
# List connected devices
~/development/flutter/bin/flutter devices

# Run op fysieke iPhone
~/development/flutter/bin/flutter run -d <device-id> --release
```

**Eerste keer:**
- iPhone zal waarschuwen: "Untrusted Developer"
- Ga op iPhone naar: Settings → General → VPN & Device Management
- Trust je developer certificate

---

### Stap 7: TestFlight Build

**7.1 Archive maken in Xcode**
1. Zorg dat "Any iOS Device (arm64)" geselecteerd is (niet simulator!)
2. Product menu → Archive
3. Wacht ~10-20 minuten (eerste keer duurt lang)

**7.2 Upload naar App Store Connect**
1. Xcode Organizer opent automatisch
2. Selecteer je archive
3. Klik "Distribute App"
4. Kies "App Store Connect"
5. Klik "Upload"
6. Wacht ~5-10 minuten voor upload

**7.3 App Store Connect Setup**
1. Ga naar https://appstoreconnect.apple.com
2. Klik "My Apps" → "+" → "New App"
3. Vul in:
   - **Platform**: iOS
   - **Name**: CalyCompta
   - **Primary Language**: French
   - **Bundle ID**: be.calypso.calycompta (moet exact matchen!)
   - **SKU**: CALYCOMPTA001
   - **User Access**: Full Access

**7.4 TestFlight Configureren**
1. Ga naar "TestFlight" tab
2. Wacht tot build status = "Ready to Submit"
3. Klik op build → "External Testing" (of "Internal Testing")
4. Voeg testers toe:
   - Email adressen van je 5-6 gebruikers
   - Ze ontvangen uitnodiging via email
5. Klik "Start Testing"

---

### Stap 8: Gebruikers Uitnodigen

**Email naar testers:**

```
Subject: TestFlight Uitnodiging - CalyCompta iOS App

Beste [Naam],

Je bent uitgenodigd om de CalyCompta iOS app te testen via TestFlight.

Stappen:
1. Download "TestFlight" app uit de App Store
2. Open de uitnodigingslink in je email van Apple
3. Installeer CalyCompta via TestFlight
4. Login met je bestaande CalyCompta credentials

De app werkt hetzelfde als de web versie, maar nu met:
- Camera toegang voor bonnetjes
- Foto's uit je bibliotheek
- Native iOS ervaring

Bij problemen, laat het me weten!

Groet,
Jan
```

---

## 🔧 Troubleshooting

### "No valid code signing identity found"
→ Controleer dat je Team correct geselecteerd is in Xcode

### "Bundle identifier is already in use"
→ Kies andere bundle ID (bijv. be.calypso.calycompta.app)

### "CocoaPods could not find compatible versions"
→ Dit is al opgelost (iOS 15.0 platform in Podfile)

### "Missing GoogleService-Info.plist"
→ Controleer dat bestand in ios/Runner/ staat EN toegevoegd is in Xcode

### "Archive failed - signing error"
→ Ga naar Xcode → Preferences → Accounts → Download Manual Profiles

---

## 📞 Support Resources

- **Apple Developer**: https://developer.apple.com/support/
- **Firebase iOS Setup**: https://firebase.google.com/docs/ios/setup
- **Flutter iOS Deployment**: https://docs.flutter.dev/deployment/ios
- **TestFlight Guide**: https://developer.apple.com/testflight/

---

## 💰 Kosten Overzicht

| Item | Kost | Frequentie |
|------|------|------------|
| Apple Developer | $99 | Per jaar |
| TestFlight | Gratis | Onbeperkt |
| App Store Publicatie | Gratis | Optioneel |

**Totaal Year 1**: $99

---

## ⏱️ Tijdsinschatting

| Fase | Duur |
|------|------|
| Firebase Config | 15 min |
| Xcode Setup | 30 min |
| Test Build | 20 min |
| Archive & Upload | 1-2 uur |
| TestFlight Activatie | 30 min |
| **TOTAAL** | **~3-4 uur** |

*+ Apple processing tijd: 5-30 min na upload*

---

## 🎯 Huidige Status

- [x] Ontwikkelomgeving klaar
- [x] CocoaPods dependencies
- [x] iOS permissions configured
- [ ] Firebase iOS app registered
- [ ] GoogleService-Info.plist toegevoegd
- [ ] Bundle ID configured in Xcode
- [ ] Test build succesvol
- [ ] Archive gemaakt
- [ ] Uploaded naar TestFlight
- [ ] Testers uitgenodigd
- [ ] **LIVE** 🎉

---

**Volgende concrete actie**: Ga naar Firebase Console en registreer iOS app met bundle ID `be.calypso.calycompta`
