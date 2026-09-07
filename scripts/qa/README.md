# CalyMob local emulator QA

The canonical COM-094 runner lives in the sibling CalyCompta repository. It
starts the Firebase Emulator Suite and the capture proxy, seeds deterministic
fixtures, and then launches this app with:

```sh
flutter run -d chrome --web-hostname 127.0.0.1 --web-port 5174 \
  --dart-define=CALYPSO_QA_EMULATOR=true
```

The QA flag is accepted only for the `demo-calycompta-qa` Firebase project and
loopback emulator hosts. Auth, Firestore, Storage and Functions use ports 9099,
8080, 9199 and 5001. Release mode, production project IDs, remote hosts and
credential-bearing environments fail closed.

Sentry, Crashlytics, FCM token registration, store update checks and deep-link
initialization are disabled in QA mode. Email, SMS, FCM, Ponto, bank and other
outbound effects must be routed to the local side-effect capture; its records
are redacted and written only below the run artifact directory.

This bootstrap is local-only. It must never be deployed or used for a release
build.
