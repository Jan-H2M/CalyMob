# 🔥 Firebase Configuratie voor CalyCompta Mobile

**Status**: ⚠️ **VEREIST** - De app kan niet werken zonder deze stappen!

---

## 📋 Wat Je Nodig Hebt

- Toegang tot [Firebase Console](https://console.firebase.google.com/project/calycompta)
- Project: `calycompta` (al geconfigureerd voor web app)
- 15 minuten tijd

---

## 🤖 OPTIE 1: Automatische Configuratie (Aanbevolen)

Gebruik de FlutterFire CLI om automatisch de configuratie te genereren:

### Stap 1: Installeer FlutterFire CLI

```bash
# Installeer Firebase CLI als je die nog niet hebt
npm install -g firebase-tools

# Installeer FlutterFire CLI
dart pub global activate flutterfire_cli
```

### Stap 2: Login bij Firebase

```bash
firebase login
```

### Stap 3: Configureer Flutter App

```bash
cd /Users/jan/Documents/GitHub/CalyCompta/calycompta_mobile

# Voer FlutterFire configuratie uit
flutterfire configure \
  --project=calycompta \
  --platforms=android,ios \
  --out=lib/firebase_options.dart \
  --yes
```

Dit commando doet automatisch:
- ✅ Aanmaken Android app in Firebase Console
- ✅ Aanmaken iOS app in Firebase Console
- ✅ Downloaden `google-services.json` (Android)
- ✅ Downloaden `GoogleService-Info.plist` (iOS)
- ✅ Updaten `firebase_options.dart` met echte App IDs
- ✅ Updaten `android/app/build.gradle` met Firebase plugin

**Package names die gebruikt worden**:
- Android: `com.example.calycompta_mobile` (automatisch gegenereerd)
- iOS: `com.calycompta.mobile` (automatisch gegenereerd)

### Stap 4: Verifiëren

```bash
# Controleer of bestanden zijn aangemaakt
ls android/app/google-services.json
ls ios/Runner/GoogleService-Info.plist

# Controleer of firebase_options.dart is geüpdatet
cat lib/firebase_options.dart | grep "appId:"
# Zou GEEN "TO_BE_CONFIGURED" meer moeten bevatten!
```

---

## 🛠️ OPTIE 2: Handmatige Configuratie

Als FlutterFire CLI niet werkt, volg deze stappen:

### Android Configuratie

#### 1. Firebase Console

1. Ga naar [Firebase Console → Calycompta Project](https://console.firebase.google.com/project/calycompta)
2. Klik op het tandwiel ⚙️ → **Project settings**
3. Scroll naar **Your apps** sectie
4. Klik op **Add app** → Selecteer **Android** icon
5. Vul in:
   - **Android package name**: `com.example.calycompta_mobile`
   - **App nickname**: `CalyCompta Mobile (Android)`
   - **Debug signing certificate SHA-1** (optioneel): laat leeg voor nu
6. Klik **Register app**
7. **Download** `google-services.json`
8. Klik **Next** tot je klaar bent

#### 2. Bestand Plaatsen

```bash
# Plaats google-services.json in de juiste directory
cp ~/Downloads/google-services.json /Users/jan/Documents/GitHub/CalyCompta/calycompta_mobile/android/app/

# Verifieer
ls -la android/app/google-services.json
```

#### 3. Update firebase_options.dart

Open `google-services.json` en kopieer de `mobilesdk_app_id`:

```json
{
  "client": [
    {
      "client_info": {
        "mobilesdk_app_id": "1:328464166969:android:XXXXXXXXXXXXX",  // ← Kopieer dit!
        ...
      }
    }
  ]
}
```

Update `lib/firebase_options.dart`:

```dart
static const FirebaseOptions android = FirebaseOptions(
  apiKey: 'AIzaSyCmU-7GABqko2N-2saQNcNNSIyW_BbVCtU',
  appId: '1:328464166969:android:XXXXXXXXXXXXX',  // ← Plak hier!
  messagingSenderId: '328464166969',
  projectId: 'calycompta',
  authDomain: 'calycompta.firebaseapp.com',
  storageBucket: 'calycompta.firebasestorage.app',
);
```

---

### iOS Configuratie

#### 1. Firebase Console

1. Terug naar [Firebase Console → Calycompta Project](https://console.firebase.google.com/project/calycompta)
2. Klik op **Add app** → Selecteer **iOS** icon
3. Vul in:
   - **iOS bundle ID**: `com.calycompta.mobile`
   - **App nickname**: `CalyCompta Mobile (iOS)`
   - **App Store ID** (optioneel): laat leeg
4. Klik **Register app**
5. **Download** `GoogleService-Info.plist`
6. Klik **Next** tot je klaar bent

#### 2. Bestand Plaatsen

```bash
# Plaats GoogleService-Info.plist in de juiste directory
cp ~/Downloads/GoogleService-Info.plist /Users/jan/Documents/GitHub/CalyCompta/calycompta_mobile/ios/Runner/

# Verifieer
ls -la ios/Runner/GoogleService-Info.plist
```

#### 3. Update firebase_options.dart

Open `GoogleService-Info.plist` en kopieer de `GOOGLE_APP_ID`:

```xml
<key>GOOGLE_APP_ID</key>
<string>1:328464166969:ios:YYYYYYYYYYYYY</string>  <!-- Kopieer dit! -->
```

Update `lib/firebase_options.dart`:

```dart
static const FirebaseOptions ios = FirebaseOptions(
  apiKey: 'AIzaSyCmU-7GABqko2N-2saQNcNNSIyW_BbVCtU',
  appId: '1:328464166969:ios:YYYYYYYYYYYYY',  // ← Plak hier!
  messagingSenderId: '328464166969',
  projectId: 'calycompta',
  authDomain: 'calycompta.firebaseapp.com',
  storageBucket: 'calycompta.firebasestorage.app',
  iosBundleId: 'com.calycompta.mobile',
);
```

---

## ✅ Verificatie

### Test de Configuratie

```bash
cd /Users/jan/Documents/GitHub/CalyCompta/calycompta_mobile

# Installeer dependencies
~/development/flutter/bin/flutter pub get

# Build Android (test of configuratie werkt)
~/development/flutter/bin/flutter build apk --debug

# Kijk naar output - zou GEEN fouten over Firebase moeten geven
```

### Veelvoorkomende Fouten

**Fout**: `google-services.json not found`
- **Oplossing**: Controleer of bestand in `android/app/` staat (niet `android/`)

**Fout**: `GoogleService-Info.plist not found`
- **Oplossing**: Controleer of bestand in `ios/Runner/` staat

**Fout**: `FirebaseException: [core/no-app]`
- **Oplossing**: Controleer of `appId` in `firebase_options.dart` geen `TO_BE_CONFIGURED` meer bevat

**Fout**: `Package name mismatch`
- **Oplossing**: Package name in Firebase Console moet matchen met `applicationId` in `android/app/build.gradle.kts`

---

## 🔒 Beveiliging

### .gitignore Check

De volgende bestanden zijn **AL** toegevoegd aan `.gitignore`:

```gitignore
# Firebase config (bevat API keys)
android/app/google-services.json
ios/Runner/GoogleService-Info.plist
```

⚠️ **VERIFIEER** dat deze files NIET gecommit worden:

```bash
git status
# google-services.json en GoogleService-Info.plist zouden NIET moeten verschijnen
```

### Backup voor Team Members

Als andere developers de app willen builden:

**Optie A**: Deel files via beveiligde weg (encryptie/1Password)
**Optie B**: Laat hen zelf downloaden uit Firebase Console (vereist toegang)
**Optie C**: Gebruik FlutterFire CLI (ze loggen in met hun Firebase account)

---

## 📱 Volgende Stappen

Na configuratie:

1. **Build & Test**:
   ```bash
   ~/development/flutter/bin/flutter run
   ```

2. **Login testen** met bestaande Firebase Auth account

3. **Kosten aanmaken** en verifiëren dat het in Firestore verschijnt

4. **Foto upload** testen

---

## 🆘 Hulp Nodig?

**Firebase Console**: https://console.firebase.google.com/project/calycompta

**FlutterFire Docs**: https://firebase.flutter.dev/docs/overview

**Firebase Support**: https://firebase.google.com/support

---

**Laatst bijgewerkt**: 6 november 2025
**Status**: Wacht op configuratie
