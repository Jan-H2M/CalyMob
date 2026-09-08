// ignore_for_file: avoid_web_libraries_in_flutter, deprecated_member_use

import 'dart:async';
import 'dart:convert';
import 'dart:html' as html;

typedef QaBrowserCommandHandler = Future<Map<String, Object?>> Function(
  Map<String, Object?> command,
);

/// Same-origin message bridge compiled only into Flutter Web builds.
///
/// The surrounding app installs this bridge exclusively when the compile-time
/// Firebase Emulator QA flag is enabled. Production and native builds use the
/// no-op conditional implementation.
class QaBrowserBridge {
  static const _origin = 'http://127.0.0.1:5174';
  static const _stages = <String>{
    'command_received',
    'auth_start',
    'auth_ready',
    'member_start',
    'member_ready',
    'fixture_start',
    'fixture_ready',
    'navigation_start',
    'navigation_ready',
    'side_effect_start',
    'side_effect_ready',
    'result_ready',
  };
  StreamSubscription<html.MessageEvent>? _subscription;
  final Set<String> _usedCommandIds = <String>{};

  void install(QaBrowserCommandHandler handler, {required String runId}) {
    if (_subscription != null) {
      throw StateError('CalyMob QA browser bridge already installed.');
    }
    if (runId.isEmpty) {
      throw StateError('CalyMob QA browser bridge requires its run binding.');
    }
    _subscription = html.window.onMessage.listen((event) async {
      if (event.origin != _origin || event.source != html.window) return;
      final raw = event.data;
      if (raw is! String) return;
      Object? decoded;
      try {
        decoded = jsonDecode(raw);
      } catch (_) {
        return;
      }
      if (decoded is! Map || decoded['kind'] != 'calypso-mobile-qa-command') {
        return;
      }
      final command = decoded.map(
        (key, value) => MapEntry(key.toString(), value as Object?),
      );
      final commandId = command['commandId'];
      if (command['runId'] != runId ||
          commandId is! String ||
          commandId.isEmpty) {
        return;
      }
      if (!_usedCommandIds.add(commandId)) {
        html.window.postMessage(
          jsonEncode({
            'schemaVersion': 1,
            'kind': 'calypso-mobile-qa-result',
            'runId': runId,
            'commandId': commandId,
            'ok': false,
          }),
          _origin,
        );
        return;
      }
      try {
        final result = await handler(command);
        html.window.postMessage(
          jsonEncode({
            'schemaVersion': 1,
            'kind': 'calypso-mobile-qa-result',
            'runId': runId,
            'commandId': commandId,
            'ok': true,
            'result': result,
          }),
          _origin,
        );
      } catch (_) {
        html.window.postMessage(
          jsonEncode({
            'schemaVersion': 1,
            'kind': 'calypso-mobile-qa-result',
            'runId': runId,
            'commandId': commandId,
            'ok': false,
          }),
          _origin,
        );
      }
    });
    html.document.documentElement?.dataset['calypsoQaBridge'] = runId;
    html.window.postMessage(
      jsonEncode({
        'schemaVersion': 1,
        'kind': 'calypso-mobile-qa-ready',
      }),
      _origin,
    );
  }

  void setStage(String stage) {
    if (_subscription == null || !_stages.contains(stage)) {
      throw StateError('CalyMob QA browser stage is invalid.');
    }
    html.document.documentElement?.dataset['calypsoQaStage'] = stage;
  }

  void dispose() {
    _subscription?.cancel();
    _subscription = null;
    _usedCommandIds.clear();
    html.document.documentElement?.attributes.remove('data-calypso-qa-bridge');
    html.document.documentElement?.attributes.remove('data-calypso-qa-stage');
  }
}
