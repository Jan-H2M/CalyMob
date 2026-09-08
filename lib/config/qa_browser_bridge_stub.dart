typedef QaBrowserCommandHandler = Future<Map<String, Object?>> Function(
  Map<String, Object?> command,
);

class QaBrowserBridge {
  void install(QaBrowserCommandHandler handler) {}

  void dispose() {}
}
