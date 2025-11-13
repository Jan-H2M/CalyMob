# 🚀 Codemagic.io CI/CD Setup Guide

**Versie**: 1.0.0
**Laatst bijgewerkt**: 12 november 2025
**Status**: 📋 Setup Guide (nog niet geïmplementeerd)

---

## 🎯 Waarom Codemagic?

**Probleem**: iOS deployment via Xcode is complex en frustrerend
- Code signing hell (certificates, provisioning profiles)
- Mac hardware vereist
- Handmatige builds zijn tijdrovend
- Inconsistente builds ("works on my machine")

**Oplossing**: Codemagic.io - Gespecialiseerde CI/CD voor Flutter
- ✅ **Automatische iOS code signing** (geen manual certificates!)
- ✅ **Cloud Mac machines** (M2) - geen eigen Mac nodig
- ✅ **Flutter-first** - preconfigured voor Flutter apps
- ✅ **Gratis tier**: 500 min/maand (genoeg voor 20 builds)
- ✅ **Build iOS + Android** in één workflow

---

## 📋 Prerequisites Checklist

### Wat Je Al Hebt ✅

- [x] Flutter app volledig functioneel
- [x] Firebase geconfigureerd (calycompta project)
- [x] CocoaPods geïnstalleerd (iOS dependencies)
- [x] GitHub repo: https://github.com/Jan-H2M/CalyCompta-Mobile
- [x] Deployment guides (DEPLOYMENT_GUIDE.md, IOS_DEPLOYMENT_GUIDE.md)

### Wat Je Nog Nodig Hebt ⚠️

#### A. Apple Developer Account
- [ ] Active Apple Developer Program membership ($99/jaar)
- [ ] Access tot App Store Connect
- [ ] **App Store Connect API Key** (voor automatic code signing)

**Hoe te maken**:
1. Ga naar [App Store Connect](https://appstoreconnect.apple.com)
2. Users and Access → Keys (tab)
3. Klik "+" om nieuwe key te genereren
4. **Name**: `Codemagic CI/CD`
5. **Access**: Developer (of App Manager voor publishing)
6. Download `.p8` file (⚠️ Bewaar veilig! Kan niet opnieuw downloaden)
7. Noteer: **Key ID** en **Issuer ID**

#### B. Firebase Configuration Files
- [ ] `google-services.json` (Android) - Download van Firebase Console
- [ ] `GoogleService-Info.plist` (iOS) - Download van Firebase Console

**Hoe te downloaden**:
1. [Firebase Console](https://console.firebase.google.com) → Project `calycompta`
2. Project Settings → General
3. Scroll naar "Your apps"
4. Android app → Download `google-services.json`
5. iOS app → Download `GoogleService-Info.plist`

⚠️ **BELANGRIJK**: Commit deze bestanden NIET naar Git! (staat al in `.gitignore`)

#### C. Android Keystore
- [ ] Keystore file (`.jks` of `.keystore`)
- [ ] Keystore password
- [ ] Key alias
- [ ] Key password

**Als je nog geen keystore hebt**:
```bash
keytool -genkey -v -keystore ~/calycompta-key.jks \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -alias calycompta

# Vul in:
# - Password: [Kies sterk wachtwoord]
# - Name: Calypso Diving Club
# - Organization: Calypso DC
# - City: [Je stad]
# - Country: BE

# Keystore opgeslagen in: ~/calycompta-key.jks
```

⚠️ **Bewaar keystore veilig**: Als je deze verliest, kan je app NOOIT meer updaten!

#### D. Google Play Console (Optioneel - voor automatische publishing)
- [ ] Google Play Developer account ($25 one-time fee)
- [ ] App aangemaakt in Play Console
- [ ] Service Account JSON key

---

## 🚀 Setup Stappen (45 minuten)

### Stap 1: Codemagic Account (5 min)

1. Ga naar https://codemagic.io/signup
2. Klik **Sign up with GitHub**
3. Authoriseer Codemagic voor je repos

### Stap 2: Repository Connecteren (5 min)

1. Dashboard → **Add Application**
2. Selecteer **GitHub**
3. Kies: `Jan-H2M/CalyCompta-Mobile`
4. Configuratie methode: **Flutter App** (GUI mode - makkelijkst voor eerste keer)

### Stap 3: iOS Code Signing Configureren (15 min)

**Optie A: Automatic Code Signing** (Aanbevolen!)

1. In Codemagic: **Team Settings** → **Integrations**
2. **Apple Developer Portal** → **Add API Key**
3. Upload `.p8` file (App Store Connect API Key)
4. Vul in:
   - **Key ID**: [uit App Store Connect]
   - **Issuer ID**: [uit App Store Connect]
5. Save

Dan in workflow editor:
6. **iOS Settings** → **Code Signing**
7. Selecteer: **Automatic**
8. **Bundle ID**: `be.calypso.calycompta`
9. **Team**: Selecteer je Apple team
10. Save

**Optie B: Manual Code Signing** (Als je al certificates hebt)

1. Export certificate uit Keychain:
   - Open Keychain Access (Mac)
   - Selecteer "iPhone Distribution" certificate
   - Right-click → Export → Save as `.p12`
   - Kies wachtwoord

2. In Codemagic: **Team Settings** → **Code Signing Identities**
3. **iOS Certificates** → Upload `.p12` + wachtwoord
4. **iOS Provisioning Profiles** → Upload `.mobileprovision`

### Stap 4: Android Code Signing (10 min)

1. **Team Settings** → **Code Signing Identities**
2. **Android** → Upload keystore (`.jks` bestand)
3. Vul in:
   - **Keystore password**: [je keystore password]
   - **Key alias**: `calycompta`
   - **Key password**: [je key password]
4. Save

### Stap 5: Firebase Configuratie (10 min)

**Methode: Base64 Environment Variables** (Veiligst - geen files in Git!)

1. **Encode config files naar base64**:
   ```bash
   cd /Users/jan/Documents/GitHub/CalyCompta/calycompta_mobile

   # Android
   base64 android/app/google-services.json > ~/android-firebase-base64.txt

   # iOS
   base64 ios/Runner/GoogleService-Info.plist > ~/ios-firebase-base64.txt
   ```

2. In Codemagic: **Workflow Editor** → **Environment Variables**
3. Add variable:
   - **Name**: `ANDROID_FIREBASE_JSON`
   - **Value**: [Kopieer inhoud van `android-firebase-base64.txt`]
   - **Secure**: ✅ Aanvinken!
4. Add variable:
   - **Name**: `IOS_FIREBASE_PLIST`
   - **Value**: [Kopieer inhoud van `ios-firebase-base64.txt`]
   - **Secure**: ✅ Aanvinken!

⚠️ **Verwijder de base64 txt files daarna**:
```bash
rm ~/android-firebase-base64.txt ~/ios-firebase-base64.txt
```

---

## 📝 Workflow Configuratie

### Optie A: GUI Workflow (Makkelijkst)

In Codemagic workflow editor:

**Build Settings**:
- **Flutter version**: `stable` (of `3.24.5` voor specifieke versie)
- **Build mode**: `release`
- **iOS**: Build IPA
- **Android**: Build App Bundle (AAB)

**Scripts** (Pre-build):
```bash
#!/bin/bash

# Load Firebase configs from environment variables
echo $ANDROID_FIREBASE_JSON | base64 --decode > $CM_BUILD_DIR/android/app/google-services.json
echo $IOS_FIREBASE_PLIST | base64 --decode > $CM_BUILD_DIR/ios/Runner/GoogleService-Info.plist

# Verify files exist
ls -la $CM_BUILD_DIR/android/app/google-services.json
ls -la $CM_BUILD_DIR/ios/Runner/GoogleService-Info.plist
```

**Publishing** (Optioneel):
- **iOS**: TestFlight (automatic submission)
- **Android**: Google Play Internal Testing

### Optie B: codemagic.yaml (Advanced)

Als je `codemagic.yaml` gebruikt (in project root), zie het bestand voor volledige configuratie.

**Voordelen yaml**:
- Version controlled (in Git)
- Code review mogelijk
- Portabel naar andere projecten

---

## 🧪 Eerste Test Build

1. In Codemagic Dashboard → **Start New Build**
2. Selecteer branch: `main`
3. Klik **Start Build**
4. **Monitor logs** (real-time)
5. Wacht ~15-20 minuten (eerste build duurt langer door caching)
6. Download artifacts:
   - iOS: `.ipa` bestand
   - Android: `.aab` bestand

**Verwachte output**:
```
✓ Flutter packages get
✓ Loading Firebase configs
✓ Flutter build ipa --release (iOS)
✓ Flutter build appbundle --release (Android)
✓ Code signing (iOS)
✓ Publishing artifacts
Build succeeded in 18m 32s
```

---

## ⚙️ codemagic.yaml Referentie

Zie `codemagic.yaml` in project root voor volledige configuratie.

**Key sections**:
- `workflows`: iOS en Android workflows
- `environment`: Flutter/Xcode versies, signing configs
- `scripts`: Pre-build (Firebase), build commands
- `artifacts`: Output bestanden (.ipa, .aab)
- `publishing`: TestFlight, Google Play

**Triggering**:
- Push naar `main` → Production builds
- Push naar `develop` → Beta builds
- Pull requests → Build validation only

---

## 🐛 Troubleshooting

### Build Fails: "No valid code signing certificates"

**Oorzaak**: iOS code signing niet correct

**Oplossing**:
1. Verifieer App Store Connect API Key (Team Settings → Integrations)
2. Check Bundle ID: moet `be.calypso.calycompta` zijn
3. Probeer workflow opnieuw (Codemagic genereert certificaat automatisch)

### Build Fails: "Firebase configuration not found"

**Oorzaak**: Environment variables niet correct

**Oplossing**:
1. Verifieer dat `ANDROID_FIREBASE_JSON` en `IOS_FIREBASE_PLIST` bestaan in Environment Variables
2. Check of ze gemarkeerd zijn als **Secure**
3. Test base64 decode lokaal:
   ```bash
   echo $ANDROID_FIREBASE_JSON | base64 --decode | python -m json.tool
   # Moet valid JSON output geven
   ```

### Build Timeout (>120 min)

**Oorzaak**: Dependencies te groot of netwerk issues

**Oplossing**:
1. Enable caching in workflow:
   ```yaml
   cache:
     cache_paths:
       - $FLUTTER_ROOT/.pub-cache
       - $HOME/.gradle/caches
   ```
2. Optimize `pubspec.yaml` (verwijder ongebruikte dependencies)

### iOS Pod Install Fails

**Oorzaak**: CocoaPods dependency conflicts

**Oplossing**:
```yaml
scripts:
  - name: Clean iOS dependencies
    script: |
      cd ios
      rm -rf Pods Podfile.lock
      pod install --repo-update
```

---

## 💰 Kosten & Free Tier

### Free Tier (500 min/maand)

**Inbegrepen**:
- ✅ 500 build minuten/maand (macOS M2)
- ✅ 1 concurrent build
- ✅ Tot 2 team members
- ✅ Alle core features

**Capaciteit**:
- iOS build: ~15 min
- Android build: ~10 min
- Combined: ~25 min per build
- **~20 builds/maand mogelijk** (1x/week releases = 4 builds = 100 min)

✅ **Conclusie**: Free tier is RUIM VOLDOENDE voor je gebruik!

### Paid Plans

Als je free tier te klein wordt:
- **Professional** ($99/maand): 1000 min, 3 concurrent builds
- **Team** ($399/maand): 5000 min, 10 concurrent builds

---

## 📚 Nuttige Resources

- **Codemagic Docs**: https://docs.codemagic.io
- **Flutter Quickstart**: https://docs.codemagic.io/yaml-quick-start/building-a-flutter-app/
- **iOS Code Signing**: https://docs.codemagic.io/flutter-code-signing/ios-code-signing/
- **Firebase Config Loading**: https://docs.codemagic.io/knowledge-firebase/load-firebase-configuration/
- **Codemagic Slack**: https://codemagic-io.slack.com (community support)

---

## ✅ Na Setup Checklist

- [ ] Codemagic account aangemaakt
- [ ] Repository verbonden
- [ ] App Store Connect API Key toegevoegd
- [ ] Android keystore uploaded
- [ ] Firebase configs als environment variables
- [ ] Eerste test build geslaagd
- [ ] `.ipa` en `.aab` artifacts gedownload
- [ ] Getest op device/emulator

**Status**: Ready to deploy! 🚀

---

## 🎉 Volgende Stappen

Na succesvolle Codemagic setup:

1. **TestFlight Beta** (iOS)
   - Upload naar App Store Connect
   - Invite beta testers
   - Verzamel feedback

2. **Google Play Internal Testing** (Android)
   - Upload naar Play Console
   - Share met internal testers
   - Fix bugs

3. **Production Release**
   - App Store review (~1 week)
   - Google Play review (~1 dag)
   - Monitor analytics

---

**Vragen?** Check Codemagic docs of vraag in Slack community.

**Succes met deployment!** 🚀
