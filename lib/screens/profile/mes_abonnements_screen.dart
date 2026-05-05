import 'package:flutter/material.dart';

import '../../widgets/ocean/ocean_gradient_background.dart';
import '../boutique/boutique_feature_guard.dart';

class MesAbonnementsScreen extends StatelessWidget {
  const MesAbonnementsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return BoutiqueFeatureGuard(
      child: Scaffold(
        extendBodyBehindAppBar: true,
        appBar: AppBar(
          title: const Text('Mes abonnements'),
          backgroundColor: Colors.transparent,
          elevation: 0,
        ),
        body: OceanGradientBackground(
          creatures: CreatureSet.none,
          child: const SafeArea(
            child: Center(
              child: Card(
                child: Padding(
                  padding: EdgeInsets.all(24),
                  child: Text('TODO: afficher les abonnements payés'),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
