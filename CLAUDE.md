# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CalyMob is a Flutter mobile application (iOS/Android) for the Calypso diving club. It allows members to submit expense claims, view club operations/events, participate in discussions, and manage their profiles. The app shares a Firebase backend with a React web admin app (CalyCompta).

## Build Commands

### IMPORTANT: When User Requests a Build

**When the user says**: "maak een nieuwe build", "nieuwe versie", "build de app", "release maken"

**YOU (Claude) MUST run**:
```bash
cd CalyMob
./scripts/build_release.sh --bump patch
```

This automatically:
1. ✅ Bumps version in pubspec.yaml (1.0.22+83 → 1.0.23+84)
2. ✅ Updates Firestore settings/app_version (1.0.23) via update_firestore_version.cjs
3. ✅ Builds APK with version in filename: calymob-1.0.23-build84.apk

**User doesn't need to remember "bump"** - you handle it automatically!

### Manual Commands (for reference)

```bash
# Flutter
flutter pub get                      # Install dependencies
flutter run -d ios                   # Run on iOS simulator
flutter run -d android               # Run on Android emulator
flutter build ios                    # Build iOS release (then archive in Xcode)
flutter build appbundle              # Build Android release
flutter analyze                      # Run static analysis

# Release APK/AAB met versienummer (GEBRUIK DEZE SCRIPTS!)
./scripts/build_release.sh           # Bouw APK met versienummer in bestandsnaam
./scripts/build_release.sh --bump patch  # Verhoog versie + bouw APK (patch: 1.0.10→1.0.11)
./scripts/build_release.sh --bump minor  # Minor bump (1.0.10→1.1.0)
./scripts/build_release.sh --bump major  # Major bump (1.0.10→2.0.0)
./scripts/build_release_aab.sh       # Bouw AAB (Android App Bundle) voor Play Store
./scripts/bump_version.sh patch      # Alleen versie verhogen zonder te bouwen

# Versie synchronisatie
# bump_version.sh update automatisch de versie in:
# 1. pubspec.yaml (bijv. 1.0.22+83 → 1.0.23+84)
# 2. Firestore settings/app_version (1.0.23) - zichtbaar in CalyCompta maintenance page
# Gebruikt update_firestore_version.cjs die Firebase credentials vindt via:
# - Hardcoded path (Jan's machine): /Users/jan/Documents/CALYPSO/calycompta-firebase-adminsdk-*.json
# - GOOGLE_APPLICATION_CREDENTIALS environment variable
# - Application Default Credentials (gcloud auth application-default login)

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
├── firebase_options.dart        # Firebase configuration (auto-generated)
├── config/                      # Firebase config, app colors, account codes
├── models/                      # 27 data classes (Operation, ExpenseClaim, Palanquee, etc.)
├── services/                    # 37 Firebase services (see Key Services below)
├── providers/                   # 11 state providers (see Key Providers below)
├── screens/                     # UI organized by feature (12 folders, see below)
│   ├── auth/                   # Login, registration
│   ├── announcements/          # Club announcements
│   ├── exercises/              # LIFRAS exercise validation
│   ├── expenses/               # Expense claims
│   ├── home/                   # Landing/dashboard
│   ├── messages/               # Chat/messaging
│   ├── operations/             # Events, payment flow
│   ├── piscine/                # Pool sessions
│   ├── profile/                # User profile
│   ├── scanner/                # QR code member validation
│   └── teams/                  # Team channels (encadrants, accueil, gonflage)
├── widgets/                     # 22 reusable UI components
├── theme/                       # Theme configuration
└── utils/                       # 8 formatters/helpers
```

**Key Providers** (in `lib/providers/` — 11 total):
- `AuthProvider` - Firebase Auth state, login/logout, session management
- `MemberProvider` - **Cached member data** including `clubStatuten` (user roles). Loaded after login, cleared on logout.
- `OperationProvider` - Event operations state
- `ExpenseProvider` - Expense claims state
- `AnnouncementProvider` - Club announcements
- `PaymentProvider` - Payment state management
- `ActivityProvider` - Activity feed/tracking
- `AvailabilityProvider` - Member availability for pool sessions
- `EventMessageProvider` - Event discussion messages state
- `ExerciceValideProvider` - LIFRAS exercise validation tracking
- `UnreadCountProvider` - Notification badge/unread message counts

**Key Services** (in `lib/services/` — 37 total):
- `NotificationService` - FCM push notifications (platform-specific: `notification_service_io.dart`, `notification_service_web.dart`)
- `OperationService` - Event operations and participant management
- `PaymentService` - Payment integration via Cloud Functions (Mollie, Ponto, EPC QR)
- `BiometricService` - Face detection for profile photos
- `SessionService` - Firestore session management for security rules
- `TeamChannelService` - Team chat channels (encadrants, accueil, gonflage)
- `ActivityService` - Activity feed tracking
- `AttendanceService` - Attendance records
- `AvailabilityService` - Pool session availability
- `CalendarService` - Calendar feed integration
- `CrashlyticsService` - Firebase Crashlytics remote crash monitoring
- `DeepLinkService` - Deep link handling
- `DiveLocationService` - Dive site management
- `EventMessageService` - Event discussion messages
- `ExerciceValideService` / `LifrasService` / `LifrasValidationService` - LIFRAS exercise tracking
- `LocalReadTracker` - Local unread message tracking (replaced server-side read_by)
- `MedicalCertificationService` - Medical certificate management
- `PalanqueeService` / `PalanqueeAutoAssignService` - Dive team assignment
- `PiscineSessionService` / `SessionMessageService` - Pool session management
- `UnreadCountService` - Badge/notification counts
- `CompatibilityService` - App version compatibility checks
- `DiagnosticService` - Biometric/system diagnostics
- `PasswordService` / `ProfileService` - User account management

### Cloud Functions (functions/)

Firebase Functions v2 (Gen2) deployed to `europe-west1`. Requires **Node.js 20**.

```
functions/
├── index.js                     # Entry point, exports all functions
└── src/
    ├── payment/
    │   ├── createMolliePayment.js   # Mollie payment creation - onCall (ACTIVE)
    │   ├── mollieWebhook.js         # Mollie webhook - onRequest
    │   ├── checkMollieStatus.js     # Mollie status check - onCall
    │   ├── createPontoPayment.js    # Ponto payment creation - onCall (ACTIVE)
    │   ├── pontoWebhook.js          # Ponto webhook - onRequest
    │   ├── checkPontoStatus.js      # Ponto status check - onCall
    │   ├── sendPaymentQrEmail.js    # EPC QR code email for bank transfers
    │   ├── createPayment.js         # createNodaPayment (DEPRECATED)
    │   ├── webhook.js               # nodaWebhook (DEPRECATED)
    │   └── checkStatus.js           # checkNodaPaymentStatus (DEPRECATED)
    ├── notifications/
    │   ├── onNewEventMessage.js     # Event discussion messages
    │   ├── onEventStatusChange.js   # Event status updates
    │   ├── onExpenseCreated.js      # New expense submitted
    │   ├── onExpenseStatusChange.js # Expense approval/rejection
    │   ├── onMedicalCertStatusChange.js # Medical cert approval
    │   ├── onNewAnnouncement.js     # New club announcement
    │   ├── onNewAnnouncementReply.js # Announcement replies
    │   ├── onNewSessionMessage.js   # Pool session messages
    │   ├── onNewTeamMessage.js      # Team channel messages
    │   └── sessionReminder.js       # Daily pool session reminders
    └── utils/
        ├── mollie-client.js         # Axios client for Mollie API (ACTIVE)
        ├── ponto-client.js          # Axios client for Ponto API (ACTIVE)
        ├── noda-client.js           # Axios client for Noda API (DEPRECATED)
        ├── badge-helper.js          # Push notification badge management
        └── constants.js             # Shared constants
```

**Environment Variables** (set via `firebase functions:config:set` or `.env` file):
- Mollie: `MOLLIE_API_KEY`, `MOLLIE_WEBHOOK_SECRET`
- Ponto: `PONTO_API_KEY`, `PONTO_API_SECRET`
- Noda (deprecated): `NODA_API_KEY`, `NODA_API_SECRET`, `NODA_BASE_URL`, `NODA_WEBHOOK_SECRET`

### Firestore Structure

```
clubs/{clubId}/
├── members/{memberId}/              # User profiles, FCM tokens
│   ├── exercices_valides/           # Validated LIFRAS exercises
│   └── medical_certificates/        # Medical certifications
├── operations/{operationId}/        # Events/operations
│   ├── participants/                # Event participants (legacy)
│   ├── inscriptions/                # Event registrations (current)
│   └── messages/                    # Event discussion messages
├── operation_participants/          # Registration records with payment status
├── expense_claims/                  # Expense submissions
├── announcements/                   # Club announcements
│   └── replies/                     # Announcement replies
├── team_channels/                   # Team chat (Accueil, Encadrants, Gonflage)
│   └── messages/                    # Channel messages
├── piscine_sessions/                # Pool training sessions
│   ├── messages/                    # Session messages
│   └── attendees/                   # Session participants
├── availabilities/                  # Member availability for pool
├── attendance/                      # Attendance records
├── dive_locations/                  # Dive site management
├── exercices_lifras/                # LIFRAS exercise catalog
├── palanquees/                      # Dive teams (3-diver groups)
└── settings/                        # Club configuration
```

## Platform Requirements

- **iOS**: Minimum deployment target 15.5 (required by Firebase SDK 12.x and Xcode 26)
- **Flutter SDK**: >=3.0.0 <4.0.0
- **Node.js**: 20 (required for Cloud Functions)

## Key Integration Points

1. **Push Notifications**: 10 Firestore triggers send FCM notifications for events, expenses, announcements, team messages, pool sessions, and medical certificates. Badge counts managed via `badge-helper.js`. The Flutter app handles navigation via `navigatorKey`.

2. **Payments (Mollie + EPC QR)**: Mollie for online payments, EPC QR codes for bank transfers. Noda integration is DEPRECATED. Flow: `createMolliePayment` -> User redirected to Mollie checkout -> `mollieWebhook` receives confirmation -> Firestore `paye` field updated.

3. **Tariff System**: Flexible pricing with member/guest rates, optional pricing, and calculated totals in `pricing_calculator.dart` and `tariff_utils.dart`.

4. **LIFRAS Exercise System**: Exercise catalog + validation tracking per member. Services: `lifras_service.dart`, `exercice_valide_service.dart`.

5. **Palanquée System**: Dive team management with auto-assignment algorithm. Services: `palanquee_service.dart`, `palanquee_auto_assign_service.dart`.

6. **Medical Certifications**: Upload, track, and approve medical certificates. Notification on status change.

7. **Unread Tracking**: Local read tracker (replaced server-side `read_by` field) with `UnreadCountProvider` for badge management.

## iOS Build Issues & Solutions

### BELANGRIJK: Clean Build Script

**Bij iOS build problemen** (sandbox not in sync, Manifest.lock missing, pod errors):

```bash
cd CalyMob
./scripts/clean_ios_build.sh
```

Dit script doet automatisch:
1. Kill hangende processen (pod install, xcodebuild)
2. Flutter clean + pub get
3. Verwijdert Pods/, Podfile.lock, .symlinks/, DerivedData
4. Runt `pod install --repo-update`
5. Verifieert dat `Pods/Manifest.lock` bestaat
6. Genereert iOS config met `flutter build ios --config-only`

**Na het script**: Open Xcode met `open ios/Runner.xcworkspace` en build (Cmd+B)

### Known Issues (Xcode 26.1 Beta)

- `resource fork, Finder information, or similar detritus not allowed` during codesign - Build directly in Xcode rather than via CLI
- CocoaPods requires UTF-8 encoding: use `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pod install`
- The Podfile forces iOS 15.5 minimum for all pods

## Android APK Build Naamgeving

### Versie en Build Nummer
Het versienummer staat in `pubspec.yaml` in het formaat: `version: X.Y.Z+buildNumber`

Voorbeeld: `version: 1.0.22+83`
- `1.0.22` = versienummer (major.minor.patch)
- `83` = build nummer (moet altijd verhoogd worden voor elke nieuwe release)

### APK Bestandsnaam
De APK wordt gegenereerd met de volgende naamgeving:
```
calymob-{versie}-build{buildnummer}.apk
```

Voorbeeld: `calymob-1.0.22-build83.apk`

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
- `attendance` - Aanwezigheidsregistratie
- `dive_locations` - Duiklocaties
- `exercices_lifras` - LIFRAS oefeningen catalogus
- `members/{id}/exercices_valides` - Gevalideerde oefeningen per lid
- `members/{id}/medical_certificates` - Medische attesten
- `palanquees` - Duikteams (palanquées)

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
