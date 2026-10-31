import 'dart:async';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:rxdart/rxdart.dart';

import '../feature_flag_service.dart';
import '../../utils/authenticated_stream.dart';
import 'boutique_operations_service.dart';

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

  final bool qrEnabled;
  final bool hasPickupAssignments;

  const BoutiqueAccessState({
    required this.canAccess,
    required this.visibility,
    required this.member,
    this.qrEnabled = false,
    this.hasPickupAssignments = false,
  });

  bool get canOpenEntry => canAccess || (qrEnabled && hasPickupAssignments);

  bool canAccessSection(String key) {
    if (key == 'gestion') {
      return qrEnabled &&
          BoutiqueAccessPolicy.hasBoutiqueResponsibility(member);
    }
    if (key == 'remises') {
      return qrEnabled &&
          (hasPickupAssignments ||
              BoutiqueAccessPolicy.hasBoutiqueResponsibility(member));
    }
    return canAccess &&
        BoutiqueAccessPolicy.canAccessMode(visibility[key], member);
  }
}

class BoutiqueAccessService {
  final FirebaseFirestore _firestore;
  final BoutiqueOperationsService _operations;
  final Stream<String?> Function()? _authUserIds;

  BoutiqueAccessService(
      {FirebaseFirestore? firestore,
      Stream<String?> Function()? authUserIds,
      BoutiqueOperationsService operations = const BoutiqueOperationsService()})
      : _firestore = firestore ?? FirebaseFirestore.instance,
        _authUserIds = authUserIds,
        _operations = operations;

  Stream<bool> watchCanAccessBoutique({
    required String clubId,
    required String userId,
  }) {
    return watchBoutiqueAccess(clubId: clubId, userId: userId)
        // Re-emit even the same bool after an error, so the entry's
        // StreamBuilder can leave its unavailable state on token recovery.
        .map((state) => state.canOpenEntry);
  }

  Stream<BoutiqueAccessState> watchBoutiqueAccess({
    required String clubId,
    required String userId,
  }) =>
      authenticatedStream(
        () => _watchBoutiqueAccess(clubId: clubId, userId: userId),
        userId: userId,
        authUserIds: _authUserIds,
      );

  Stream<BoutiqueAccessState> _watchBoutiqueAccess({
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

    final core = Rx.combineLatest2<DocumentSnapshot<Map<String, dynamic>>,
        DocumentSnapshot<Map<String, dynamic>>, BoutiqueAccessState>(
      flagsStream,
      memberStream,
      (flagsDoc, memberDoc) => stateFromData(
        flags: flagsDoc.data(),
        member: memberDoc.data(),
      ),
    );
    late StreamController<BoutiqueAccessState> output;
    StreamSubscription<BoutiqueAccessState>? source;
    StreamSubscription<bool>? assignments;
    var generation = 0;
    var cancelled = false;
    output = StreamController<BoutiqueAccessState>(onListen: () {
      source = core.listen((state) {
        final current = ++generation;
        // Revoke local permissions immediately, before any assignment RPC.
        unawaited(assignments?.cancel());
        assignments = null;
        if (cancelled) return;
        output.add(state);
        if (!state.qrEnabled ||
            BoutiqueAccessPolicy.hasBoutiqueResponsibility(state.member)) {
          return;
        }
        assignments = _operations.watchHasAssignment(clubId).listen((assigned) {
          if (cancelled || current != generation) return;
          output.add(BoutiqueAccessState(
              canAccess: state.canAccess,
              visibility: state.visibility,
              member: state.member,
              qrEnabled: state.qrEnabled,
              hasPickupAssignments: assigned));
        }, onError: (Object error, StackTrace stack) {
          if (!cancelled && current == generation) output.add(state);
        });
      }, onError: (Object error, StackTrace stack) {
        generation++;
        unawaited(assignments?.cancel());
        assignments = null;
        if (!cancelled) output.addError(error, stack);
      }, cancelOnError: true);
    }, onCancel: () {
      cancelled = true;
      generation++;
      unawaited(source?.cancel());
      unawaited(assignments?.cancel());
    });
    return output.stream;
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
      qrEnabled: enabled &&
          flags?['boutiqueQrEnabled'] == true &&
          visibility['access'] != FeatureFlagService.modeMasque &&
          BoutiqueAccessPolicy.isActiveMember(member) &&
          member?['has_app_access'] != false &&
          (member?['app_status'] == null ||
              member?['app_status'] == 'active') &&
          member?['isActive'] != false &&
          member?['actif'] != false,
    );
  }
}
