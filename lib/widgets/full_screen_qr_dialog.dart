import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';
import '../models/member_profile.dart';
import '../config/app_colors.dart';

/// Dialog plein écran pour afficher le QR code en grand
class FullScreenQRDialog extends StatelessWidget {
  final MemberProfile profile;

  const FullScreenQRDialog({
    super.key,
    required this.profile,
  });

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: Colors.black87,
      insetPadding: const EdgeInsets.all(20),
      child: Container(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            // Bouton fermer
            Align(
              alignment: Alignment.topRight,
              child: IconButton(
                onPressed: () => Navigator.of(context).pop(),
                icon: const Icon(Icons.close, color: Colors.white),
                tooltip: 'Sluiten',
              ),
            ),

            const SizedBox(height: 8),

            // Nom du membre
            Text(
              profile.fullName,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 24,
                fontWeight: FontWeight.bold,
              ),
              textAlign: TextAlign.center,
            ),

            const SizedBox(height: 24),

            // QR Code grand format
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(16),
              ),
              child: QrImageView(
                data: profile.id,
                version: QrVersions.auto,
                size: 300.0,
                backgroundColor: Colors.white,
                errorCorrectionLevel: QrErrorCorrectLevel.M,
              ),
            ),

            const SizedBox(height: 24),

            // Instructions
            const Text(
              'Présentez ce code QR à l\'organisateur',
              style: TextStyle(
                color: Colors.white70,
                fontSize: 14,
              ),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}
