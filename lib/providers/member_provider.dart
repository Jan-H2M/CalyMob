import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/foundation.dart';
import '../utils/member_name.dart';
import '../utils/club_role_utils.dart';

/// Provider voor member data caching
/// Laadt en cached member data na login voor snelle toegang
class MemberProvider with ChangeNotifier {
  MemberProvider({
    FirebaseFirestore? firestore,
    @visibleForTesting
    Future<Map<String, dynamic>?> Function(String clubId, String userId)?
        memberLoader,
  })  : _firestore = firestore,
        _memberLoader = memberLoader;

  final FirebaseFirestore? _firestore;
  final Future<Map<String, dynamic>?> Function(String clubId, String userId)?
      _memberLoader;

  Map<String, dynamic>? _memberData;
  String? _clubId;
  String? _userId;
  bool _isLoading = false;
  String? _errorMessage;
  int _loadGeneration = 0;

  // Getters
  Map<String, dynamic>? get memberData => _memberData;
  bool get isLoading => _isLoading;
  String? get errorMessage => _errorMessage;
  bool get isLoaded => _memberData != null;
  bool isLoadedFor(String clubId, String userId) =>
      _memberData != null && _clubId == clubId && _userId == userId;

  // Member data getters
  String? get odooId => _memberData?['odooId'] as String?;
  String? get odooIdLid => _memberData?['odooIdLid'] as String?;
  String? get appRole => _memberData?['app_role'] as String?;
  String? get nom => _memberData == null ? null : memberLastName(_memberData!);
  String? get prenom =>
      _memberData == null ? null : memberFirstName(_memberData!);
  String? get email => _memberData?['email'] as String?;
  String? get phoneNumber => _memberData?['phone_number'] as String?;
  String? get photoUrl => _memberData?['photo_url'] as String?;
  bool get consentInternalPhoto =>
      _memberData?['consent_internal_photo'] == true;

  DateTime? get avatarNudgeSnoozedUntil {
    final value = _memberData?['avatar_nudge_snoozed_until'];
    if (value is Timestamp) return value.toDate();
    if (value is DateTime) return value;
    if (value is String) return DateTime.tryParse(value);
    return null;
  }

  /// LIFRAS plongeur code ("1*", "2*", "3*", "4*", "AM", "MC", ...)
  /// Determineert het brevet-niveau van de member.
  String? get plongeurCode => _memberData?['plongeur_code'] as String?;

  /// Expliciete formation-doelgroep, bv. "2*" of "AM".
  String? get targetFormationLevel =>
      _memberData?['target_formation_level'] as String?;

  /// True wanneer de member actief aan een formation deelneemt.
  /// Een 1★ + formation_active=true traint voor P2, etc.
  bool get formationActive => _memberData?['formation_active'] == true;

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
    return clubStatuten.any((s) => s.toLowerCase() == function.toLowerCase());
  }

  /// Official Encadrant function. The former career label remains readable.
  bool get isEncadrant =>
      hasClubFunction('encadrant') ||
      hasClubFunction('Encadrants') ||
      hasClubFunction('E') ||
      hasClubFunction('Encadrant Carrière');

  /// Encadrants et assistants: official encadrants plus explicit assistants.
  bool get isEncadrantPiscine =>
      hasClubFunction('piscine') ||
      hasClubFunction('P') ||
      hasClubFunction('Encadrants et assistants') ||
      hasClubFunction('Encadrant Piscine') || // legacy
      isEncadrant;

  /// Check if user is an organisateur (matches lowercase/uppercase name + single-letter code)
  bool get isOrganisateur =>
      hasClubFunction('organisateur') ||
      hasClubFunction('Organisateur') ||
      hasClubFunction('o') ||
      hasClubFunction('O');

  /// Check if user is member of CA (Conseil d'Administration)
  bool get isCA => hasClubFunction('CA');

  /// Check if user can create events (Organisateur fonction)
  bool get canCreateEvents => isOrganisateur;

  /// Check if user is accueil
  bool get isAccueil =>
      hasClubFunction('accueil') || hasClubFunction('Accueil');

  /// Check if user is gonflage
  bool get isGonflage => ClubRoleUtils.hasGonflageRole(clubStatuten);

  /// Check if user can approve expenses (validateur, admin, or superadmin)
  bool get canApproveExpenses {
    final role = appRole?.toLowerCase();
    return role == 'validateur' || role == 'admin' || role == 'superadmin';
  }

  /// Check if user must change password on first login
  /// Checks both security.requirePasswordChange (new location) and root-level (legacy)
  bool get requirePasswordChange {
    // Check in security object (new location)
    final security = _memberData?['security'] as Map<String, dynamic>?;
    if (security?['requirePasswordChange'] == true) {
      return true;
    }
    // Check at root level (legacy location)
    if (_memberData?['requirePasswordChange'] == true) {
      return true;
    }
    return false;
  }

  /// Full display name
  String get displayName {
    return _memberData == null
        ? 'Utilisateur'
        : memberDisplayName(_memberData!, fallback: 'Utilisateur');
  }

  /// Laad member data van Firestore
  Future<void> loadMemberData(String clubId, String userId) async {
    final generation = ++_loadGeneration;
    final contextChanged = _clubId != clubId || _userId != userId;
    _clubId = clubId;
    _userId = userId;
    if (contextChanged) _memberData = null;
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();

    try {
      final loaded = _memberLoader != null
          ? await _memberLoader!(clubId, userId)
          : await (_firestore ?? FirebaseFirestore.instance)
              .collection('clubs')
              .doc(clubId)
              .collection('members')
              .doc(userId)
              .get()
              .then((doc) => doc.exists ? doc.data() : null);
      if (generation != _loadGeneration ||
          _clubId != clubId ||
          _userId != userId) {
        return;
      }

      if (loaded != null) {
        _memberData = loaded;
        debugPrint('✅ MemberProvider: Data geladen voor $userId');
        debugPrint('   - clubStatuten: $clubStatuten');
        debugPrint('   - appRole: $appRole');
      } else {
        _errorMessage = 'Member document niet gevonden';
        debugPrint('⚠️ MemberProvider: Member document niet gevonden');
      }
    } catch (e) {
      if (generation != _loadGeneration ||
          _clubId != clubId ||
          _userId != userId) {
        return;
      }
      _errorMessage = e.toString();
      debugPrint('❌ MemberProvider: Fout bij laden - $e');
    } finally {
      if (generation == _loadGeneration &&
          _clubId == clubId &&
          _userId == userId) {
        _isLoading = false;
        notifyListeners();
      }
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
    _loadGeneration++;
    _memberData = null;
    _clubId = null;
    _userId = null;
    _errorMessage = null;
    _isLoading = false;
    debugPrint('🧹 MemberProvider: Data gewist');
    notifyListeners();
  }
}
