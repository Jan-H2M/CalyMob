import 'dart:convert';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter/services.dart';
import 'package:rxdart/rxdart.dart';

typedef ApneeRow = Map<String, dynamic>;

String apneeTrackName(String track) => track == 'apnee.a1'
    ? '1★ apnée · A1 / Discovery'
    : track == 'apnee.a2'
        ? '2★ apnée · A2'
        : 'Trajet apnée inconnu';

DateTime? apneeDate(dynamic value) =>
    value is Timestamp ? value.toDate() : null;

bool canCorrectApneeParticipation(ApneeRow row,
        {String? viewerId,
        required String memberId,
        bool canManage = false,
        bool readOnly = false}) =>
    !readOnly &&
    apneeDate(row['session_date'])?.isBefore(DateTime.now()) == true &&
    row['participation_status'] != 'cancelled' &&
    (canManage || (viewerId == memberId && row['qr_verified'] == true));

bool apneeQrVerified(
    ApneeRow attendee, ApneeRow receipt, String memberId, String sessionId) {
  final proof = attendee['qrVerified'];
  return proof is Map &&
      receipt['version'] == 1 &&
      attendee['memberId'] == memberId &&
      attendee['isGuest'] != true &&
      (attendee['membre_id'] == null || attendee['membre_id'] == memberId) &&
      receipt['memberId'] == memberId &&
      receipt['sessionId'] == sessionId &&
      receipt['scannerUid'] == attendee['scannedBy'] &&
      apneeDate(receipt['scannedAt']) != null &&
      receipt['scannedAt'] == attendee['scannedAt'] &&
      receipt.keys.every((key) => proof[key] == receipt[key]) &&
      receipt.length == proof.length;
}

class ApneeTrainingService {
  final FirebaseFirestore db;
  final Future<void> Function(ApneeRow)? invoke;
  ApneeTrainingService({FirebaseFirestore? firestore, this.invoke})
      : db = firestore ?? FirebaseFirestore.instance;
  static Future<ApneeRow>? _catalog;
  static Future<ApneeRow> catalog() => _catalog ??= rootBundle
      .loadString('assets/apnee/lifras-preparation-cards-2025-08.json')
      .then((value) => (jsonDecode(value) as Map).cast<String, dynamic>());

  Stream<List<ApneeRow>> watch(String clubId, String path,
      {String? memberId, bool poolOnly = false}) {
    Query<Map<String, dynamic>> query = db.collection('clubs/$clubId/$path');
    if (memberId != null) query = query.where('member_id', isEqualTo: memberId);
    if (poolOnly) query = query.where('setting', isEqualTo: 'pool');
    return query.snapshots().map((snap) => snap.docs
        .map((row) => <String, dynamic>{...row.data(), 'id': row.id})
        .toList());
  }

  // Follow canonical session dates live; a cached roster date is not evidence.
  Stream<List<ApneeRow>> history(String clubId, String memberId) =>
      watch(clubId, 'apnee_participations', memberId: memberId)
          .switchMap((rows) {
        if (rows.isEmpty) return Stream.value(<ApneeRow>[]);
        return CombineLatestStream.list(rows.map((row) {
          final sessionId = row['session_id'] as String;
          final ref = db.doc('clubs/$clubId/piscine_sessions/$sessionId');
          return CombineLatestStream.combine3(
              ref.snapshots(),
              ref.collection('attendees').doc(memberId).snapshots(),
              ref.collection('qr_scan_receipts').doc(memberId).snapshots(),
              (session, attendee, receipt) => <String, dynamic>{
                    ...row,
                    'session_date': session.data()?['date'],
                    'qr_verified': apneeQrVerified(attendee.data() ?? {},
                        receipt.data() ?? {}, memberId, sessionId),
                  });
        }));
      });
  Future<void> save(String clubId, ApneeRow values) async {
    final payload = <String, dynamic>{
      ...values,
      'clubId': clubId,
      'operationId': db.collection('clubs').doc().id
    };
    if (invoke != null) {
      await invoke!(payload);
      return;
    }
    await FirebaseFunctions.instanceFor(region: 'europe-west1')
        .httpsCallable('manageApneeTraining')
        .call(payload);
  }
}
