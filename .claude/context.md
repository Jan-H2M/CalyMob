# CalyMob Mobile Application - Claude Context

## Project Overview

This is **CalyMob**, a Flutter mobile application (iOS/Android) for the Calypso diving club management system. It provides club members with the ability to submit expense claims, view operations, and track their activities while on the go.

## Related Projects

### Web App Sibling
- **Location**: `/Users/jan/Documents/GitHub/CalyCompta`
- **Type**: React + TypeScript web application
- **Purpose**: Full administrative interface for club managers
- **Integration**: Shares the same Firebase backend

### System Architecture
See `/Users/jan/Documents/GitHub/ARCHITECTURE.md` for complete system documentation.

## Tech Stack

- **Framework**: Flutter (Dart)
- **Platforms**: iOS, Android, Web (experimental)
- **Backend**: Firebase
  - Firestore (database)
  - Authentication (email/password)
  - Storage (photos)
- **State Management**: Provider pattern
- **Image Handling**: image_picker, cached_network_image
- **PDF Viewing**: pdfrx
- **UI**: Material Design (French localization)

## Project Structure

```
CalyMob/
├── lib/
│   ├── config/
│   │   └── firebase_config.dart          # Firebase initialization
│   ├── firebase_options.dart             # Platform-specific Firebase config
│   ├── main.dart                         # App entry point + providers
│   │
│   ├── models/                           # Data models
│   │   ├── expense_claim.dart           # Expense claim model
│   │   ├── operation.dart               # Operation model
│   │   ├── participant_operation.dart   # Participant model
│   │   └── user_session.dart            # User session model
│   │
│   ├── services/                         # Firebase services
│   │   ├── auth_service.dart            # Authentication
│   │   ├── session_service.dart         # Session management
│   │   ├── expense_service.dart         # Expense operations
│   │   └── operation_service.dart       # Operation operations
│   │
│   ├── providers/                        # State management
│   │   ├── auth_provider.dart           # Auth state
│   │   ├── expense_provider.dart        # Expense state
│   │   └── operation_provider.dart      # Operation state
│   │
│   ├── screens/                          # UI screens
│   │   ├── auth/
│   │   │   └── login_screen.dart        # Login screen
│   │   ├── home/
│   │   │   └── home_screen.dart         # Main dashboard
│   │   ├── expenses/
│   │   │   ├── expense_list_screen.dart # List expenses
│   │   │   ├── create_expense_screen.dart # New expense
│   │   │   ├── expense_detail_screen.dart # Expense details
│   │   │   └── photo_viewer_screen.dart   # Photo viewer
│   │   └── operations/
│   │       └── operation_detail_screen.dart
│   │
│   ├── widgets/                          # Reusable widgets
│   │   ├── operation_card.dart
│   │   ├── loading_widget.dart
│   │   ├── empty_state_widget.dart
│   │   └── expense_photo_gallery.dart
│   │
│   └── utils/                            # Utilities
│       ├── date_formatter.dart
│       └── currency_formatter.dart
│
├── android/                              # Android platform files
├── ios/                                  # iOS platform files
├── web/                                  # Web platform files
├── test/                                 # Unit tests
├── assets/                               # Images, icons
├── pubspec.yaml                          # Dependencies
├── codemagic.yaml                        # CI/CD configuration
└── README.md

CalyCompta/                               # Separate web application
└── (See CalyCompta/.claude/context.md)
```

## Firebase Integration

### Shared Firebase Project
- **Project ID**: `calycompta`
- **Firestore Database**: Shared with web application
- **Authentication**: Shared user accounts
- **Storage**: Shared photo storage
- **Platform Configs**:
  - iOS: `ios/Runner/GoogleService-Info.plist` (DO NOT COMMIT)
  - Android: `android/app/google-services.json` (DO NOT COMMIT)

### Firestore Collections (Read/Write Access)

```
clubs/
  └── calypso/
      ├── expense_claims/        # Member can CREATE and READ own
      │   └── [claimId]/
      │       ├── userId         # Current user
      │       ├── amount
      │       ├── description
      │       ├── date
      │       ├── status         # 'soumis', 'approuvé', 'rejeté'
      │       ├── photos[]       # Storage URLs
      │       └── category
      │
      └── operations/            # Member can READ all
          └── [operationId]/
              ├── title
              ├── date
              ├── participants[]
              └── photos[]
```

### Security Rules
- Members can only read/write their own expense claims
- Members can read all operations
- Status changes (approve/reject) only via web app admin
- Photos in Storage protected by same rules

## Running the Application

### Setup Flutter Environment
```bash
# Verify Flutter installation
flutter doctor

# Get dependencies
flutter pub get

# Generate app icons
flutter pub run flutter_launcher_icons:main
```

### Run on Simulator/Emulator
```bash
# iOS Simulator
flutter run -d ios

# Android Emulator
flutter run -d android

# Chrome (for testing)
flutter run -d chrome
```

### Build for Production

#### iOS
```bash
flutter build ios
# Then open Xcode to archive and upload to App Store
```

#### Android
```bash
flutter build appbundle
# Upload to Google Play Console
```

## CI/CD with Codemagic

Configuration in `codemagic.yaml`:
- Automatic builds on push to `main`
- iOS builds with code signing
- Android app bundle generation
- Automated testing
- Distribution to TestFlight and Play Store (when configured)

**Note**: Requires credentials setup in Codemagic dashboard:
- iOS certificates and provisioning profiles
- Android keystore
- See `CODEMAGIC_SETUP.md` for details

## Key Features

### 1. Authentication
- Email/password login
- Session persistence
- Automatic logout on timeout
- Shared accounts with web app

### 2. Expense Claims
- Create new expense with photos
- Take photos or select from gallery
- List personal expenses
- View detailed expense with photo gallery
- Edit/delete if status is 'soumis'
- Cannot modify approved/rejected expenses

### 3. Operations
- Browse club operations
- View operation details
- See participant lists
- View operation photos

### 4. Photo Management
- Upload multiple photos per expense
- Thumbnail grid view
- Fullscreen viewer with pinch-to-zoom
- Swipe between photos
- Cached for offline viewing

### 5. Real-time Sync
- Firestore real-time listeners
- Instant updates when admin approves/rejects
- Status badges update automatically

### 6. Offline Support
- Cached photos
- Local state management
- Syncs when online

## Integration with Web App

### Data Flow: Mobile → Web

1. **Expense Submission**
   ```
   Mobile App → Firebase Storage (photos)
              → Firestore (expense document)
              → Cloud Function (email notification)
              → Web App Admin (review)
              → Firestore update (status)
              → Mobile App (real-time listener)
   ```

2. **Operation Viewing**
   ```
   Web App Admin → Creates operation in Firestore
                 → Mobile App (real-time listener)
                 → User views operation details
   ```

### Shared Data Models

#### Expense Claim
**Mobile**: `lib/models/expense_claim.dart`
**Web**: `CalyCompta/calycompta-app/src/components/depenses/types.ts`

Firestore document structure:
```dart
{
  'userId': String,           // User who created
  'amount': double,           // Amount in EUR
  'description': String,      // Expense description
  'date': Timestamp,          // Expense date
  'status': String,           // 'soumis', 'approuvé', 'rejeté'
  'photos': List<String>,     // Firebase Storage URLs
  'category': String,         // Category code
  'clubId': String,           // Always 'calypso'
  'createdAt': Timestamp,
  'updatedAt': Timestamp,
}
```

#### Operation
**Mobile**: `lib/models/operation.dart`
**Web**: `CalyCompta/calycompta-app/src/services/operationService.ts`

## Development Guidelines

### When Working on This Project

1. **Keep Web App in Mind**
   - Changes to Firestore structure affect web app
   - Coordinate with web app developer
   - Test data flow both directions

2. **Firebase Configuration**
   - Never commit `GoogleService-Info.plist` or `google-services.json`
   - Keep `firebase_options.dart` updated with platform configs
   - Test with Firebase Emulators when possible

3. **State Management**
   - Use Provider pattern consistently
   - Keep business logic in services
   - UI widgets should be stateless when possible

4. **Photo Handling**
   - Compress images before upload
   - Use thumbnails in lists
   - Cache for performance
   - Handle offline gracefully

5. **Security**
   - Never store sensitive data locally
   - Respect Firestore security rules
   - Validate user permissions
   - Handle auth state changes

### Code Style
- Follow Flutter/Dart conventions
- Use `analysis_options.yaml` linting
- Document public APIs
- Keep functions small and focused
- French strings for UI

### Testing
```bash
flutter test                  # Run all tests
flutter test --coverage       # With coverage
```

## Deployment

### iOS App Store
1. Update version in `pubspec.yaml`
2. Run `flutter build ios`
3. Open Xcode project
4. Archive and upload to App Store Connect
5. Submit for review

See `IOS_DEPLOYMENT_GUIDE.md` for complete checklist.

### Google Play Store
1. Update version in `pubspec.yaml`
2. Run `flutter build appbundle`
3. Upload to Play Console
4. Fill release notes
5. Submit for review

See `DEPLOYMENT_GUIDE.md` for complete checklist.

### CI/CD (Codemagic)
- Push to `main` branch triggers build
- Automatic testing
- Distribution to TestFlight (iOS)
- Distribution to internal testing (Android)

See `CODEMAGIC_SETUP.md` for configuration.

## Troubleshooting

### Common Issues

1. **"Firebase not initialized"**
   - Check `GoogleService-Info.plist` (iOS) or `google-services.json` (Android)
   - Verify `firebase_options.dart` is correct
   - Clean and rebuild: `flutter clean && flutter pub get`

2. **"Permission denied" Firestore errors**
   - Check security rules in web app: `firestore.rules`
   - Verify user is authenticated
   - Check user has permission for that document

3. **Photos not uploading**
   - Check Storage security rules
   - Verify internet connection
   - Check file size limits
   - Ensure proper error handling

4. **iOS build fails**
   - Update CocoaPods: `cd ios && pod install`
   - Check Xcode version compatibility
   - Verify signing configuration

5. **Android build fails**
   - Check `android/app/build.gradle` min SDK version
   - Update Gradle: `cd android && ./gradlew clean`
   - Verify `google-services.json` is in correct location

## Important Notes for Claude

- This is a **production mobile app** for real users
- **DO NOT** modify Firebase security rules (done in web app)
- **BE CAREFUL** with Firestore structure changes (affects web app)
- French language is primary for UI
- Test on both iOS and Android when possible
- Consider offline scenarios

## Quick Reference

- **Run iOS**: `flutter run -d ios`
- **Run Android**: `flutter run -d android`
- **Build iOS**: `flutter build ios`
- **Build Android**: `flutter build appbundle`
- **Sibling Project**: `/Users/jan/Documents/GitHub/CalyCompta`
- **Architecture Doc**: `/Users/jan/Documents/GitHub/ARCHITECTURE.md`
- **Firebase Console**: https://console.firebase.google.com/project/calycompta

## Documentation

- `README.md` - Project overview and quick start
- `COMPLETE_OVERZICHT.md` - Complete project documentation (Dutch)
- `FIREBASE_SETUP.md` - Firebase configuration guide
- `IOS_DEPLOYMENT_GUIDE.md` - iOS App Store deployment
- `DEPLOYMENT_GUIDE.md` - Android deployment
- `CODEMAGIC_SETUP.md` - CI/CD configuration
- `APPSTORE_CHECKLIST.md` - Pre-submission checklist
