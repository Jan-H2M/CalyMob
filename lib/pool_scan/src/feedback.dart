import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';

/// Keeps the server's explanation visible inside the scanner bottom sheet.
String poolScanErrorMessage(Object error) {
  if (error is FirebaseFunctionsException) {
    final message = error.message?.trim();
    if (message != null && message.isNotEmpty && message != 'INTERNAL') {
      return message;
    }
    return 'La présence n’a pas pu être confirmée. Vérifiez la liste avant de réessayer.';
  }
  if (error is FirebaseException) {
    if (error.code == 'failed-precondition' &&
        (error.message ?? '').toLowerCase().contains('index')) {
      return 'La liste de présence est momentanément indisponible (index). '
          'Aucune modification de présence n’a été confirmée.';
    }
    return 'La présence n’a pas pu être confirmée. Vérifiez la liste avant de réessayer.';
  }
  return error.toString().replaceFirst(RegExp(r'^Exception: '), '');
}

class PoolScanErrorBanner extends StatelessWidget {
  const PoolScanErrorBanner({super.key, required this.message});
  final String message;

  @override
  Widget build(BuildContext context) => Semantics(
    liveRegion: true,
    child: Container(
      key: const Key('scanner-action-error'),
      width: double.infinity,
      color: Colors.red.shade50,
      padding: const EdgeInsets.all(12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.error_outline, color: Colors.red.shade900),
          const SizedBox(width: 8),
          Expanded(
            child: Text(message, style: TextStyle(color: Colors.red.shade900)),
          ),
        ],
      ),
    ),
  );
}
