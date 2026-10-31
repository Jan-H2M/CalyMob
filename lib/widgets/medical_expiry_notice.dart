import 'package:flutter/material.dart';
import '../utils/medical_validity.dart';

/// Administrative reminder only: never a clinical fitness assessment.
class MedicalExpiryNotice extends StatelessWidget {
  final DateTime? issuedOn;
  final DateTime? validUntil;
  final DateTime? now;
  final VoidCallback? onOpen;
  final bool needsReview;
  const MedicalExpiryNotice(
      {super.key,
      this.issuedOn,
      this.validUntil,
      this.now,
      this.onOpen,
      this.needsReview = false});
  @override
  Widget build(BuildContext context) {
    final result = MedicalValidity.evaluate(
        issuedOn: issuedOn,
        validUntil: validUntil,
        now: now,
        needsReview: needsReview);
    if (result.status == MedicalValidityStatus.valid) {
      return const SizedBox.shrink();
    }
    final expired = result.status == MedicalValidityStatus.expired;
    final unknown = result.status == MedicalValidityStatus.unknown;
    final date = result.expiresOn;
    final dateLabel = date == null
        ? ''
        : '${date.day.toString().padLeft(2, '0')}/${date.month.toString().padLeft(2, '0')}/${date.year}';
    final title = unknown
        ? 'Certificat médical : validité à vérifier'
        : expired
            ? 'Certificat médical : échéance dépassée'
            : 'Certificat médical : expire bientôt';
    return Card(
        color: unknown
            ? Colors.grey.shade100
            : expired
                ? Colors.red.shade50
                : Colors.amber.shade50,
        child: ListTile(
            leading: Icon(unknown ? Icons.help_outline : Icons.warning_amber),
            title: Text(title),
            subtitle: Text(unknown
                ? 'La date administrative doit être confirmée par le club.'
                : 'Échéance annuelle : $dateLabel (dernier jour inclus). Pensez à renouveler. '
                    'Ce statut administratif n’est pas un avis médical.'),
            trailing: onOpen == null ? null : const Icon(Icons.chevron_right),
            onTap: onOpen));
  }
}
