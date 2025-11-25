import 'package:cloud_firestore/cloud_firestore.dart';

/// Modèle pour le profil d'un membre
class MemberProfile {
  final String id; // User ID
  final String nom;
  final String prenom;
  final String email;
  final String? plongeurCode; // Niveau de plongée (ex: "P2", "P4", "MC")
  final String? plongeurNiveau; // Niveau complet en texte
  final String? role; // Rôle dans le club
  final String? fonctionDefaut; // Fonction par défaut: "membre", "encadrant", "ca"
  final List<String> clubStatuten; // Fonctions multiples dans le club

  // Photo de profil
  final String? photoUrl; // URL de la photo dans Firebase Storage
  final DateTime? photoUploadedAt; // Date de téléchargement de la photo

  // Consentements
  final bool consentInternalPhoto; // Consentement pour usage interne (REQUIS)
  final bool consentExternalPhoto; // Consentement pour usage externe (OPTIONNEL)
  final DateTime? consentInternalPhotoDate; // Date du consentement interne
  final DateTime? consentExternalPhotoDate; // Date du consentement externe

  // Partage de contact
  final bool shareEmail; // Partager l'email dans "Who's Who"
  final bool sharePhone; // Partager le téléphone dans "Who's Who"
  final String? phoneNumber; // Numéro de téléphone

  // Notifications
  final bool notificationsEnabled; // Notifications push activées
  final String? fcmToken; // Token FCM pour les notifications

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
    this.role,
    this.fonctionDefaut,
    this.clubStatuten = const [],
    this.photoUrl,
    this.photoUploadedAt,
    this.consentInternalPhoto = false,
    this.consentExternalPhoto = false,
    this.consentInternalPhotoDate,
    this.consentExternalPhotoDate,
    this.shareEmail = true, // Par défaut, partager l'email
    this.sharePhone = false, // Par défaut, ne pas partager le téléphone
    this.phoneNumber,
    this.notificationsEnabled = true, // Par défaut, notifications activées
    this.fcmToken,
    this.createdAt,
    this.updatedAt,
  });

  /// Convertir depuis Firestore
  factory MemberProfile.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;

    return MemberProfile(
      id: doc.id,
      nom: data['nom'] ?? '',
      prenom: data['prenom'] ?? '',
      email: data['email'] ?? '',
      plongeurCode: data['plongeur_code'],
      plongeurNiveau: data['plongeur_niveau'],
      role: data['role'],
      fonctionDefaut: data['fonction_defaut'],
      clubStatuten: (data['clubStatuten'] as List<dynamic>?)?.cast<String>() ?? [],
      photoUrl: data['photo_url'],
      photoUploadedAt: (data['photo_uploaded_at'] as Timestamp?)?.toDate(),
      consentInternalPhoto: data['consent_internal_photo'] ?? false,
      consentExternalPhoto: data['consent_external_photo'] ?? false,
      consentInternalPhotoDate: (data['consent_internal_photo_date'] as Timestamp?)?.toDate(),
      consentExternalPhotoDate: (data['consent_external_photo_date'] as Timestamp?)?.toDate(),
      shareEmail: data['share_email'] ?? true,
      sharePhone: data['share_phone'] ?? false,
      phoneNumber: data['phone_number'],
      notificationsEnabled: data['notifications_enabled'] ?? true,
      fcmToken: data['fcm_token'],
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
      'role': role,
      'fonction_defaut': fonctionDefaut,
      'clubStatuten': clubStatuten,
      'photo_url': photoUrl,
      'photo_uploaded_at': photoUploadedAt != null ? Timestamp.fromDate(photoUploadedAt!) : null,
      'consent_internal_photo': consentInternalPhoto,
      'consent_external_photo': consentExternalPhoto,
      'consent_internal_photo_date': consentInternalPhotoDate != null ? Timestamp.fromDate(consentInternalPhotoDate!) : null,
      'consent_external_photo_date': consentExternalPhotoDate != null ? Timestamp.fromDate(consentExternalPhotoDate!) : null,
      'share_email': shareEmail,
      'share_phone': sharePhone,
      'phone_number': phoneNumber,
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
    String? role,
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
      role: role ?? this.role,
      fonctionDefaut: fonctionDefaut ?? this.fonctionDefaut,
      clubStatuten: clubStatuten ?? this.clubStatuten,
      photoUrl: photoUrl ?? this.photoUrl,
      photoUploadedAt: photoUploadedAt ?? this.photoUploadedAt,
      consentInternalPhoto: consentInternalPhoto ?? this.consentInternalPhoto,
      consentExternalPhoto: consentExternalPhoto ?? this.consentExternalPhoto,
      consentInternalPhotoDate: consentInternalPhotoDate ?? this.consentInternalPhotoDate,
      consentExternalPhotoDate: consentExternalPhotoDate ?? this.consentExternalPhotoDate,
      shareEmail: shareEmail ?? this.shareEmail,
      sharePhone: sharePhone ?? this.sharePhone,
      phoneNumber: phoneNumber ?? this.phoneNumber,
      notificationsEnabled: notificationsEnabled ?? this.notificationsEnabled,
      fcmToken: fcmToken ?? this.fcmToken,
      createdAt: createdAt,
      updatedAt: DateTime.now(),
    );
  }

  /// Nom complet
  String get fullName => '$prenom $nom'.trim();

  /// Vérifie si le profil a une photo
  bool get hasPhoto => photoUrl != null && photoUrl!.isNotEmpty;

  /// Vérifie si le profil est complet (photo + consentements)
  bool get isComplete => hasPhoto && consentInternalPhoto;
}
