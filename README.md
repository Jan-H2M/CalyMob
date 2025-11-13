# CalyMob - Mobile App

Flutter mobile application for Calypso Diving Club management system.

## Related Project

This mobile app works with the [CalyCompta Web Application](../CalyCompta) and shares the same Firebase backend.

## Tech Stack

- **Framework**: Flutter (Dart)
- **Backend**: Firebase (Firestore, Auth, Storage)
- **Platforms**: iOS, Android
- **CI/CD**: Codemagic

## Quick Start

```bash
# Install dependencies
flutter pub get

# Run on iOS simulator
flutter run -d ios

# Run on Android emulator
flutter run -d android

# Run on web (for testing)
flutter run -d chrome
```

## Firebase Setup

See [FIREBASE_SETUP.md](FIREBASE_SETUP.md) for detailed Firebase configuration instructions.

## Deployment

- **iOS**: See [IOS_DEPLOYMENT_GUIDE.md](IOS_DEPLOYMENT_GUIDE.md)
- **Android**: See [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)
- **CI/CD**: Configured via [codemagic.yaml](codemagic.yaml)

## Project Structure

```
lib/
├── config/          # Firebase and app configuration
├── models/          # Data models (Expense, Operation, User)
├── services/        # Firebase services (Auth, Firestore)
├── providers/       # State management (Provider pattern)
├── screens/         # UI screens
├── widgets/         # Reusable widgets
└── utils/           # Utility functions
```

## Shared Firebase Project

- **Project ID**: calycompta
- **Firestore Database**: Shared with web app
- **Storage**: Shared photo storage
- **Authentication**: Shared user accounts

## Features

- Expense claim submission with photos
- Operation tracking
- Real-time sync with web app
- Offline support
- Photo gallery with fullscreen viewer
- French UI localization

## Documentation

- [Complete Overview](COMPLETE_OVERZICHT.md) - Full project documentation (Dutch)
- [Firebase Setup](FIREBASE_SETUP.md) - Firebase configuration guide
- [iOS Deployment](IOS_DEPLOYMENT_GUIDE.md) - App Store deployment
- [Codemagic Setup](CODEMAGIC_SETUP.md) - CI/CD configuration

## Development

```bash
# Run tests
flutter test

# Generate app icons
flutter pub run flutter_launcher_icons:main

# Clean build
flutter clean && flutter pub get

# Build for production
flutter build ios
flutter build appbundle  # Android
```

## Contact

For questions about the mobile app or integration with the web application, see the main CalyCompta documentation.
