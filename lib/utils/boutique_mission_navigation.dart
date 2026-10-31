import 'package:flutter/material.dart';

const authenticatedHomeRouteName = '/authenticated-home';

/// Only an explicitly installed authenticated home completes login routing.
/// Retain readiness on later unnamed pages, and reset it on any auth identity change.
class AuthenticatedNavigationReadiness {
  String? _homeUid;
  void reset() => _homeUid = null;
  void observe(Route<dynamic>? route, String? uid) {
    if (uid == null) {
      reset();
    } else if (route?.settings.name == authenticatedHomeRouteName &&
        route?.settings.arguments == uid) {
      _homeUid = uid;
    }
  }

  bool isReadyFor(String? uid) => uid != null && _homeUid == uid;
}

bool boutiqueMissionNavigationReady({
  required bool hasNavigator,
  required bool memberLoaded,
  required bool passwordChangeRequired,
  required bool loginCompleted,
}) =>
    hasNavigator && memberLoaded && !passwordChangeRequired && loginCompleted;

/// A late login must never adopt an account that signed in while it awaited I/O.
bool loginCompletionIsCurrent({
  required String originatingUid,
  required int originatingRevision,
  required String? currentUid,
  required int currentRevision,
  required bool mounted,
}) =>
    mounted &&
    originatingUid == currentUid &&
    originatingRevision == currentRevision;
