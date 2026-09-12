import 'package:cloud_firestore/cloud_firestore.dart';

import '../models/notification_history_item.dart';

class NotificationHistoryService {
  final FirebaseFirestore _firestore;

  NotificationHistoryService({FirebaseFirestore? firestore})
      : _firestore = firestore ?? FirebaseFirestore.instance;

  CollectionReference<Map<String, dynamic>> _collection(
    String clubId,
    String memberId,
  ) =>
      _firestore
          .collection('clubs')
          .doc(clubId)
          .collection('members')
          .doc(memberId)
          .collection('notifications');

  Stream<List<NotificationHistoryItem>> watch({
    required String clubId,
    required String memberId,
  }) {
    return _collection(clubId, memberId)
        .orderBy('created_at', descending: true)
        .snapshots()
        .map(
          (snapshot) => snapshot.docs
              .map(NotificationHistoryItem.fromFirestore)
              .where((item) => item.belongsInCommunicationHistory)
              .toList(growable: false),
        );
  }

  Future<void> markRead({
    required String clubId,
    required String memberId,
    required String notificationId,
  }) {
    return _collection(clubId, memberId).doc(notificationId).update({
      'read': true,
      'read_at': FieldValue.serverTimestamp(),
    });
  }
}
