import 'package:calymob/widgets/scanner_error_banner.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';

/// Fictional feedback only: no Firebase app, camera, member or attendance write.
class FictionalPoolScannerFeedback extends StatefulWidget {
  const FictionalPoolScannerFeedback({super.key});
  @override
  State<FictionalPoolScannerFeedback> createState() =>
      _FictionalPoolScannerFeedbackState();
}

class _FictionalPoolScannerFeedbackState
    extends State<FictionalPoolScannerFeedback> {
  String? message;
  @override
  Widget build(BuildContext context) =>
      ListView(padding: const EdgeInsets.all(16), children: [
        const Text('MOB-055 · Retours du scanner — données fictives'),
        const Text(
            'Ce scénario vérifie le message visible, pas la caméra ni la création d’un index cloud.'),
        FilledButton(
            onPressed: () => showModalBottomSheet<void>(
                context: context,
                builder: (_) => StatefulBuilder(
                    builder: (context, setSheetState) =>
                        Column(mainAxisSize: MainAxisSize.min, children: [
                          const Text('Scanner Présence'),
                          if (message != null)
                            ScannerErrorBanner(message: message!),
                          TextButton(
                              onPressed: () => setSheetState(() => message =
                                  scannerActionErrorMessage(FirebaseException(
                                      plugin: 'cloud_firestore',
                                      code: 'failed-precondition',
                                      message:
                                          'The query requires a COLLECTION_ASC index'))),
                              child: const Text('Simuler index absent')),
                          TextButton(
                              onPressed: () => setSheetState(() => message =
                                  scannerActionErrorMessage(
                                      FirebaseFunctionsException(
                                          code: 'failed-precondition',
                                          message:
                                              'Scan uniquement pour une séance piscine actuelle.'))),
                              child: const Text('Simuler refus de séance')),
                          const Text('Présents : 0'),
                        ]))),
            child: const Text('Ouvrir le scanner fictif')),
      ]);
}
