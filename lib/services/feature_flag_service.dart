import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';

import '../config/firebase_config.dart';
import '../providers/member_provider.dart';
import '../utils/permission_helper.dart';

@immutable
class FlagsState {
  final bool boutiqueV2Enabled;
  final bool boutiqueV2AdminOnly;
  final bool carnetFormationEnabled;
  final bool carnetFormationAdminOnly;

  const FlagsState({
    required this.boutiqueV2Enabled,
    required this.boutiqueV2AdminOnly,
    required this.carnetFormationEnabled,
    required this.carnetFormationAdminOnly,
  });

  const FlagsState.defaults()
    : boutiqueV2Enabled = false,
      boutiqueV2AdminOnly = false,
      carnetFormationEnabled = false,
      carnetFormationAdminOnly = false;

  factory FlagsState.fromMap(Map<String, dynamic> data) {
    return FlagsState(
      boutiqueV2Enabled: data['boutiqueV2Enabled'] == true,
      boutiqueV2AdminOnly: data['boutiqueV2AdminOnly'] == true,
      carnetFormationEnabled: data['carnetFormationEnabled'] == true,
      carnetFormationAdminOnly: data['carnetFormationAdminOnly'] == true,
    );
  }
}

class FeatureFlagMember {
  final bool isAdmin;

  const FeatureFlagMember({required this.isAdmin});

  factory FeatureFlagMember.fromMemberProvider(MemberProvider provider) {
    final appRole = (provider.appRole ?? '').trim().toLowerCase();
    return FeatureFlagMember(
      isAdmin:
          PermissionHelper.isAdmin(provider.clubStatuten) ||
          appRole == 'admin' ||
          appRole == 'superadmin',
    );
  }
}

typedef Member = FeatureFlagMember;

class FeatureFlagService extends ChangeNotifier {
  final FirebaseFirestore _firestore;
  final String _clubId;

  StreamSubscription<DocumentSnapshot<Map<String, dynamic>>>? _subscription;
  FlagsState _state = const FlagsState.defaults();
  bool _isLoading = true;
  String? _errorMessage;

  FeatureFlagService({
    FirebaseFirestore? firestore,
    String clubId = FirebaseConfig.defaultClubId,
  }) : _firestore = firestore ?? FirebaseFirestore.instance,
       _clubId = clubId {
    _listen();
  }

  FlagsState get state => _state;
  bool get isLoading => _isLoading;
  String? get errorMessage => _errorMessage;
  bool get boutiqueV2Enabled => _state.boutiqueV2Enabled;
  bool get boutiqueV2AdminOnly => _state.boutiqueV2AdminOnly;

  bool Function(Member member) get boutiqueV2Visible {
    return (member) =>
        _state.boutiqueV2Enabled &&
        (!_state.boutiqueV2AdminOnly || member.isAdmin);
  }

  bool isBoutiqueVisibleForMemberProvider(MemberProvider provider) {
    return boutiqueV2Visible(FeatureFlagMember.fromMemberProvider(provider));
  }

  void _listen() {
    _subscription?.cancel();
    _isLoading = true;

    _subscription = _firestore
        .collection('clubs')
        .doc(_clubId)
        .collection('settings')
        .doc('feature_flags')
        .snapshots()
        .listen(
          (snapshot) {
            _state = snapshot.exists && snapshot.data() != null
                ? FlagsState.fromMap(snapshot.data()!)
                : const FlagsState.defaults();
            _isLoading = false;
            _errorMessage = null;
            notifyListeners();
          },
          onError: (Object error, StackTrace stackTrace) {
            debugPrint('[FeatureFlagService] Firestore error: $error');
            _state = const FlagsState.defaults();
            _isLoading = false;
            _errorMessage = error.toString();
            notifyListeners();
          },
        );
  }

  @override
  void dispose() {
    _subscription?.cancel();
    super.dispose();
  }
}
