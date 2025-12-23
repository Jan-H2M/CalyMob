import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:intl/intl.dart';
import '../models/member_profile.dart';
import '../config/app_colors.dart';
import 'full_screen_qr_dialog.dart';

/// Widget qui affiche le QR code de l'utilisateur avec les statuts de validation
class UserQRCard extends StatelessWidget {
  final MemberProfile profile;

  const UserQRCard({
    super.key,
    required this.profile,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 2,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          children: [
            // Titre
            Row(
              children: [
                Icon(Icons.qr_code_2, color: Colors.grey.shade700),
                const SizedBox(width: 12),
                const Text(
                  'Mon QR Code',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),

            const Divider(height: 24),

            // QR Code
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: Colors.grey.shade300),
              ),
              child: QrImageView(
                data: profile.id,
                version: QrVersions.auto,
                size: 200.0,
                backgroundColor: Colors.white,
                errorCorrectionLevel: QrErrorCorrectLevel.M,
              ),
            ),

            const SizedBox(height: 16),

            // Statut de validation - Cotisation
            _buildValidationStatus(
              icon: Icons.card_membership,
              label: 'Lidgeld',
              status: profile.cotisationStatus,
              validityDate: profile.cotisationValidite,
            ),

            const SizedBox(height: 8),

            // Statut de validation - Certificat médical
            _buildValidationStatus(
              icon: Icons.medical_services,
              label: 'Medisch attest',
              status: profile.certificatStatus,
              validityDate: profile.certificatMedicalValidite,
            ),

            const SizedBox(height: 16),

            // Bouton plein écran
            OutlinedButton.icon(
              onPressed: () {
                showDialog(
                  context: context,
                  builder: (context) => FullScreenQRDialog(profile: profile),
                );
              },
              icon: const Icon(Icons.fullscreen),
              label: const Text('Volledig scherm'),
              style: OutlinedButton.styleFrom(
                foregroundColor: AppColors.middenblauw,
                side: BorderSide(color: AppColors.middenblauw),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildValidationStatus({
    required IconData icon,
    required String label,
    required ValidationStatus status,
    required DateTime? validityDate,
  }) {
    Color statusColor;
    IconData statusIcon;
    String statusText;

    switch (status) {
      case ValidationStatus.valid:
        statusColor = Colors.green;
        statusIcon = Icons.check_circle;
        statusText = validityDate != null
            ? DateFormat('dd/MM/yyyy').format(validityDate)
            : 'Geldig';
        break;
      case ValidationStatus.warning:
        statusColor = Colors.orange;
        statusIcon = Icons.warning;
        statusText = validityDate != null
            ? 'Verloopt ${DateFormat('dd/MM/yyyy').format(validityDate)}'
            : 'Verloopt binnenkort';
        break;
      case ValidationStatus.expired:
        statusColor = Colors.red;
        statusIcon = Icons.cancel;
        statusText = validityDate != null
            ? 'Verlopen ${DateFormat('dd/MM/yyyy').format(validityDate)}'
            : 'Verlopen';
        break;
      case ValidationStatus.missing:
        statusColor = Colors.red;
        statusIcon = Icons.cancel;
        statusText = 'Niet ingevuld';
        break;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: statusColor.withOpacity(0.1),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: statusColor.withOpacity(0.3)),
      ),
      child: Row(
        children: [
          Icon(icon, size: 20, color: statusColor),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              label,
              style: TextStyle(
                fontWeight: FontWeight.w500,
                color: Colors.grey.shade800,
              ),
            ),
          ),
          Icon(statusIcon, size: 18, color: statusColor),
          const SizedBox(width: 6),
          Text(
            statusText,
            style: TextStyle(
              fontSize: 13,
              color: statusColor,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}
