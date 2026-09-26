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

/// Live toegangscontext voor zowel de Boutique-ingang als haar vijf secties.
class BoutiqueAccessState {
  final bool canAccess;
  final Map<String, String> visibility;
  final Map<String, dynamic>? member;

  const BoutiqueAccessState({
    required this.canAccess,
    required this.visibility,
    required this.member,
  });

  bool canAccessSection(String key) {
    return canAccess &&
        BoutiqueAccessPolicy.canAccessMode(visibility[key], member);
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
    return watchBoutiqueAccess(clubId: clubId, userId: userId)
        .map((state) => state.canAccess)
        .distinct();
  }

  Stream<BoutiqueAccessState> watchBoutiqueAccess({
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
        DocumentSnapshot<Map<String, dynamic>>, BoutiqueAccessState>(
      flagsStream,
      memberStream,
      (flagsDoc, memberDoc) => stateFromData(
        flags: flagsDoc.data(),
        member: memberDoc.data(),
      ),
    );
  }

  static bool canAccessFromData({
    required Map<String, dynamic>? flags,
    required Map<String, dynamic>? member,
  }) {
    return stateFromData(flags: flags, member: member).canAccess;
  }

  static BoutiqueAccessState stateFromData({
    required Map<String, dynamic>? flags,
    required Map<String, dynamic>? member,
  }) {
    final visibility = FeatureFlagService.parseBoutiqueVisibility(flags);
    final enabled = flags?['boutiqueEnabled'] == true ||
        flags?['boutiqueMobileEnabled'] == true;
    final canAccess = enabled &&
        BoutiqueAccessPolicy.canAccessMode(visibility['access'], member);

    return BoutiqueAccessState(
      canAccess: canAccess,
      visibility: visibility,
      member: member,
    );
  }
}
