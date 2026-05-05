import 'package:flutter/material.dart';

import '../../widgets/ocean/ocean_gradient_background.dart';
import '../boutique/boutique_feature_guard.dart';

class MesRecusScreen extends StatelessWidget {
  const MesRecusScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return BoutiqueFeatureGuard(
      child: Scaffold(
        extendBodyBehindAppBar: true,
        appBar: AppBar(
          title: const Text('Mes reçus'),
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
                  child: Text('TODO: reçus Boutique / abonnements'),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
