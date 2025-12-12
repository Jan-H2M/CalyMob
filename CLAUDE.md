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

# iOS specific (from project root)
cd ios && LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pod install   # Install CocoaPods

# Cloud Functions (from functions/ directory)
npm install                          # Install dependencies
firebase deploy --only functions     # Deploy all functions
firebase functions:log               # View logs
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

**Key Services**:
- `NotificationService` - FCM push notifications with foreground/background handlers
- `OperationService` - Event operations and participant management
- `PaymentService` - Noda payment integration via Cloud Functions
- `BiometricService` - Face detection for profile photos

### Cloud Functions (functions/)

Firebase Functions v2 (Gen2) deployed to `europe-west1`:

```
functions/
├── index.js                     # Entry point, exports all functions
└── src/
    ├── payment/
    │   ├── createPayment.js     # createNodaPayment - onCall
    │   ├── webhook.js           # nodaWebhook - onRequest (HTTP POST)
    │   └── checkStatus.js       # checkNodaPaymentStatus - onCall
    ├── notifications/
    │   └── onNewEventMessage.js # Firestore trigger for push notifications
    └── utils/
        └── noda-client.js       # Axios client for Noda API
```

**Environment Variables** (set via `firebase functions:config:set`):
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
- **Node.js**: For Cloud Functions

## Key Integration Points

1. **Push Notifications**: `onNewEventMessage` trigger sends FCM notifications when messages are posted in event discussions. The Flutter app handles navigation to the relevant screen via `navigatorKey`.

2. **Payments**: Noda Open Banking integration. Flow: `createNodaPayment` -> User redirected to bank -> `nodaWebhook` receives confirmation -> Firestore updated.

3. **Tariff System**: Flexible pricing with member/guest rates, optional pricing, and calculated totals in `pricing_calculator.dart` and `tariff_utils.dart`.

## Known Build Issues (Xcode 26.1 Beta)

- `resource fork, Finder information, or similar detritus not allowed` during codesign - Build directly in Xcode rather than via CLI
- CocoaPods requires UTF-8 encoding: use `LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 pod install`
- The Podfile forces iOS 15.5 minimum for all pods

## Development Notes

- UI language is French
- Never commit `GoogleService-Info.plist` (iOS) or `google-services.json` (Android)
- Firestore security rules are managed in the CalyCompta web app
- Version format in `pubspec.yaml`: `version: X.Y.Z+buildNumber` (buildNumber must increment for App Store)

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
