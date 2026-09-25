/// Rollout shape stored at `clubs/{clubId}/settings/feature_flags`.
///
/// No app behaviour reads this model in Phase 1; its safe OFF default lets the
/// schema and rules ship before the cursor implementation is wired in.
enum UnreadCursorV1Mode { off, shadow, on }

class UnreadCursorFeatureFlag {
  const UnreadCursorFeatureFlag({
    this.enabled = false,
    this.mode = UnreadCursorV1Mode.off,
    this.pilotMemberIds = const <String>[],
  });

  final bool enabled;
  final UnreadCursorV1Mode mode;
  final List<String> pilotMemberIds;

  UnreadCursorV1Mode effectiveModeFor(String? memberId) {
    if (!enabled) return UnreadCursorV1Mode.off;
    if (mode == UnreadCursorV1Mode.on) return UnreadCursorV1Mode.on;
    if (mode == UnreadCursorV1Mode.shadow &&
        memberId != null &&
        pilotMemberIds.contains(memberId)) {
      return UnreadCursorV1Mode.on;
    }
    return mode;
  }

  static const defaults = UnreadCursorFeatureFlag();

  factory UnreadCursorFeatureFlag.fromFirestore(Map<String, dynamic>? data) {
    final rawMode = data?['unreadCursorV1Mode'];
    final mode = switch (rawMode) {
      'shadow' => UnreadCursorV1Mode.shadow,
      'on' => UnreadCursorV1Mode.on,
      _ => UnreadCursorV1Mode.off,
    };
    return UnreadCursorFeatureFlag(
      enabled: data?['unreadCursorV1Enabled'] == true,
      mode: mode,
      pilotMemberIds: (data?['unreadCursorV1PilotMemberIds'] as List?)
              ?.whereType<String>()
              .toList(growable: false) ??
          const <String>[],
    );
  }

  Map<String, Object> toFirestore() => <String, Object>{
        'unreadCursorV1Enabled': enabled,
        'unreadCursorV1Mode': mode.name,
        if (pilotMemberIds.isNotEmpty)
          'unreadCursorV1PilotMemberIds': pilotMemberIds,
      };
}
