/// EPC QR Code Generator Utility
///
/// Génère des payloads EPC (European Payments Council) QR code pour virements SEPA.
/// Ce standard permet aux applications bancaires de scanner et pré-remplir les détails de paiement.

class EpcQrCodeData {
  final String beneficiaryName;
  final String iban;
  final double amount;
  final String? bic;
  final String? reference;
  final String? description;
  final String? purposeCode;
  final String? beneficiaryInfo;

  const EpcQrCodeData({
    required this.beneficiaryName,
    required this.iban,
    required this.amount,
    this.bic,
    this.reference,
    this.description,
    this.purposeCode,
    this.beneficiaryInfo,
  });
}

class EpcValidationResult {
  final bool valid;
  final List<String> errors;

  const EpcValidationResult({
    required this.valid,
    required this.errors,
  });
}

String sanitizeEpcText(String text) {
  if (text.isEmpty) return '';

  const accentMap = <String, String>{
    'à': 'a',
    'â': 'a',
    'ä': 'a',
    'á': 'a',
    'ã': 'a',
    'è': 'e',
    'é': 'e',
    'ê': 'e',
    'ë': 'e',
    'ì': 'i',
    'î': 'i',
    'ï': 'i',
    'í': 'i',
    'ò': 'o',
    'ô': 'o',
    'ö': 'o',
    'ó': 'o',
    'õ': 'o',
    'ù': 'u',
    'û': 'u',
    'ü': 'u',
    'ú': 'u',
    'ç': 'c',
    'ñ': 'n',
    'ÿ': 'y',
    'À': 'A',
    'Â': 'A',
    'Ä': 'A',
    'Á': 'A',
    'Ã': 'A',
    'È': 'E',
    'É': 'E',
    'Ê': 'E',
    'Ë': 'E',
    'Ì': 'I',
    'Î': 'I',
    'Ï': 'I',
    'Í': 'I',
    'Ò': 'O',
    'Ô': 'O',
    'Ö': 'O',
    'Ó': 'O',
    'Õ': 'O',
    'Ù': 'U',
    'Û': 'U',
    'Ü': 'U',
    'Ú': 'U',
    'Ç': 'C',
    'Ñ': 'N',
    'Ÿ': 'Y',
    '€': 'EUR',
    '&': '+',
    '@': 'at',
  };

  var sanitized = text;
  accentMap.forEach((accent, replacement) {
    sanitized = sanitized.replaceAll(accent, replacement);
  });

  sanitized = sanitized.replaceAll(RegExp(r"[^a-zA-Z0-9 /\-?:().,'+]"), '');
  sanitized = sanitized.replaceAll(RegExp(r'\s+'), ' ').trim();
  return sanitized;
}

bool isStructuredCommunication(String text) {
  if (text.isEmpty) return false;

  final cleaned = text.replaceAll(RegExp(r'[+*\s]'), '');
  final digits = cleaned.replaceAll('/', '');

  if (!RegExp(r'^\d{12}$').hasMatch(digits)) return false;

  final base = int.parse(digits.substring(0, 10));
  final checkDigit = int.parse(digits.substring(10, 12));
  final expectedCheck = base % 97 == 0 ? 97 : base % 97;

  return checkDigit == expectedCheck;
}

String formatStructuredReference(String text) {
  if (!isStructuredCommunication(text)) return '';

  final digits = text.replaceAll(RegExp(r'[^0-9]'), '');
  return '${digits.substring(0, 3)}/${digits.substring(3, 7)}/${digits.substring(7, 12)}';
}

EpcValidationResult validateEpcData(EpcQrCodeData data) {
  final errors = <String>[];

  if (data.beneficiaryName.trim().isEmpty) {
    errors.add('Nom du bénéficiaire requis');
  } else if (data.beneficiaryName.length > 70) {
    errors.add('Nom du bénéficiaire trop long (max 70 caractères)');
  }

  if (data.iban.trim().isEmpty) {
    errors.add('IBAN requis');
  } else {
    final cleanIban = data.iban.replaceAll(RegExp(r'\s'), '').toUpperCase();
    if (cleanIban.length < 15 || cleanIban.length > 34) {
      errors.add('IBAN invalide (15-34 caractères)');
    }
  }

  if (data.amount < 0.01) {
    errors.add('Montant minimum: 0.01 EUR');
  } else if (data.amount > 999999999.99) {
    errors.add('Montant maximum: 999,999,999.99 EUR');
  }

  if ((data.description?.length ?? 0) > 140) {
    errors.add('Description trop longue (max 140 caractères)');
  }

  if (data.bic != null &&
      !RegExp(
        r'^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$',
      ).hasMatch(data.bic!.toUpperCase())) {
    errors.add('Format BIC invalide');
  }

  if (data.purposeCode != null &&
      !RegExp(r'^[A-Z]{4}$').hasMatch(data.purposeCode!.toUpperCase())) {
    errors.add('Purpose code doit être 4 lettres');
  }

  return EpcValidationResult(valid: errors.isEmpty, errors: errors);
}

String? generateEpcPayload(EpcQrCodeData data) {
  final validation = validateEpcData(data);
  if (!validation.valid) {
    return null;
  }

  final cleanIban = data.iban.replaceAll(RegExp(r'\s'), '').toUpperCase();
  final cleanBic = data.bic?.replaceAll(RegExp(r'\s'), '').toUpperCase() ?? '';
  final beneficiaryName = sanitizeEpcText(data.beneficiaryName).substring(
    0,
    sanitizeEpcText(data.beneficiaryName).length > 70
        ? 70
        : sanitizeEpcText(data.beneficiaryName).length,
  );
  final amount = 'EUR${data.amount.toStringAsFixed(2)}';
  final purposeCode =
      data.purposeCode?.toUpperCase().substring(0, 4) ?? '';
  final beneficiaryInfo = sanitizeEpcText(
    data.beneficiaryInfo ?? '',
  ).substring(
    0,
    sanitizeEpcText(data.beneficiaryInfo ?? '').length > 70
        ? 70
        : sanitizeEpcText(data.beneficiaryInfo ?? '').length,
  );
  final reference = data.reference?.substring(0, 35) ?? '';
  final description = reference.isNotEmpty
      ? ''
      : sanitizeEpcText(data.description ?? '').substring(
          0,
          sanitizeEpcText(data.description ?? '').length > 140
              ? 140
              : sanitizeEpcText(data.description ?? '').length,
        );

  final lines = [
    'BCD',
    '002',
    '1',
    'SCT',
    cleanBic,
    beneficiaryName,
    cleanIban,
    amount,
    purposeCode,
    reference,
    description,
    beneficiaryInfo,
  ];

  while (lines.isNotEmpty && lines.last.isEmpty) {
    lines.removeLast();
  }

  return lines.join('\n');
}

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

String formatIbanDisplay(String iban) {
  if (iban.isEmpty) return '';
  final clean = iban.replaceAll(RegExp(r'\s'), '').toUpperCase();
  return clean.replaceAllMapped(
    RegExp(r'.{4}'),
    (match) => '${match.group(0)} ',
  ).trim();
}

String buildEpcQrPayload({
  required String iban,
  required String beneficiary,
  required double amount,
  required String structuredCommunication,
  String? bic,
}) {
  return generateEpcPayload(
        EpcQrCodeData(
          beneficiaryName: beneficiary,
          iban: iban,
          amount: amount,
          bic: bic,
          reference: formatStructuredReference(structuredCommunication),
          description: structuredCommunication,
        ),
      ) ??
      '';
}
