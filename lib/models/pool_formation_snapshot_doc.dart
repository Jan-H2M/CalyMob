import 'member_profile.dart';

/// Privacy-safe formation projection for piscine instructors.
///
/// This type deliberately cannot represent career exercises, theory, MIL,
/// goals, validations or pedagogical notes.
class PoolFormationSnapshotDoc {
  final String memberId;
  final int validated;
  final int pending;
  final int remaining;
  final int pct;

  const PoolFormationSnapshotDoc({
    required this.memberId,
    required this.validated,
    required this.pending,
    required this.remaining,
    required this.pct,
  });

  int get total => validated + pending + remaining;

  factory PoolFormationSnapshotDoc.fromMap(Map<String, dynamic> data) {
    final piscine = _map(data['piscine']);
    return PoolFormationSnapshotDoc(
      memberId: data['member_id']?.toString() ?? '',
      validated: _int(piscine['validated']),
      pending: _int(piscine['pending']),
      remaining: _int(piscine['remaining']),
      pct: _int(piscine['pct']).clamp(0, 100),
    );
  }
}

class PoolFormationStudent {
  final MemberProfile profile;
  final PoolFormationSnapshotDoc snapshot;

  const PoolFormationStudent({required this.profile, required this.snapshot});

  factory PoolFormationStudent.fromMap(Map<String, dynamic> data) {
    final memberId = data['member_id']?.toString() ?? '';
    return PoolFormationStudent(
      profile:
          MemberProfile.fromDirectoryData(memberId, _map(data['identity'])),
      snapshot: PoolFormationSnapshotDoc.fromMap(data),
    );
  }
}

Map<String, dynamic> _map(dynamic value) =>
    value is Map ? value.cast<String, dynamic>() : const {};

int _int(dynamic value) => value is num ? value.toInt() : 0;
