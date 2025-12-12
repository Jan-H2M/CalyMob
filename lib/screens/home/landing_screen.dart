import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:lottie/lottie.dart';
import '../../config/app_assets.dart';
import '../../config/app_colors.dart';
import '../../providers/auth_provider.dart';
import '../auth/login_screen.dart';
import '../operations/operations_list_screen.dart';
import '../expenses/financial_screen.dart';
import '../profile/profile_screen.dart';
import '../profile/who_is_who_screen.dart';
import '../announcements/announcements_screen.dart';

/// Landing page avec thème maritime et boutons ronds
class LandingScreen extends StatefulWidget {
  const LandingScreen({Key? key}) : super(key: key);

  @override
  State<LandingScreen> createState() => _LandingScreenState();
}

class _LandingScreenState extends State<LandingScreen> with TickerProviderStateMixin {
  // Delayed fish controllers
  late List<AnimationController> _fishControllers;
  late List<bool> _fishVisible;

  @override
  void initState() {
    super.initState();
    _fishVisible = [false, false, false, false];
    _fishControllers = [];

    // Start elke vis met een andere delay
    _startFishWithDelay(0, 0);      // Vis 1: direct
    _startFishWithDelay(1, 1200);   // Vis 2: 1.2s delay (changed from 0.8s)
    _startFishWithDelay(2, 1600);   // Vis 3: 1.6s delay
    _startFishWithDelay(3, 2400);   // Vis 4: 2.4s delay
  }

  void _startFishWithDelay(int index, int delayMs) {
    Future.delayed(Duration(milliseconds: delayMs), () {
      if (mounted) {
        setState(() {
          _fishVisible[index] = true;
        });
      }
    });
  }

  @override
  void dispose() {
    for (var controller in _fishControllers) {
      controller.dispose();
    }
    super.dispose();
  }

  Future<void> _handleLogout(BuildContext context) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Déconnexion'),
        content: const Text('Voulez-vous vous déconnecter ?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Annuler'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(context, true),
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            child: const Text('Déconnecter', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );

    if (confirmed == true && context.mounted) {
      await context.read<AuthProvider>().logout();

      if (context.mounted) {
        Navigator.of(context).pushReplacement(
          MaterialPageRoute(builder: (_) => const LoginScreen()),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final authProvider = context.watch<AuthProvider>();
    final userName = authProvider.displayName ?? 'Utilisateur';
    final screenHeight = MediaQuery.of(context).size.height;

    return Scaffold(
      backgroundColor: Colors.white,
      body: Stack(
        children: [
          // Ocean wave achtergrond - nieuwe grote wave afbeelding
          Positioned(
            left: 0,
            right: 0,
            top: screenHeight * 0.07,
            bottom: 0,
            child: Image.asset(
              AppAssets.backgroundWaveBig,
              fit: BoxFit.cover,
              width: double.infinity,
              alignment: Alignment.topCenter,
            ),
          ),

          // Springende vissen - 4 stuks met verschillende delays en diepte-effect
          // Vis 1 - klein, achteraan (links)
          if (_fishVisible[0])
            Positioned(
              left: 30,
              top: screenHeight * 0.38,
              child: IgnorePointer(
                child: Opacity(
                  opacity: 0.5,
                  child: Lottie.asset(
                    'assets/animations/jumping_fish.json',
                    width: 60,
                    height: 60,
                    repeat: true,
                  ),
                ),
              ),
            ),
          // Vis 2 - medium, midden-achter (rechts)
          if (_fishVisible[1])
            Positioned(
              right: 50,
              top: screenHeight * 0.48,
              child: IgnorePointer(
                child: Opacity(
                  opacity: 0.6,
                  child: Lottie.asset(
                    'assets/animations/jumping_fish.json',
                    width: 80,
                    height: 80,
                    repeat: true,
                  ),
                ),
              ),
            ),
          // Vis 3 - groter, midden-voor (links)
          if (_fishVisible[2])
            Positioned(
              left: 100,
              top: screenHeight * 0.36,
              child: IgnorePointer(
                child: Opacity(
                  opacity: 0.75,
                  child: Lottie.asset(
                    'assets/animations/jumping_fish.json',
                    width: 100,
                    height: 100,
                    repeat: true,
                  ),
                ),
              ),
            ),
          // Vis 4 - grootste, vooraan (rechts)
          if (_fishVisible[3])
            Positioned(
              right: 80,
              top: screenHeight * 0.40,
              child: IgnorePointer(
                child: Opacity(
                  opacity: 0.9,
                  child: Lottie.asset(
                    'assets/animations/jumping_fish.json',
                    width: 120,
                    height: 120,
                    repeat: true,
                  ),
                ),
              ),
            ),

          // Content
          SafeArea(
            child: Column(
              children: [
                // Top bar met logout
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 8),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.end,
                    children: [
                      IconButton(
                        icon: const Icon(Icons.logout, color: Colors.white),
                        onPressed: () => _handleLogout(context),
                        tooltip: 'Déconnexion',
                      ),
                    ],
                  ),
                ),

                // Groot logo
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  child: Image.asset(
                    'assets/images/logo-vertical-transparent.png',
                    height: 150,
                    fit: BoxFit.contain,
                  ),
                ),

                // Welkom tekst - Bienvenue klein, naam groot en vet
                Text(
                  'Bienvenue',
                  style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                        color: AppColors.middenblauw,
                      ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 4),
                Text(
                  userName,
                  style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                        fontWeight: FontWeight.bold,
                        color: AppColors.donkerblauw,
                      ),
                  textAlign: TextAlign.center,
                ),

                const Spacer(),

                // 5 Ronde knoppen met ButtonBlue - onderaan in het blauwe deel
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.end,
                    children: [
                      // Rij 1: Événements, Communication
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                        children: [
                          _GlossyButton(
                            title: 'Événements',
                            icon: Icons.event,
                            onTap: () => Navigator.push(
                              context,
                              MaterialPageRoute(builder: (_) => const OperationsListScreen()),
                            ),
                          ),
                          _GlossyButton(
                            title: 'Communication',
                            icon: Icons.campaign,
                            onTap: () => Navigator.push(
                              context,
                              MaterialPageRoute(builder: (_) => const AnnouncementsScreen()),
                            ),
                          ),
                        ],
                      ),

                      const SizedBox(height: 20),

                      // Rij 2: Who is Who, Finances, Mon Profil
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                        children: [
                          _GlossyButton(
                            title: 'Who is Who',
                            icon: Icons.people,
                            onTap: () => Navigator.push(
                              context,
                              MaterialPageRoute(builder: (_) => const WhoIsWhoScreen()),
                            ),
                          ),
                          _GlossyButton(
                            title: 'Finances',
                            icon: Icons.account_balance_wallet,
                            onTap: () => Navigator.push(
                              context,
                              MaterialPageRoute(builder: (_) => const FinancialScreen()),
                            ),
                          ),
                          _GlossyButton(
                            title: 'Mon Profil',
                            icon: Icons.person,
                            onTap: () => Navigator.push(
                              context,
                              MaterialPageRoute(builder: (_) => const ProfileScreen()),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),

                const SizedBox(height: 40),

                // Version footer
                Padding(
                  padding: const EdgeInsets.only(bottom: 16),
                  child: Text(
                    'Version 1.0.5',
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: Colors.white70,
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
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              boxShadow: [
                BoxShadow(
                  color: Colors.white.withOpacity(0.4),
                  blurRadius: 15,
                  spreadRadius: 2,
                ),
              ],
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
