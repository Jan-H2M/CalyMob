import 'package:flutter/material.dart';
import '../../services/boutique/boutique_operations_service.dart';
import '../../widgets/boutique/boutique_access_guard.dart';
import 'boutique_action_wizard_screen.dart';
import 'boutique_management_screen.dart';

/// Production entry: the same guarded service is used for the wizard and the
/// existing shared transport/handover screens. No inventory write on entry.
class BoutiqueActionManagementScreen extends StatelessWidget {
  final BoutiqueOperationsService service;
  const BoutiqueActionManagementScreen(
      {super.key, this.service = const BoutiqueOperationsService()});

  @override
  Widget build(BuildContext context) {
    final scope = BoutiqueAccessScope.maybeOf(context);
    if (scope == null) {
      return const Scaffold(
          body: Center(child: Text('Accès Boutique à vérifier.')));
    }
    return BoutiqueActionWizardScreen(
      clubId: scope.clubId,
      service: service,
      missionsBuilder: (_) => BoutiqueManagementScreen(
          manager: true, showStockPreparation: false, service: service),
    );
  }
}
