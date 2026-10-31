import 'dart:async';
import 'dart:convert';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:http/http.dart' as http;

typedef MissionTransport =
    Future<Map<String, dynamic>> Function(Map<String, dynamic> request);

class MemberMission {
  final Map<String, dynamic> data;
  const MemberMission(this.data);
  String get id => data['id'] as String;
  String get batchId => data['batchId'] as String;
  String get article => data['article'] as String;
  String get size => data['size'] as String;
  String get recipient => data['recipient'] as String;
  String get status => data['status'] as String;
  String get orderLabel => data['orderLabel'] as String? ?? '';
  DateTime? get orderedAt =>
      DateTime.tryParse(data['orderedAt'] as String? ?? '');
  DateTime? get dueAt => DateTime.tryParse(data['dueAt'] as String? ?? '');
  List<String> get allowedNext =>
      List<String>.from(data['allowedNext'] as List? ?? []);
  static String statusLabel(String status) =>
      const {
        'ordered': 'Commandée',
        'in_progress': 'En cours',
        'ready': 'Prêt',
        'handed_over': 'Remis / Afgeleverd',
      }[status] ??
      status;
}

class MemberMissionsException implements Exception {
  final String code;
  const MemberMissionsException(this.code);
  String get message => switch (code) {
    'own_assignment_required' ||
    'active_member_required' => 'Cette mission ne vous est plus attribuée.',
    'stale_or_invalid_transition' =>
      'La mission a changé. Actualisez avant de confirmer.',
    'handover_location_required' => 'Indiquez le lieu de remise.',
    _ =>
      'Impossible de confirmer. Actualisez pour vérifier le résultat avant de réessayer.',
  };
}

class MemberMissionsService {
  final MissionTransport? transport;
  const MemberMissionsService({this.transport});
  Future<Map<String, dynamic>> call(Map<String, dynamic> request) async {
    if (transport != null) return transport!(request);
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) {
      throw const MemberMissionsException('active_member_required');
    }
    final token = await user.getIdToken();
    const base = String.fromEnvironment(
      'BOUTIQUE_API_BASE_URL',
      defaultValue: 'https://caly.club',
    );
    final response = await http
        .post(
          Uri.parse('$base/api/boutique/member-missions'),
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer $token',
          },
          body: jsonEncode(request),
        )
        .timeout(const Duration(seconds: 20));
    // Do not display another identity's response after an account switch.
    if (FirebaseAuth.instance.currentUser?.uid != user.uid) {
      throw const MemberMissionsException('active_member_required');
    }
    final result = Map<String, dynamic>.from(jsonDecode(response.body) as Map);
    if (response.statusCode != 200) {
      throw MemberMissionsException(result['code'] as String? ?? 'failed');
    }
    if (result['version'] != 1) {
      throw const MemberMissionsException('unsupported_contract');
    }
    return result;
  }

  Future<Map<String, dynamic>> list(String clubId) =>
      call({'clubId': clubId, 'action': 'list'});
  Future<void> update(
    String clubId,
    MemberMission mission,
    String status, {
    String? location,
  }) async {
    await call({
      'clubId': clubId,
      'action': 'update',
      'batchId': mission.batchId,
      'missionId': mission.id,
      'expectedStatus': mission.status,
      'nextStatus': status,
      if (location != null) 'location': location,
    });
  }

  Stream<bool> watchEligibility(String clubId) {
    late StreamController<bool> output;
    Timer? timer;
    var cancelled = false, running = false;
    Future<void> refresh() async {
      if (cancelled || running) return;
      running = true;
      try {
        final result = await list(clubId);
        if (!cancelled) output.add(result['eligible'] == true);
      } catch (_) {
        if (!cancelled) output.add(false);
      } finally {
        running = false;
      }
    }

    output = StreamController<bool>(
      onListen: () {
        refresh();
        timer = Timer.periodic(const Duration(seconds: 30), (_) => refresh());
      },
      onCancel: () {
        cancelled = true;
        timer?.cancel();
      },
    );
    return output.stream;
  }
}
