import 'package:cloud_firestore/cloud_firestore.dart';

/// Statut de validation pour cotisation et certificat médical
enum ValidationStatus { valid, warning, expired, missing }

/// Modèle pour le profil d'un membre
class MemberProfile {
  final String id; // User ID
  final String nom;
  final String prenom;
  final String email;
  final String? plongeurCode; // Niveau de plongée (ex: "P2", "P4", "MC")
  final String? plongeurNiveau; // Niveau complet en texte
  final String?
      fonctionDefaut; // Fonction par défaut: "membre", "encadrant", "ca"
  final List<String> clubStatuten; // Fonctions multiples dans le club

  // Photo de profil
  final String? photoUrl; // URL de la photo dans Firebase Storage
  final DateTime? photoUploadedAt; // Date de téléchargement de la photo

  // Consentements
  final bool consentInternalPhoto; // Consentement pour usage interne (REQUIS)
  final bool
      consentExternalPhoto; // Consentement pour usage externe (OPTIONNEL)
  final DateTime? consentInternalPhotoDate; // Date du consentement interne
  final DateTime? consentExternalPhotoDate; // Date du consentement externe

  // Partage de contact
  final bool shareEmail; // Partager l'email dans "Who's Who"
  final bool sharePhone; // Partager le téléphone dans "Who's Who"
  final String? phoneNumber; // Numéro de téléphone

  // Informations personnelles complémentaires
  final DateTime? birthDate;
  final String? addressStreet;
  final String? addressPostcode;
  final String? addressCity;
  final String? addressCountry;
  final String? legacyAddress;

  // Legacy banking fields kept for display while sensitive_info/banking rolls out
  final String? iban;
  final List<String> ibans;

  // Notifications
  final bool notificationsEnabled; // Notifications push activées
  final String? fcmToken; // Token FCM pour les notifications

  // Statut membre
  final String? memberStatus; // "active", "inactive", "deleted"

  // Validation dates (for attendance tracking)
  final DateTime? cotisationValidite; // Membership fee validity
  final DateTime? certificatMedicalValidite; // Medical certificate validity

  // Métadonnées
  final DateTime? createdAt;
  final DateTime? updatedAt;

  MemberProfile({
    required this.id,
    required this.nom,
    required this.prenom,
    required this.email,
    this.plongeurCode,
    this.plongeurNiveau,
    this.fonctionDefaut,
    this.clubStatuten = const [],
    this.photoUrl,
    this.photoUploadedAt,
    this.consentInternalPhoto = false,
    this.consentExternalPhoto = false,
    this.consentInternalPhotoDate,
    this.consentExternalPhotoDate,
    this.shareEmail = true, // Par défaut, partager l'email
    this.sharePhone = true, // Par défaut, partager le téléphone
    this.phoneNumber,
    this.birthDate,
    this.addressStreet,
    this.addressPostcode,
    this.addressCity,
    this.addressCountry,
    this.legacyAddress,
    this.iban,
    this.ibans = const [],
    this.notificationsEnabled = true, // Par défaut, notifications activées
    this.fcmToken,
    this.memberStatus,
    this.cotisationValidite,
    this.certificatMedicalValidite,
    this.createdAt,
    this.updatedAt,
  });

  /// Convertir depuis Firestore
  factory MemberProfile.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;

    return MemberProfile(
      id: doc.id,
      // Support both French (nom/prenom) and English (lastName/firstName) field names
      nom: data['nom'] ?? data['lastName'] ?? '',
      prenom: data['prenom'] ?? data['firstName'] ?? '',
      email: data['email'] ?? '',
      plongeurCode: data['plongeur_code'],
      plongeurNiveau: data['plongeur_niveau'],
      fonctionDefaut: data['fonction_defaut'],
      clubStatuten:
          (data['clubStatuten'] as List<dynamic>?)?.cast<String>() ?? [],
      photoUrl: data['photo_url'],
      photoUploadedAt: (data['photo_uploaded_at'] as Timestamp?)?.toDate(),
      consentInternalPhoto: data['consent_internal_photo'] ?? false,
      consentExternalPhoto: data['consent_external_photo'] ?? false,
      consentInternalPhotoDate:
          (data['consent_internal_photo_date'] as Timestamp?)?.toDate(),
      consentExternalPhotoDate:
          (data['consent_external_photo_date'] as Timestamp?)?.toDate(),
      shareEmail: data['share_email'] ?? true,
      sharePhone: data['share_phone'] ?? true,
      phoneNumber: data['phone_number'],
      birthDate: (data['birth_date'] as Timestamp?)?.toDate() ??
          (data['date_naissance'] as Timestamp?)?.toDate(),
      addressStreet: data['address_street'],
      addressPostcode: data['address_postcode'] ?? data['code_postal'],
      addressCity: data['address_city'] ?? data['localite'],
      addressCountry: data['address_country'] ?? data['pays'],
      legacyAddress: data['adresse'] ?? data['address'],
      iban: data['iban'],
      ibans: (data['ibans'] as List<dynamic>?)?.cast<String>() ?? [],
      notificationsEnabled: data['notifications_enabled'] ?? true,
      fcmToken: data['fcm_token'],
      memberStatus: resolveMemberStatus(data),
      cotisationValidite: (data['cotisation_validite'] as Timestamp?)?.toDate(),
      certificatMedicalValidite:
          (data['certificat_medical_validite'] as Timestamp?)?.toDate(),
      createdAt: (data['created_at'] as Timestamp?)?.toDate(),
      updatedAt: (data['updated_at'] as Timestamp?)?.toDate(),
    );
  }

  /// Convertir vers Firestore
  Map<String, dynamic> toFirestore() {
    return {
      'nom': nom,
      'prenom': prenom,
      'email': email,
      'plongeur_code': plongeurCode,
      'plongeur_niveau': plongeurNiveau,
      'fonction_defaut': fonctionDefaut,
      'clubStatuten': clubStatuten,
      'photo_url': photoUrl,
      'photo_uploaded_at':
          photoUploadedAt != null ? Timestamp.fromDate(photoUploadedAt!) : null,
      'consent_internal_photo': consentInternalPhoto,
      'consent_external_photo': consentExternalPhoto,
      'consent_internal_photo_date': consentInternalPhotoDate != null
          ? Timestamp.fromDate(consentInternalPhotoDate!)
          : null,
      'consent_external_photo_date': consentExternalPhotoDate != null
          ? Timestamp.fromDate(consentExternalPhotoDate!)
          : null,
      'share_email': shareEmail,
      'share_phone': sharePhone,
      'phone_number': phoneNumber,
      'birth_date': birthDate != null ? Timestamp.fromDate(birthDate!) : null,
      'address_street': addressStreet,
      'address_postcode': addressPostcode,
      'address_city': addressCity,
      'address_country': addressCountry,
      'notifications_enabled': notificationsEnabled,
      'fcm_token': fcmToken,
      'updated_at': FieldValue.serverTimestamp(),
    };
  }

  /// Copier avec modifications
  MemberProfile copyWith({
    String? nom,
    String? prenom,
    String? email,
    String? plongeurCode,
    String? plongeurNiveau,
    String? fonctionDefaut,
    List<String>? clubStatuten,
    String? photoUrl,
    DateTime? photoUploadedAt,
    bool? consentInternalPhoto,
    bool? consentExternalPhoto,
    DateTime? consentInternalPhotoDate,
    DateTime? consentExternalPhotoDate,
    bool? shareEmail,
    bool? sharePhone,
    String? phoneNumber,
    DateTime? birthDate,
    String? addressStreet,
    String? addressPostcode,
    String? addressCity,
    String? addressCountry,
    String? legacyAddress,
    String? iban,
    List<String>? ibans,
    bool? notificationsEnabled,
    String? fcmToken,
  }) {
    return MemberProfile(
      id: id,
      nom: nom ?? this.nom,
      prenom: prenom ?? this.prenom,
      email: email ?? this.email,
      plongeurCode: plongeurCode ?? this.plongeurCode,
      plongeurNiveau: plongeurNiveau ?? this.plongeurNiveau,
      fonctionDefaut: fonctionDefaut ?? this.fonctionDefaut,
      clubStatuten: clubStatuten ?? this.clubStatuten,
      photoUrl: photoUrl ?? this.photoUrl,
      photoUploadedAt: photoUploadedAt ?? this.photoUploadedAt,
      consentInternalPhoto: consentInternalPhoto ?? this.consentInternalPhoto,
      consentExternalPhoto: consentExternalPhoto ?? this.consentExternalPhoto,
      consentInternalPhotoDate:
          consentInternalPhotoDate ?? this.consentInternalPhotoDate,
      consentExternalPhotoDate:
          consentExternalPhotoDate ?? this.consentExternalPhotoDate,
      shareEmail: shareEmail ?? this.shareEmail,
      sharePhone: sharePhone ?? this.sharePhone,
      phoneNumber: phoneNumber ?? this.phoneNumber,
      birthDate: birthDate ?? this.birthDate,
      addressStreet: addressStreet ?? this.addressStreet,
      addressPostcode: addressPostcode ?? this.addressPostcode,
      addressCity: addressCity ?? this.addressCity,
      addressCountry: addressCountry ?? this.addressCountry,
      legacyAddress: legacyAddress ?? this.legacyAddress,
      iban: iban ?? this.iban,
      ibans: ibans ?? this.ibans,
      notificationsEnabled: notificationsEnabled ?? this.notificationsEnabled,
      fcmToken: fcmToken ?? this.fcmToken,
      createdAt: createdAt,
      updatedAt: DateTime.now(),
    );
  }

  /// Nom complet
  String get fullName => '$prenom $nom'.trim();

  String? get primaryIban {
    if (iban != null && iban!.trim().isNotEmpty) return iban;
    if (ibans.isNotEmpty && ibans.first.trim().isNotEmpty) return ibans.first;
    return null;
  }

  String? get formattedAddress {
    final locality = [addressPostcode, addressCity]
        .whereType<String>()
        .where((part) => part.trim().isNotEmpty)
        .join(' ');
    final parts = [addressStreet, locality, addressCountry]
        .whereType<String>()
        .where((part) => part.trim().isNotEmpty)
        .toList();
    if (parts.isNotEmpty) return parts.join(', ');
    return legacyAddress;
  }

  /// Vérifie si le profil a une photo
  bool get hasPhoto => photoUrl != null && photoUrl!.isNotEmpty;

  /// Vérifie si le profil est complet (photo + consentements)
  bool get isComplete => hasPhoto && consentInternalPhoto;

  /// Resolve active status from the same legacy fields used by CalyCompta.
  ///
  /// Older member documents can carry contradictory status fields after
  /// migrations. For mobile display we treat any explicit active signal as
  /// active, while still excluding explicit inactive/deleted records when no
  /// active signal exists.
  static String? resolveMemberStatus(Map<String, dynamic> data) {
    if (data['member_status'] == 'active' ||
        data['app_status'] == 'active' ||
        data['status'] == 'active' ||
        data['isActive'] == true ||
        data['actif'] == true) {
      return 'active';
    }

    final rawStatus =
        data['member_status'] ?? data['app_status'] ?? data['status'];
    if (rawStatus == 'inactive' ||
        rawStatus == 'deleted' ||
        rawStatus == 'archived' ||
        rawStatus == 'suspended' ||
        rawStatus == 'pending' ||
        data['isActive'] == false ||
        data['actif'] == false) {
      return 'inactive';
    }

    return null;
  }

  /// Vérifie si le membre est actif
  bool get isActive => memberStatus == 'active' || memberStatus == null;

  /// Statut de validation de la cotisation
  ValidationStatus get cotisationStatus {
    if (cotisationValidite == null) return ValidationStatus.missing;
    final now = DateTime.now();
    final daysUntilExpiry = cotisationValidite!.difference(now).inDays;

    if (daysUntilExpiry < 0) return ValidationStatus.expired;
    if (daysUntilExpiry <= 30) return ValidationStatus.warning;
    return ValidationStatus.valid;
  }

  /// Statut de validation du certificat médical
  ValidationStatus get certificatStatus {
    if (certificatMedicalValidite == null) return ValidationStatus.missing;
    final now = DateTime.now();
    final daysUntilExpiry = certificatMedicalValidite!.difference(now).inDays;

    if (daysUntilExpiry < 0) return ValidationStatus.expired;
    if (daysUntilExpiry <= 30) return ValidationStatus.warning;
    return ValidationStatus.valid;
  }
}
