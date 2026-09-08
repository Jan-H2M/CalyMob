typedef QaBrowserCommandHandler = Future<Map<String, Object?>> Function(
  Map<String, Object?> command,
);

class QaBrowserBridge {
  void install(QaBrowserCommandHandler handler, {required String runId}) {}

  void dispose() {}
}
