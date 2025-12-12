import 'package:flutter/material.dart';
import 'package:lottie/lottie.dart';
import '../../config/app_assets.dart';
import 'expense_list_screen.dart';
import 'approval_list_screen.dart';

/// Écran financier avec deux boutons: Mes demandes et Mes approbations
class FinancialScreen extends StatelessWidget {
  const FinancialScreen({Key? key}) : super(key: key);

  @override
  Widget build(BuildContext context) {
    final screenHeight = MediaQuery.of(context).size.height;

    return Scaffold(
      backgroundColor: Colors.white,
      body: Stack(
        children: [
          // Ocean achtergrond - volledige blauwe ocean
          Positioned.fill(
            child: Image.asset(
              AppAssets.backgroundFull,
              fit: BoxFit.cover,
            ),
          ),

          // Content
          SafeArea(
            child: Column(
              children: [
                // Back button
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  child: Row(
                    children: [
                      IconButton(
                        icon: const Icon(Icons.arrow_back, color: Colors.white),
                        onPressed: () => Navigator.pop(context),
                      ),
                    ],
                  ),
                ),

                // Titel
                const SizedBox(height: 40),
                Text(
                  'Finances',
                  style: Theme.of(context).textTheme.headlineLarge?.copyWith(
                        fontWeight: FontWeight.bold,
                        color: Colors.white,
                      ),
                  textAlign: TextAlign.center,
                ),

                const Spacer(),

                // Twee knoppen
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 40),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                    children: [
                      _GlossyButton(
                        title: 'Mes demandes',
                        icon: Icons.receipt_long,
                        onTap: () => Navigator.push(
                          context,
                          MaterialPageRoute(builder: (_) => const ExpenseListScreen()),
                        ),
                      ),
                      _GlossyButton(
                        title: 'Mes approbations',
                        icon: Icons.approval,
                        onTap: () => Navigator.push(
                          context,
                          MaterialPageRoute(builder: (_) => const ApprovalListScreen()),
                        ),
                      ),
                    ],
                  ),
                ),

                const Spacer(),

                // Ruimte voor de krab
                const SizedBox(height: 150),
              ],
            ),
          ),

          // Krab animatie rechtsonder
          Positioned(
            right: 20,
            bottom: 20,
            child: IgnorePointer(
              child: Lottie.asset(
                'assets/animations/Crabbuty.json',
                width: 150,
                height: 150,
                repeat: true,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Widget voor een glossy blauwe knop met ButtonBlue.png
class _GlossyButton extends StatelessWidget {
  final String title;
  final IconData icon;
  final VoidCallback onTap;

  const _GlossyButton({
    required this.title,
    required this.icon,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            decoration: const BoxDecoration(
              shape: BoxShape.circle,
            ),
            child: Stack(
              alignment: Alignment.center,
              children: [
                // ButtonBlue.png als achtergrond
                Image.asset(
                  AppAssets.buttonBlue,
                  width: 110,
                  height: 110,
                ),
                // Icoon erop
                Icon(
                  icon,
                  size: 46,
                  color: Colors.white,
                ),
              ],
            ),
          ),
          const SizedBox(height: 10),
          Text(
            title,
            style: const TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w600,
              color: Colors.white,
            ),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }
}
