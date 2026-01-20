import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';
import '../config/app_colors.dart';
import '../utils/epc_qr_code.dart';

/// Widget qui affiche un QR code EPC pour paiement SEPA
///
/// Affiche le QR code avec les détails de paiement:
/// - Montant
/// - IBAN formaté
/// - Nom du bénéficiaire
class EpcQrCodeWidget extends StatelessWidget {
  /// Nom du bénéficiaire (club)
  final String beneficiaryName;

  /// IBAN du bénéficiaire
  final String iban;

  /// Montant à payer en EUR
  final double amount;

  /// Description/communication du paiement (max 140 chars)
  final String? description;

  /// BIC optionnel
  final String? bic;

  /// Taille du QR code
  final double qrSize;

  /// Afficher les détails de paiement sous le QR code
  final bool showDetails;

  /// Couleur de fond du QR code
  final Color? backgroundColor;

  const EpcQrCodeWidget({
    super.key,
    required this.beneficiaryName,
    required this.iban,
    required this.amount,
    this.description,
    this.bic,
    this.qrSize = 200.0,
    this.showDetails = true,
    this.backgroundColor,
  });

  @override
  Widget build(BuildContext context) {
    // Générer le payload EPC
    final epcData = EpcQrCodeData(
      beneficiaryName: beneficiaryName,
      iban: iban,
      amount: amount,
      bic: bic,
      description: description,
    );

    final payload = generateEpcPayload(epcData);

    if (payload == null) {
      // Données invalides - afficher une erreur
      return _buildErrorWidget();
    }

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        // QR Code
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: backgroundColor ?? Colors.white,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: Colors.grey.shade300),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withOpacity(0.05),
                blurRadius: 10,
                offset: const Offset(0, 2),
              ),
            ],
          ),
          child: QrImageView(
            data: payload,
            version: QrVersions.auto,
            size: qrSize,
            backgroundColor: Colors.white,
            errorCorrectionLevel: QrErrorCorrectLevel.M,
          ),
        ),

        if (showDetails) ...[
          const SizedBox(height: 16),

          // Montant
          Text(
            '${amount.toStringAsFixed(2)} €',
            style: TextStyle(
              fontSize: 28,
              fontWeight: FontWeight.bold,
              color: AppColors.middenblauw,
            ),
          ),

          const SizedBox(height: 12),

          // Instructions
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(
                Icons.check_circle,
                size: 16,
                color: Colors.green.shade600,
              ),
              const SizedBox(width: 6),
              Text(
                'Scannez avec votre app bancaire',
                style: TextStyle(
                  fontSize: 12,
                  color: Colors.green.shade700,
                ),
              ),
            ],
          ),
        ],
      ],
    );
  }

  Widget _buildErrorWidget() {
    return Container(
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(
        color: Colors.grey.shade100,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.orange.shade300),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            Icons.warning_amber_rounded,
            size: 48,
            color: Colors.orange.shade600,
          ),
          const SizedBox(height: 12),
          Text(
            'QR code non disponible',
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w500,
              color: Colors.grey.shade800,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            'Données de paiement invalides',
            style: TextStyle(
              fontSize: 12,
              color: Colors.grey.shade600,
            ),
          ),
        ],
      ),
    );
  }
}

/// Version compacte du QR code pour affichage dans une liste ou card
class EpcQrCodeCompact extends StatelessWidget {
  final String beneficiaryName;
  final String iban;
  final double amount;
  final String? description;
  final String? bic;

  const EpcQrCodeCompact({
    super.key,
    required this.beneficiaryName,
    required this.iban,
    required this.amount,
    this.description,
    this.bic,
  });

  @override
  Widget build(BuildContext context) {
    return EpcQrCodeWidget(
      beneficiaryName: beneficiaryName,
      iban: iban,
      amount: amount,
      description: description,
      bic: bic,
      qrSize: 150.0,
      showDetails: false,
    );
  }
}
