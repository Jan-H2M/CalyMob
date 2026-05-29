import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:rxdart/rxdart.dart';

class BoutiqueAccessService {
  final FirebaseFirestore _firestore;

  BoutiqueAccessService({FirebaseFirestore? firestore})
      : _firestore = firestore ?? FirebaseFirestore.instance;

  Stream<bool> watchCanAccessBoutique({
    required String clubId,
    required String userId,
  }) {
    final flagsStream = _firestore
        .collection('clubs')
        .doc(clubId)
        .collection('settings')
        .doc('feature_flags')
        .snapshots();
    final memberStream = _firestore
        .collection('clubs')
        .doc(clubId)
        .collection('members')
        .doc(userId)
        .snapshots();

    return Rx.combineLatest2<DocumentSnapshot<Map<String, dynamic>>,
        DocumentSnapshot<Map<String, dynamic>>, bool>(
      flagsStream,
      memberStream,
      (flagsDoc, memberDoc) => _canAccess(flagsDoc.data(), memberDoc.data()),
    );
  }

  bool _canAccess(
    Map<String, dynamic>? flags,
    Map<String, dynamic>? member,
  ) {
    if (member == null) return false;

    final appRole = member['app_role']?.toString().toLowerCase();
    final isAdmin = appRole == 'admin' || appRole == 'superadmin';
    final enabled = flags?['boutiqueEnabled'] == true ||
        flags?['boutiqueMobileEnabled'] == true;
    final adminOnly = flags?['boutiqueAdminOnly'] == true;
    final access = member['feature_access'];
    final hasMemberAccess = access is Map && access['boutique'] == true;

    if (!enabled) return false;
    if (isAdmin || hasMemberAccess) return true;
    return !adminOnly;
  }
}
