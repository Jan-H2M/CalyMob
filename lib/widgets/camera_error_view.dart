import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:permission_handler/permission_handler.dart';

import '../config/app_colors.dart';

/// True when the scanner could not start because the member refused (or
/// never granted) camera access. On iOS a refusal is final: the system does
/// not show its dialog a second time, only the Réglages app can restore it.
bool isCameraPermissionDenied(MobileScannerException? error) =>
    error?.errorCode == MobileScannerErrorCode.permissionDenied;

/// French title + explanation shown instead of the raw
/// `Camera error: permissionDenied` technical string.
({String title, String message}) cameraErrorCopy(MobileScannerException error) {
  if (isCameraPermissionDenied(error)) {
    return (
      title: 'Accès à la caméra refusé',
      message: 'Autorisez la caméra pour CalyMob dans les réglages de votre '
          'téléphone, puis revenez ici pour scanner.',
    );
  }
  return (
    title: 'Caméra indisponible',
    message: error.errorDetails?.message ??
        'Impossible de démarrer la caméra. Réessayez dans un instant.',
  );
}

/// Shared `errorBuilder` content for every [MobileScanner] in the app.
///
/// When camera access was refused it offers a direct shortcut to the app's
/// page in the system settings; for any other failure it offers a retry.
class CameraErrorView extends StatelessWidget {
  final MobileScannerException error;

  /// Restarts the scanner. Hidden when null.
  final VoidCallback? onRetry;

  /// Opens the system settings. Overridable for tests.
  final Future<bool> Function() onOpenSettings;

  const CameraErrorView({
    super.key,
    required this.error,
    this.onRetry,
    this.onOpenSettings = openAppSettings,
  });

  @override
  Widget build(BuildContext context) {
    final denied = isCameraPermissionDenied(error);
    final copy = cameraErrorCopy(error);

    return Container(
      color: Colors.black87,
      alignment: Alignment.center,
      child: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.no_photography_outlined,
                color: Colors.white, size: 36),
            const SizedBox(height: 8),
            Text(
              copy.title,
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 16,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              copy.message,
              textAlign: TextAlign.center,
              style: TextStyle(
                color: Colors.white.withValues(alpha: 0.8),
                fontSize: 13,
                height: 1.3,
              ),
            ),
            const SizedBox(height: 10),
            Wrap(
              alignment: WrapAlignment.center,
              spacing: 8,
              runSpacing: 4,
              children: [
                if (denied)
                  FilledButton.icon(
                    onPressed: () => onOpenSettings(),
                    icon: const Icon(Icons.settings, size: 18),
                    label: const Text('Ouvrir les réglages'),
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.oranje,
                      foregroundColor: Colors.white,
                    ),
                  ),
                if (onRetry != null)
                  TextButton.icon(
                    onPressed: onRetry,
                    icon: const Icon(Icons.refresh, size: 18),
                    label: const Text('Réessayer'),
                    style: TextButton.styleFrom(foregroundColor: Colors.white),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
