import 'package:flutter/material.dart';
import 'package:permission_handler/permission_handler.dart';

/// Résultat d'une demande de permission caméra
enum CameraPermissionResult {
  granted,
  denied,
  permanentlyDenied,
  restricted, // iOS: contrôle parental
}

/// Service de gestion des permissions caméra
class CameraPermissionService {
  /// Vérifie et demande la permission caméra
  static Future<CameraPermissionResult> requestCameraPermission() async {
    PermissionStatus status = await Permission.camera.status;

    if (status.isGranted) {
      return CameraPermissionResult.granted;
    }

    if (status.isRestricted) {
      return CameraPermissionResult.restricted;
    }

    if (status.isPermanentlyDenied) {
      return CameraPermissionResult.permanentlyDenied;
    }

    // Demander la permission
    status = await Permission.camera.request();

    if (status.isGranted) {
      return CameraPermissionResult.granted;
    } else if (status.isPermanentlyDenied) {
      return CameraPermissionResult.permanentlyDenied;
    }
    return CameraPermissionResult.denied;
  }

  /// Ouvre les réglages de l'app
  static Future<bool> openSettings() async {
    return await openAppSettings();
  }

  /// Affiche le dialogue approprié et gère le résultat
  /// Retourne true si la permission a été accordée
  static Future<bool> handlePermissionWithDialog(BuildContext context) async {
    final result = await requestCameraPermission();

    if (result == CameraPermissionResult.granted) {
      return true;
    }

    if (!context.mounted) return false;

    switch (result) {
      case CameraPermissionResult.denied:
        return await _showDeniedDialog(context);
      case CameraPermissionResult.permanentlyDenied:
        return await _showPermanentlyDeniedDialog(context);
      case CameraPermissionResult.restricted:
        await _showRestrictedDialog(context);
        return false;
      default:
        return false;
    }
  }

  static Future<bool> _showDeniedDialog(BuildContext context) async {
    final retry = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Row(
          children: [
            Icon(Icons.camera_alt, color: Colors.orange),
            SizedBox(width: 12),
            Expanded(child: Text('Accès caméra requis')),
          ],
        ),
        content: const Text(
          'Pour scanner vos justificatifs, CalyMob a besoin d\'accéder à la caméra.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Annuler'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(backgroundColor: Colors.orange),
            child: const Text('Réessayer', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );

    if (retry == true && context.mounted) {
      final newResult = await requestCameraPermission();
      if (newResult == CameraPermissionResult.granted) {
        return true;
      } else if (newResult == CameraPermissionResult.permanentlyDenied && context.mounted) {
        return await _showPermanentlyDeniedDialog(context);
      }
    }
    return false;
  }

  static Future<bool> _showPermanentlyDeniedDialog(BuildContext context) async {
    final goToSettings = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Row(
          children: [
            Icon(Icons.settings, color: Colors.orange),
            SizedBox(width: 12),
            Expanded(child: Text('Accès caméra bloqué')),
          ],
        ),
        content: const Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'L\'accès à la caméra a été refusé. Pour scanner des documents, activez la caméra dans les réglages.',
            ),
            SizedBox(height: 12),
            Text(
              '1. Ouvrir les réglages\n2. Activer "Caméra"\n3. Revenir dans l\'app',
              style: TextStyle(fontSize: 13, color: Colors.grey),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Annuler'),
          ),
          ElevatedButton.icon(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(backgroundColor: Colors.orange),
            icon: const Icon(Icons.settings, color: Colors.white, size: 18),
            label: const Text('Ouvrir les réglages', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );

    if (goToSettings == true) {
      await openSettings();
    }
    return false;
  }

  static Future<void> _showRestrictedDialog(BuildContext context) async {
    await showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Row(
          children: [
            Icon(Icons.block, color: Colors.red),
            SizedBox(width: 12),
            Expanded(child: Text('Accès restreint')),
          ],
        ),
        content: const Text(
          'L\'accès à la caméra est restreint sur cet appareil. Utilisez l\'option "Galerie" pour sélectionner des photos existantes.',
        ),
        actions: [
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Compris'),
          ),
        ],
      ),
    );
  }
}
