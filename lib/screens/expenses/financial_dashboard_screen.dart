import 'package:flutter/material.dart';
import 'package:lottie/lottie.dart';
import 'package:provider/provider.dart';
import '../../config/app_assets.dart';
import '../../config/app_colors.dart';
import '../../providers/auth_provider.dart';
import '../../widgets/glossy_button.dart';
import 'expense_list_screen.dart';
import 'approval_list_screen.dart';

/// Dashboard financier avec navigation vers Approbation et Mes demandes
class FinancialDashboardScreen extends StatelessWidget {
  const FinancialDashboardScreen({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final screenHeight = MediaQuery.of(context).size.height;
    // De waterlijn zit ongeveer op 35% van de hoogte in backgroundFull
    final waterLinePosition = screenHeight * 0.35;

    return Scaffold(
      body: Stack(
        children: [
          // Achtergrond
          Container(
            width: double.infinity,
            height: double.infinity,
            decoration: const BoxDecoration(
              image: DecorationImage(
                image: AssetImage(AppAssets.backgroundFull),
                fit: BoxFit.cover,
              ),
            ),
          ),

          // Springende vis op de waterlijn
          Positioned(
            top: waterLinePosition - 50, // Vis springt boven de waterlijn
            left: 20,
            child: Lottie.asset(
              'assets/animations/jumping_fish.json',
              width: 100,
              height: 100,
              repeat: true,
            ),
          ),

          // Hoofdinhoud
          SafeArea(
            child: Column(
              children: [
                // Header met terug knop
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  child: Row(
                    children: [
                      IconButton(
                        icon: const Icon(Icons.arrow_back, color: Colors.white, size: 28),
                        onPressed: () => Navigator.pop(context),
                        tooltip: 'Retour',
                      ),
                      const Spacer(),
                    ],
                  ),
                ),

                const SizedBox(height: 40),

                // Titre
                const Text(
                  'Finances',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 32,
                    fontWeight: FontWeight.bold,
                    shadows: [
                      Shadow(
                        color: Colors.black45,
                        offset: Offset(2, 2),
                        blurRadius: 4,
                      ),
                    ],
                  ),
                ),

                const Spacer(),

                // Knoppen
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 40),
                  child: _buildMenuButtons(context),
                ),

                const Spacer(),

                // Decoratieve krab animatie
                Align(
                  alignment: Alignment.bottomRight,
                  child: Padding(
                    padding: const EdgeInsets.only(right: 16),
                    child: Lottie.asset(
                      'assets/animations/Crabbuty.json',
                      width: 80,
                      height: 80,
                      repeat: true,
                    ),
                  ),
                ),

                // Versie
                Padding(
                  padding: const EdgeInsets.only(bottom: 20),
                  child: Text(
                    'Version 1.0.7',
                    style: TextStyle(
                      color: Colors.white.withOpacity(0.5),
                      fontSize: 11,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildMenuButtons(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final buttonSize = constraints.maxWidth > 400 ? 130.0 : constraints.maxWidth * 0.40;

        return Row(
          mainAxisAlignment: MainAxisAlignment.spaceEvenly,
          children: [
            // Approbation
            GlossyButton(
              icon: Icons.check_circle_outline_rounded,
              label: 'Approbation',
              size: buttonSize,
              onTap: () => Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const ApprovalListScreen()),
              ),
            ),
            // Mes demandes
            GlossyButton(
              icon: Icons.receipt_long_rounded,
              label: 'Mes demandes',
              size: buttonSize,
              onTap: () => Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const ExpenseListScreen()),
              ),
            ),
          ],
        );
      },
    );
  }
}
