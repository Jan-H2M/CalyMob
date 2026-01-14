import 'package:flutter/material.dart';
import '../config/app_colors.dart';
import '../models/medical_certification.dart';

/// Badge affichant le statut d'un certificat médical
class CertificationStatusBadge extends StatelessWidget {
  final MedicalCertification? certification;
  final bool compact;

  const CertificationStatusBadge({
    super.key,
    this.certification,
    this.compact = false,
  });

  @override
  Widget build(BuildContext context) {
    final (icon, text, bgColor, textColor) = _getStatusDisplay();

    if (compact) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        decoration: BoxDecoration(
          color: bgColor,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 14, color: textColor),
            const SizedBox(width: 4),
            Text(
              text,
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w500,
                color: textColor,
              ),
            ),
          ],
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: textColor.withOpacity(0.3)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 18, color: textColor),
          const SizedBox(width: 8),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                text,
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  color: textColor,
                ),
              ),
              if (certification != null && _getSubtext() != null)
                Text(
                  _getSubtext()!,
                  style: TextStyle(
                    fontSize: 12,
                    color: textColor.withOpacity(0.8),
                  ),
                ),
            ],
          ),
        ],
      ),
    );
  }

  (IconData, String, Color, Color) _getStatusDisplay() {
    if (certification == null) {
      return (
        Icons.remove_circle_outline,
        'Aucun certificat',
        Colors.grey[100]!,
        Colors.grey[600]!,
      );
    }

    switch (certification!.status) {
      case CertificateStatus.pending:
        return (
          Icons.hourglass_empty,
          'En attente',
          AppColors.statusPending,
          AppColors.statusPendingText,
        );

      case CertificateStatus.rejected:
        return (
          Icons.cancel_outlined,
          'Refusé',
          AppColors.statusRejected,
          AppColors.statusRejectedText,
        );

      case CertificateStatus.approved:
        if (certification!.isExpired) {
          return (
            Icons.error_outline,
            'Expiré',
            AppColors.statusRejected,
            AppColors.statusRejectedText,
          );
        } else if (certification!.isExpiringSoon) {
          return (
            Icons.warning_amber_outlined,
            'Expire bientôt',
            AppColors.statusPending,
            AppColors.statusPendingText,
          );
        } else {
          return (
            Icons.check_circle_outline,
            'Valide',
            AppColors.statusApproved,
            AppColors.statusApprovedText,
          );
        }
    }
  }

  String? _getSubtext() {
    if (certification == null) return null;

    switch (certification!.status) {
      case CertificateStatus.pending:
        return 'Validation en cours';

      case CertificateStatus.rejected:
        return certification!.rejectionReason ?? 'Document non conforme';

      case CertificateStatus.approved:
        if (certification!.validUntil == null) return null;
        final days = certification!.daysUntilExpiry ?? 0;
        if (days < 0) {
          return 'Depuis ${-days} jour${days < -1 ? 's' : ''}';
        } else if (days == 0) {
          return "Expire aujourd'hui";
        } else if (days == 1) {
          return 'Expire demain';
        } else if (days <= 30) {
          return 'Expire dans $days jours';
        } else {
          return 'Jusqu\'au ${_formatDate(certification!.validUntil!)}';
        }
    }
  }

  String _formatDate(DateTime date) {
    return '${date.day.toString().padLeft(2, '0')}/${date.month.toString().padLeft(2, '0')}/${date.year}';
  }
}
