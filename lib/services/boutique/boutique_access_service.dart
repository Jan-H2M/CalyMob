import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:rxdart/rxdart.dart';

import '../feature_flag_service.dart';

/// Eén gedeelde clientpolicy voor de Boutique-module en haar vijf secties.
class BoutiqueAccessPolicy {
  static const Set<String> _boutiqueResponsibilityValues = {
    'Responsable boutique',
    'Responsable Boutique',
    'responsable boutique',
    'RESPONSABLE BOUTIQUE',
    'RB',
    'rb',
    'Rb',
    'rB',
  };

  static bool isActiveMember(Map<String, dynamic>? member) {
    return member?['member_status'] == 'active';
  }

  static bool hasBoutiqueResponsibility(Map<String, dynamic>? member) {
    final statuten = member?['clubStatuten'];
    if (statuten is! Iterable) return false;

    return statuten.any(_boutiqueResponsibilityValues.contains);
  }

  static bool canAccessMode(String? mode, Map<String, dynamic>? member) {
    if (!isActiveMember(member)) return false;

    switch (mode) {
      case FeatureFlagService.modeTous:
        return true;
      case FeatureFlagService.modePreparation:
        return hasBoutiqueResponsibility(member);
      case FeatureFlagService.modeMasque:
      default:
        return false;
    }
  }
}

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
      (flagsDoc, memberDoc) =>
          canAccessFromData(flags: flagsDoc.data(), member: memberDoc.data()),
    );
  }

  static bool canAccessFromData({
    required Map<String, dynamic>? flags,
    required Map<String, dynamic>? member,
  }) {
    final enabled = flags?['boutiqueEnabled'] == true ||
        flags?['boutiqueMobileEnabled'] == true;
    if (!enabled) return false;

    final mode = FeatureFlagService.parseBoutiqueVisibility(flags)['access'];
    return BoutiqueAccessPolicy.canAccessMode(mode, member);
  }
}
