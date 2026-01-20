/// EPC QR Code Generator Utility
///
/// Génère des payloads EPC (European Payments Council) QR code pour virements SEPA.
/// Ce standard permet aux applications bancaires de scanner et pré-remplir les détails de paiement.
///
/// Structure du QR Code EPC (12 lignes):
/// 1. BCD (Service Tag - fixe)
/// 2. 002 (Version - utilise 002 pour EEE sans BIC obligatoire)
/// 3. 1 (Encodage caractères - 1=UTF-8)
/// 4. SCT (Code d'identification - SEPA Credit Transfer)
/// 5. [BIC] (optionnel en version 002 pour EEE)
/// 6. [Nom Bénéficiaire] (max 70 chars)
/// 7. [IBAN] (max 34 chars)
/// 8. [Montant EUR] (format: EURX.XX)
/// 9. [Code Purpose] (4 chars, optionnel)
/// 10. [Référence Structurée] (optionnel, ISO 11649)
/// 11. [Texte non structuré] (max 140 chars, description paiement)
/// 12. [Info Bénéficiaire] (max 70 chars, optionnel)

/// Données pour générer un QR code EPC
class EpcQrCodeData {
  /// Nom du bénéficiaire (max 70 caractères)
  final String beneficiaryName;

  /// IBAN du bénéficiaire (max 34 caractères)
  final String iban;

  /// Montant en EUR (0.01 - 999999999.99)
  final double amount;

  /// BIC/SWIFT code (optionnel en EEE avec version 002)
  final String? bic;

  /// Description du paiement (max 140 caractères)
  final String? description;

  /// Référence structurée ISO 11649 (optionnel)
  final String? reference;

  /// Code purpose (4 caractères, ex: "CHAR")
  final String? purposeCode;

  /// Info supplémentaire bénéficiaire (max 70 caractères)
  final String? beneficiaryInfo;

  const EpcQrCodeData({
    required this.beneficiaryName,
    required this.iban,
    required this.amount,
    this.bic,
    this.description,
    this.reference,
    this.purposeCode,
    this.beneficiaryInfo,
  });
}

/// Résultat de validation des données EPC
class EpcValidationResult {
  final bool valid;
  final List<String> errors;

  const EpcValidationResult({
    required this.valid,
    required this.errors,
  });
}

/// Valide les données pour un QR code EPC
EpcValidationResult validateEpcData(EpcQrCodeData data) {
  final errors = <String>[];

  // Valider le nom du bénéficiaire
  if (data.beneficiaryName.trim().isEmpty) {
    errors.add('Nom du bénéficiaire requis');
  } else if (data.beneficiaryName.length > 70) {
    errors.add('Nom du bénéficiaire trop long (max 70 caractères)');
  }

  // Valider l'IBAN
  if (data.iban.trim().isEmpty) {
    errors.add('IBAN requis');
  } else {
    final cleanIban = data.iban.replaceAll(RegExp(r'\s'), '').toUpperCase();
    if (cleanIban.length < 15 || cleanIban.length > 34) {
      errors.add('IBAN invalide (15-34 caractères)');
    }
  }

  // Valider le montant
  if (data.amount < 0.01) {
    errors.add('Montant minimum: 0.01 EUR');
  } else if (data.amount > 999999999.99) {
    errors.add('Montant maximum: 999,999,999.99 EUR');
  }

  // Valider la description
  if (data.description != null && data.description!.length > 140) {
    errors.add('Description trop longue (max 140 caractères)');
  }

  // Valider le BIC si fourni
  if (data.bic != null && data.bic!.isNotEmpty) {
    final bicRegex = RegExp(r'^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$');
    if (!bicRegex.hasMatch(data.bic!.toUpperCase())) {
      errors.add('Format BIC invalide');
    }
  }

  // Valider le code purpose si fourni
  if (data.purposeCode != null && data.purposeCode!.isNotEmpty) {
    final purposeRegex = RegExp(r'^[A-Z]{4}$');
    if (!purposeRegex.hasMatch(data.purposeCode!.toUpperCase())) {
      errors.add('Purpose code doit être 4 lettres');
    }
  }

  return EpcValidationResult(
    valid: errors.isEmpty,
    errors: errors,
  );
}

/// Génère le payload string pour un QR code EPC
///
/// Retourne null si les données sont invalides
String? generateEpcPayload(EpcQrCodeData data) {
  final validation = validateEpcData(data);
  if (!validation.valid) {
    print('Validation EPC échouée: ${validation.errors}');
    return null;
  }

  // Nettoyer et formater les données
  final cleanIban = data.iban.replaceAll(RegExp(r'\s'), '').toUpperCase();
  final cleanBic = data.bic?.replaceAll(RegExp(r'\s'), '').toUpperCase() ?? '';
  final beneficiaryName = data.beneficiaryName.trim().substring(
    0,
    data.beneficiaryName.length > 70 ? 70 : data.beneficiaryName.length,
  );
  final amount = 'EUR${data.amount.toStringAsFixed(2)}';
  final purposeCode =
      data.purposeCode?.toUpperCase().substring(0, 4.clamp(0, data.purposeCode?.length ?? 0)) ?? '';
  final reference = data.reference?.substring(0, 35.clamp(0, data.reference?.length ?? 0)) ?? '';
  final description =
      data.description?.substring(0, 140.clamp(0, data.description?.length ?? 0)) ?? '';
  final beneficiaryInfo =
      data.beneficiaryInfo?.substring(0, 70.clamp(0, data.beneficiaryInfo?.length ?? 0)) ?? '';

  // Construire le payload 12 lignes
  final lines = [
    'BCD', // 1. Service Tag
    '002', // 2. Version (002 = BIC optionnel en EEE)
    '1', // 3. Encodage caractères (1 = UTF-8)
    'SCT', // 4. Code d'identification
    cleanBic, // 5. BIC (optionnel)
    beneficiaryName, // 6. Nom bénéficiaire
    cleanIban, // 7. IBAN
    amount, // 8. Montant
    purposeCode, // 9. Code purpose (optionnel)
    reference, // 10. Référence structurée (optionnel)
    description, // 11. Texte non structuré (optionnel)
    beneficiaryInfo, // 12. Info bénéficiaire (optionnel)
  ];

  // Supprimer les lignes vides à la fin (certaines apps bancaires ont des problèmes)
  while (lines.isNotEmpty && lines.last.isEmpty) {
    lines.removeLast();
  }

  return lines.join('\n');
}

/// Vérifie si un QR code EPC peut être généré pour un paiement
///
/// Retourne un objet avec canGenerate et reason si non possible
({bool canGenerate, String? reason}) canGenerateEpcQr({
  required String status,
  required bool hasIban,
  required bool isAlreadyPaid,
}) {
  if (isAlreadyPaid) {
    return (canGenerate: false, reason: 'Déjà remboursé');
  }

  if (status == 'paiement_effectue') {
    return (canGenerate: false, reason: 'Paiement effectué');
  }

  if (status != 'approuve') {
    return (canGenerate: false, reason: "En attente d'approbation");
  }

  if (!hasIban) {
    return (canGenerate: false, reason: 'IBAN non renseigné');
  }

  return (canGenerate: true, reason: null);
}

/// Formate un IBAN pour l'affichage (groupes de 4)
String formatIbanDisplay(String iban) {
  if (iban.isEmpty) return '';
  final clean = iban.replaceAll(RegExp(r'\s'), '').toUpperCase();
  return clean.replaceAllMapped(
    RegExp(r'.{4}'),
    (match) => '${match.group(0)} ',
  ).trim();
}

/// Génère la communication de paiement structurée
///
/// Format: #{eventNumber} {eventName} {date} {participantName}
/// Exemple: #200006 Villers-2-Eglises 25/01/2026 Jean Dupont
String generatePaymentCommunication({
  required String? eventNumber,
  required String? eventId,
  required String eventTitle,
  required DateTime? eventDate,
  required String participantFirstName,
  required String participantLastName,
}) {
  // Event number ou premiers 6 caractères de l'ID
  final number = eventNumber ?? eventId?.substring(0, 6).toUpperCase() ?? '';

  // Nom de l'événement (max 40 chars)
  final name = eventTitle.length > 40 ? eventTitle.substring(0, 40) : eventTitle;

  // Date formatée DD/MM/YYYY
  String dateStr = '';
  if (eventDate != null) {
    dateStr =
        '${eventDate.day.toString().padLeft(2, '0')}/${eventDate.month.toString().padLeft(2, '0')}/${eventDate.year}';
  }

  // Nom du participant (max 30 chars)
  final participantName = '$participantFirstName $participantLastName'.trim();
  final truncatedName =
      participantName.length > 30 ? participantName.substring(0, 30) : participantName;

  // Construire la communication
  final communication = '#$number $name $dateStr $truncatedName'.trim();

  // Max 140 caractères (limite EPC spec)
  return communication.length > 140 ? communication.substring(0, 140) : communication;
}
