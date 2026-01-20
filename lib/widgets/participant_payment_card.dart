import 'package:flutter/material.dart';
import '../config/app_colors.dart';
import '../utils/epc_qr_code.dart';
import 'epc_qr_code_widget.dart';

/// Widget pour afficher la carte de paiement d'un participant
///
/// Utilisé par les organisateurs/encadrants pour montrer le QR code
/// de paiement à un participant qui doit encore payer.
class ParticipantPaymentCard extends StatelessWidget {
  /// Prénom du participant
  final String participantFirstName;

  /// Nom du participant
  final String participantLastName;

  /// Email du participant (optionnel, pour affichage)
  final String? participantEmail;

  /// Montant à payer
  final double amount;

  /// Titre de l'événement
  final String eventTitle;

  /// Numéro de l'événement (optionnel)
  final String? eventNumber;

  /// ID de l'événement
  final String eventId;

  /// Date de l'événement
  final DateTime? eventDate;

  /// IBAN du club
  final String clubIban;

  /// Nom du bénéficiaire (club)
  final String beneficiaryName;

  /// BIC optionnel
  final String? bic;

  /// Callback quand le paiement est marqué comme reçu
  final VoidCallback onMarkAsPaid;

  /// Indique si le paiement est en cours de traitement
  final bool isProcessing;

  const ParticipantPaymentCard({
    super.key,
    required this.participantFirstName,
    required this.participantLastName,
    this.participantEmail,
    required this.amount,
    required this.eventTitle,
    this.eventNumber,
    required this.eventId,
    this.eventDate,
    required this.clubIban,
    required this.beneficiaryName,
    this.bic,
    required this.onMarkAsPaid,
    this.isProcessing = false,
  });

  String get _participantFullName =>
      '$participantFirstName $participantLastName'.trim();

  @override
  Widget build(BuildContext context) {
    // Generate payment communication
    final paymentCommunication = generatePaymentCommunication(
      eventNumber: eventNumber,
      eventId: eventId,
      eventTitle: eventTitle,
      eventDate: eventDate,
      participantFirstName: participantFirstName,
      participantLastName: participantLastName,
    );

    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Handle bar
            Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: Colors.grey.shade300,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(height: 20),

            // Header
            Row(
              children: [
                CircleAvatar(
                  radius: 24,
                  backgroundColor: AppColors.middenblauw.withOpacity(0.1),
                  child: Text(
                    _getInitials(),
                    style: TextStyle(
                      color: AppColors.middenblauw,
                      fontWeight: FontWeight.bold,
                      fontSize: 16,
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        _participantFullName,
                        style: const TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      if (participantEmail != null)
                        Text(
                          participantEmail!,
                          style: TextStyle(
                            fontSize: 13,
                            color: Colors.grey.shade600,
                          ),
                        ),
                    ],
                  ),
                ),
              ],
            ),

            const SizedBox(height: 8),

            // Event info
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: Colors.grey.shade100,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.event, size: 16, color: Colors.grey.shade600),
                  const SizedBox(width: 6),
                  Text(
                    eventTitle,
                    style: TextStyle(
                      fontSize: 13,
                      color: Colors.grey.shade700,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  if (eventDate != null) ...[
                    Text(
                      ' · ',
                      style: TextStyle(color: Colors.grey.shade400),
                    ),
                    Text(
                      _formatDate(eventDate!),
                      style: TextStyle(
                        fontSize: 13,
                        color: Colors.grey.shade600,
                      ),
                    ),
                  ],
                ],
              ),
            ),

            const SizedBox(height: 24),

            // QR Code
            EpcQrCodeWidget(
              beneficiaryName: beneficiaryName,
              iban: clubIban,
              amount: amount,
              description: paymentCommunication,
              bic: bic,
              qrSize: 200,
              showDetails: true,
            ),

            const SizedBox(height: 24),

            // Payment communication (copyable)
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.lichtblauw.withOpacity(0.1),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: AppColors.lichtblauw.withOpacity(0.3)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(
                        Icons.chat_bubble_outline,
                        size: 14,
                        color: AppColors.middenblauw,
                      ),
                      const SizedBox(width: 6),
                      Text(
                        'Communication',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w500,
                          color: AppColors.middenblauw,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(
                    paymentCommunication,
                    style: TextStyle(
                      fontSize: 13,
                      color: Colors.grey.shade800,
                    ),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 24),

            // Mark as paid button
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: isProcessing ? null : onMarkAsPaid,
                icon: isProcessing
                    ? SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                        ),
                      )
                    : const Icon(Icons.check_circle, size: 20),
                label: Text(
                  isProcessing ? 'Enregistrement...' : 'Paiement reçu',
                  style: const TextStyle(fontSize: 16),
                ),
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.green.shade600,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
              ),
            ),

            const SizedBox(height: 16),

            // Cancel button - red outlined for visibility
            SizedBox(
              width: double.infinity,
              child: OutlinedButton(
                onPressed: isProcessing ? null : () => Navigator.of(context).pop(),
                style: OutlinedButton.styleFrom(
                  foregroundColor: Colors.red.shade600,
                  side: BorderSide(color: Colors.red.shade400, width: 1.5),
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                child: Text(
                  'Annuler',
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
            ),

            // Safe area padding for bottom sheet
            SizedBox(height: MediaQuery.of(context).padding.bottom),
          ],
        ),
      ),
    );
  }

  String _getInitials() {
    final first = participantFirstName.isNotEmpty ? participantFirstName[0] : '';
    final last = participantLastName.isNotEmpty ? participantLastName[0] : '';
    return '$first$last'.toUpperCase();
  }

  String _formatDate(DateTime date) {
    return '${date.day.toString().padLeft(2, '0')}/${date.month.toString().padLeft(2, '0')}/${date.year}';
  }
}

/// Shows the participant payment card as a modal bottom sheet
///
/// Returns true if payment was marked as received, false otherwise
Future<bool?> showParticipantPaymentCard({
  required BuildContext context,
  required String participantFirstName,
  required String participantLastName,
  String? participantEmail,
  required double amount,
  required String eventTitle,
  String? eventNumber,
  required String eventId,
  DateTime? eventDate,
  required String clubIban,
  required String beneficiaryName,
  String? bic,
  required Future<void> Function() onMarkAsPaid,
}) {
  return showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    builder: (context) => StatefulBuilder(
      builder: (context, setState) {
        bool isProcessing = false;

        return ParticipantPaymentCard(
          participantFirstName: participantFirstName,
          participantLastName: participantLastName,
          participantEmail: participantEmail,
          amount: amount,
          eventTitle: eventTitle,
          eventNumber: eventNumber,
          eventId: eventId,
          eventDate: eventDate,
          clubIban: clubIban,
          beneficiaryName: beneficiaryName,
          bic: bic,
          isProcessing: isProcessing,
          onMarkAsPaid: () async {
            setState(() => isProcessing = true);
            try {
              await onMarkAsPaid();
              if (context.mounted) {
                Navigator.of(context).pop(true);
              }
            } catch (e) {
              setState(() => isProcessing = false);
              if (context.mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                    content: Text('Erreur: ${e.toString()}'),
                    backgroundColor: Colors.red,
                  ),
                );
              }
            }
          },
        );
      },
    ),
  );
}
