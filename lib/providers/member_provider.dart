import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';

/// Provider voor member data caching
/// Laadt en cached member data na login voor snelle toegang
class MemberProvider with ChangeNotifier {
  final FirebaseFirestore _firestore = FirebaseFirestore.instance;

  Map<String, dynamic>? _memberData;
  String? _clubId;
  String? _userId;
  bool _isLoading = false;
  String? _errorMessage;

  // Getters
  Map<String, dynamic>? get memberData => _memberData;
  bool get isLoading => _isLoading;
  String? get errorMessage => _errorMessage;
  bool get isLoaded => _memberData != null;

  // Member data getters
  String? get odooId => _memberData?['odooId'] as String?;
  String? get odooIdLid => _memberData?['odooIdLid'] as String?;
  String? get appRole => _memberData?['app_role'] as String?;
  String? get nom => _memberData?['nom'] as String?;
  String? get prenom => _memberData?['prenom'] as String?;
  String? get email => _memberData?['email'] as String?;
  String? get phoneNumber => _memberData?['phone_number'] as String?;
  String? get photoUrl => _memberData?['photo_url'] as String?;

  /// Club statuten (functies binnen de club: encadrant, accueil, etc.)
  List<String> get clubStatuten {
    final statuten = _memberData?['clubStatuten'];
    if (statuten == null) return [];
    if (statuten is List) {
      return statuten.map((e) => e.toString()).toList();
    }
    return [];
  }

  /// Check if user has a specific club function
  bool hasClubFunction(String function) {
    return clubStatuten.any(
      (s) => s.toLowerCase() == function.toLowerCase(),
    );
  }

  /// Check if user is an encadrant
  bool get isEncadrant => hasClubFunction('encadrant') || hasClubFunction('Encadrant');

  /// Check if user is accueil
  bool get isAccueil => hasClubFunction('accueil') || hasClubFunction('Accueil');

  /// Check if user is gonflage
  bool get isGonflage => hasClubFunction('gonflage') || hasClubFunction('Gonflage');

  /// Check if user can approve expenses (validateur, admin, or superadmin)
  bool get canApproveExpenses {
    final role = appRole?.toLowerCase();
    return role == 'validateur' || role == 'admin' || role == 'superadmin';
  }

  /// Full display name
  String get displayName {
    final p = prenom ?? '';
    final n = nom ?? '';
    final fullName = '$p $n'.trim();
    return fullName.isNotEmpty ? fullName : email ?? 'Utilisateur';
  }

  /// Laad member data van Firestore
  Future<void> loadMemberData(String clubId, String userId) async {
    if (_isLoading) return;

    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      final doc = await _firestore
          .collection('clubs')
          .doc(clubId)
          .collection('members')
          .doc(userId)
          .get();

      if (doc.exists) {
        _memberData = doc.data();
        _clubId = clubId;
        _userId = userId;
        debugPrint('✅ MemberProvider: Data geladen voor $userId');
        debugPrint('   - clubStatuten: $clubStatuten');
        debugPrint('   - appRole: $appRole');
      } else {
        _errorMessage = 'Member document niet gevonden';
        debugPrint('⚠️ MemberProvider: Member document niet gevonden');
      }
    } catch (e) {
      _errorMessage = e.toString();
      debugPrint('❌ MemberProvider: Fout bij laden - $e');
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  /// Refresh member data
  Future<void> refresh() async {
    if (_clubId != null && _userId != null) {
      await loadMemberData(_clubId!, _userId!);
    }
  }

  /// Clear member data (bij logout)
  void clear() {
    _memberData = null;
    _clubId = null;
    _userId = null;
    _errorMessage = null;
    debugPrint('🧹 MemberProvider: Data gewist');
    notifyListeners();
  }
}
