import 'package:firebase_auth/firebase_auth.dart';
import 'package:rxdart/rxdart.dart';

/// Starts protected listeners only for the current identity. Token refreshes
/// retry a listener rejected during auth restoration or a permission change.
/// Signing out/switching accounts cancels the old source before reporting loss
/// of access. Keep that error explicit: unread rollout flags must stay unknown,
/// rather than interpreting an unreadable document as a real OFF value.
Stream<T> authenticatedStream<T>(
  Stream<T> Function() createStream, {
  String? userId,
  Stream<String?> Function()? authUserIds,
}) =>
    Rx.defer(() => (authUserIds?.call() ??
                FirebaseAuth.instance.idTokenChanges().map((user) => user?.uid))
            .switchMap((uid) {
          if (uid == null || uid.isEmpty || (userId != null && uid != userId)) {
            return Stream<T>.error(FirebaseException(
              plugin: 'cloud_firestore',
              code: 'unauthenticated',
              message: 'La session a changé. Reconnectez-vous pour réessayer.',
            ));
          }
          return Rx.defer(createStream);
        }));
