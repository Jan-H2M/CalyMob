# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CalyMob is a Flutter mobile application (iOS/Android) for the Calypso diving club. It allows members to submit expense claims, view club operations/events, participate in discussions, and manage their profiles. The app shares a Firebase backend with a React web admin app (CalyCompta).

## Build Commands

```bash
# Flutter
flutter pub get                      # Install dependencies
flutter run -d ios                   # Run on iOS simulator
flutter run -d android               # Run on Android emulator
flutter build ios                    # Build iOS release (then archive in Xcode)
flutter build appbundle              # Build Android release
flutter analyze                      # Run static analysis

# Release APK met versienummer (GEBRUIK DEZE SCRIPTS!)
./scripts/build_release.sh           # Bouw APK met versienummer in bestandsnaam
./scripts/build_release.sh --bump patch  # Verhoog versie + bouw (patch: 1.0.10→1.0.11)
./scripts/build_release.sh --bump minor  # Minor bump (1.0.10→1.1.0)
./scripts/build_release.sh --bump major  # Major bump (1.0.10→2.0.0)
./scripts/bump_version.sh patch      # Alleen versie verhogen zonder te bouwen

# iOS specific (from project root)
cd ios && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pod install   # Install CocoaPods

# Cloud Functions (from functions/ directory)
npm install                          # Install dependencies
firebase deploy --only functions     # Deploy all functions
firebase deploy --only functions:createNodaPayment,functions:nodaWebhook  # Deploy specific
firebase functions:log               # View logs
firebase emulators:start --only functions  # Local testing
```

## Architecture

### Flutter App (lib/)

**State Management**: Provider pattern with ChangeNotifier

```
lib/
├── main.dart                    # Entry point, providers setup, notification handlers
├── config/                      # Firebase config, app colors, account codes
├── models/                      # Data classes (Operation, ExpenseClaim, Tariff, etc.)
├── services/                    # Firebase interactions (AuthService, OperationService, etc.)
├── providers/                   # State management (AuthProvider, OperationProvider, etc.)
├── screens/                     # UI organized by feature (auth/, expenses/, operations/, etc.)
├── widgets/                     # Reusable UI components
└── utils/                       # Formatters, helpers (date_formatter, currency_formatter)
```

**Key Providers** (in `lib/providers/`):
- `AuthProvider` - Firebase Auth state, login/logout, session management
- `MemberProvider` - **Cached member data** including `clubStatuten` (user roles). Loaded after login, cleared on logout.
- `OperationProvider` - Event operations state
- `ExpenseProvider` - Expense claims state
- `AnnouncementProvider` - Club announcements
- `PaymentProvider` - Payment state management

**Key Services** (in `lib/services/`):
- `NotificationService` - FCM push notifications with foreground/background handlers
- `OperationService` - Event operations and participant management
- `PaymentService` - Noda payment integration via Cloud Functions
- `BiometricService` - Face detection for profile photos
- `SessionService` - Firestore session management for security rules
- `TeamChannelService` - Team chat channels (encadrants, accueil, gonflage)

### Cloud Functions (functions/)

Firebase Functions v2 (Gen2) deployed to `europe-west1`. Requires **Node.js 20**.

```
functions/
├── index.js                     # Entry point, exports all functions
└── src/
    ├── payment/
    │   ├── createPayment.js         # createNodaPayment - onCall
    │   ├── webhook.js               # nodaWebhook - onRequest (HTTP POST)
    │   └── checkStatus.js           # checkNodaPaymentStatus - onCall
    ├── notifications/
    │   └── onNewEventMessage.js     # Firestore trigger for push notifications
    └── utils/
        └── noda-client.js           # Axios client for Noda API
```

**Environment Variables** (set via `firebase functions:config:set` or `.env` file):
- `NODA_API_KEY`, `NODA_API_SECRET`, `NODA_BASE_URL`, `NODA_WEBHOOK_SECRET`

### Firestore Structure

```
clubs/{clubId}/
├── members/{memberId}           # User profiles, FCM tokens
├── operations/{operationId}/    # Events/operations
│   ├── participants/            # Event participants
│   └── messages/                # Event discussion messages
├── operation_participants/      # Registration records with payment status
├── expense_claims/              # Expense submissions
└── announcements/               # Club announcements
```

## Platform Requirements

- **iOS**: Minimum deployment target 15.5 (required by Firebase SDK 12.x and Xcode 26)
- **Flutter SDK**: >=3.0.0 <4.0.0
- **Node.js**: 20 (required for Cloud Functions)

## Key Integration Points

1. **Push Notifications**: `onNewEventMessage` trigger sends FCM notifications when messages are posted in event discussions. The Flutter app handles navigation to the relevant screen via `navigatorKey`.

2. **Payments (Noda)**: Payment provider via Open Banking. Flow: `createNodaPayment` -> User redirected to Noda checkout -> `nodaWebhook` receives confirmation -> Firestore `paye` field updated.

3. **Tariff System**: Flexible pricing with member/guest rates, optional pricing, and calculated totals in `pricing_calculator.dart` and `tariff_utils.dart`.

## Known Build Issues (Xcode 26.1 Beta)

- `resource fork, Finder information, or similar detritus not allowed` during codesign - Build directly in Xcode rather than via CLI
- CocoaPods requires UTF-8 encoding: use `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pod install`
- The Podfile forces iOS 15.5 minimum for all pods

## Android APK Build Naamgeving

### Versie en Build Nummer
Het versienummer staat in `pubspec.yaml` in het formaat: `version: X.Y.Z+buildNumber`

Voorbeeld: `version: 1.0.10+61`
- `1.0.10` = versienummer (major.minor.patch)
- `61` = build nummer (moet altijd verhoogd worden voor elke nieuwe release)

### APK Bestandsnaam
De APK wordt gegenereerd met de volgende naamgeving:
```
calymob-{versie}-build{buildnummer}.apk
```

Voorbeeld: `calymob-1.0.10-build61.apk`

### BELANGRIJK: Build Nummer Verhogen
**Bij elke nieuwe Android build MOET het build nummer worden verhoogd in `pubspec.yaml`:**

1. Open `pubspec.yaml`
2. Zoek de regel `version: X.Y.Z+buildNumber`
3. Verhoog het build nummer (het getal na de `+`)
4. Bouw de APK met `./scripts/build_release.sh`

Het script `build_release.sh` leest automatisch het versienummer uit `pubspec.yaml` en genereert de APK met de correcte bestandsnaam.

## Development Notes

- UI language is French
- Never commit `GoogleService-Info.plist` (iOS) or `google-services.json` (Android)
- Version format in `pubspec.yaml`: `version: X.Y.Z+buildNumber` (buildNumber must increment for App Store)

## Firestore Security Rules - BELANGRIJK

**CalyCompta is de bron van waarheid voor Firestore rules.** De `firestore.rules` in deze directory is alleen een lokale kopie ter referentie.

### Bij nieuwe Firestore collections:
1. Voeg ALTIJD de rules toe in `CalyCompta/firestore.rules`
2. Deploy met: `cd ../CalyCompta && firebase deploy --only firestore:rules`
3. De lokale `CalyMob/firestore.rules` wordt NIET gedeployed

### Mobile app pattern (geen sessie nodig):
```javascript
// ✅ Correct voor mobile app
allow read: if isAuthenticated() &&
  exists(/databases/$(database)/documents/clubs/$(clubId)/members/$(request.auth.uid));

// ❌ Vermijd hasValidSession voor mobile-only features
allow read: if hasValidSession(clubId);  // Vereist web sessie
```

### Collections die CalyMob gebruikt:
- `team_channels` + `messages` - Team chat
- `piscine_sessions` + `messages`, `attendees` - Zwembad sessies
- `announcements` + `replies` - Clubmededelingen
- `operations` + `messages`, `inscriptions` - Events
- `availabilities` - Beschikbaarheden

## Provider Patronen - BELANGRIJK

### Correcte manier om user data te krijgen in screens:

```dart
// CORRECT - zo moet het:
final clubId = FirebaseConfig.defaultClubId;
final userId = authProvider.currentUser?.uid;
final userName = authProvider.displayName ?? authProvider.currentUser?.email ?? 'Anonyme';
final userRoles = memberProvider.clubStatuten;  // Uit MemberProvider!

// FOUT - deze getters bestaan NIET op AuthProvider:
// authProvider.clubId      // BESTAAT NIET
// authProvider.userId      // BESTAAT NIET
// authProvider.userName    // BESTAAT NIET
// authProvider.clubStatuten // BESTAAT NIET - gebruik MemberProvider
```

### MemberProvider gebruik:

```dart
// In screen imports:
import '../../providers/member_provider.dart';
import '../../config/firebase_config.dart';

// In build method:
final authProvider = Provider.of<AuthProvider>(context);
final memberProvider = Provider.of<MemberProvider>(context);
final clubId = FirebaseConfig.defaultClubId;
final userId = authProvider.currentUser?.uid;
final userRoles = memberProvider.clubStatuten;
```

### Login/Logout flow:

De `MemberProvider` wordt automatisch geladen na login in `login_screen.dart` en gecleared bij logout in de logout handlers. **Niet handmatig aanroepen** tenzij je member data wilt refreshen.

## KRITIEKE VEILIGHEIDSREGELS

### Git Veiligheid
**NOOIT** zonder expliciete toestemming van de gebruiker:
- `git restore .` - vernietigt alle uncommitted werk
- `git checkout .` - zelfde effect
- `git reset --hard` - vernietigt commits
- `git clean -fd` - verwijdert bestanden permanent

**ALTIJD** bij backup verzoek:
1. EERST: `git stash push -m "backup"`
2. DAN: `git add -A && git commit -m "backup" && git push`
3. PAS DAARNA: andere taken

### Commit Frequentie
- Commit na elke werkende feature
- Commit na elk uur werk
- Push direct naar GitHub na commit

### Bij Problemen
- STOP en vraag de gebruiker
- Geen impulsieve "fixes"
- Wacht op toestemming voor destructieve acties
