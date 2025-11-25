import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/auth_provider.dart';
import '../auth/login_screen.dart';
import '../operations/operations_list_screen.dart';
import '../expenses/expense_list_screen.dart';
import '../expenses/approval_list_screen.dart';
import '../profile/profile_screen.dart';
import '../profile/who_is_who_screen.dart';
import '../announcements/announcements_screen.dart';

/// Landing page avec logo Calypso et navigation par grandes cartes
class LandingScreen extends StatelessWidget {
  const LandingScreen({Key? key}) : super(key: key);

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
    // Utiliser le nom d'affichage de l'utilisateur depuis Firestore
    final userName = authProvider.displayName ?? 'Utilisateur';

    return Scaffold(
      backgroundColor: Colors.grey[50],
      appBar: AppBar(
        title: const Text(
          'CalyMob',
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
        ),
        backgroundColor: const Color(0xFF1976D2), // Calypso blue
        elevation: 0,
        actions: [
          IconButton(
            icon: const Icon(Icons.logout, color: Colors.white),
            onPressed: () => _handleLogout(context),
            tooltip: 'Déconnexion',
          ),
        ],
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Column(
            children: [
              // Logo Calypso
              Container(
                padding: const EdgeInsets.symmetric(vertical: 20),
                child: Image.asset(
                  'assets/images/logo-vertical.png',
                  height: 120,
                  fit: BoxFit.contain,
                ),
              ),

              const SizedBox(height: 10),

              // Bienvenue
              Text(
                'Bienvenue, $userName',
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                      fontWeight: FontWeight.bold,
                      color: Colors.grey[800],
                    ),
                textAlign: TextAlign.center,
              ),

              const SizedBox(height: 8),

              Text(
                'Calypso Diving Club',
                style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                      color: Colors.grey[600],
                    ),
                textAlign: TextAlign.center,
              ),

              const SizedBox(height: 40),

              // Navigation Cards - Grid 2x2
              // Première ligne: Mes demandes + Approbation
              Row(
                children: [
                  Expanded(
                    child: _NavigationTile(
                      title: 'Mes demandes',
                      icon: Icons.receipt_long,
                      color: const Color(0xFFFF6F00), // Orange
                      onTap: () {
                        Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) => const ExpenseListScreen(),
                          ),
                        );
                      },
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: _NavigationTile(
                      title: 'Approbation',
                      icon: Icons.check_circle_outline,
                      color: const Color(0xFF4CAF50), // Green
                      onTap: () {
                        Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) => const ApprovalListScreen(),
                          ),
                        );
                      },
                    ),
                  ),
                ],
              ),

              const SizedBox(height: 16),

              // Deuxième ligne: Événements + Communication
              Row(
                children: [
                  Expanded(
                    child: _NavigationTile(
                      title: 'Événements',
                      icon: Icons.event,
                      color: const Color(0xFF2196F3), // Blue
                      onTap: () {
                        Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) => const OperationsListScreen(),
                          ),
                        );
                      },
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: _NavigationTile(
                      title: 'Communication',
                      icon: Icons.campaign,
                      color: const Color(0xFFE91E63), // Pink
                      onTap: () {
                        Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) => const AnnouncementsScreen(),
                          ),
                        );
                      },
                    ),
                  ),
                ],
              ),

              const SizedBox(height: 16),

              // Troisième ligne: Who is Who + Profil
              Row(
                children: [
                  Expanded(
                    child: _NavigationTile(
                      title: 'Who is Who',
                      icon: Icons.people,
                      color: const Color(0xFF00BCD4), // Cyan
                      onTap: () {
                        Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) => const WhoIsWhoScreen(),
                          ),
                        );
                      },
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: _NavigationTile(
                      title: 'Profil',
                      icon: Icons.person,
                      color: const Color(0xFF9C27B0), // Purple
                      onTap: () {
                        Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) => const ProfileScreen(),
                          ),
                        );
                      },
                    ),
                  ),
                ],
              ),

              const SizedBox(height: 40),

              // Footer
              Text(
                'Version 1.0.4',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: Colors.grey[400],
                    ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Widget pour une tuile de navigation (rectangulaire)
class _NavigationTile extends StatelessWidget {
  final String title;
  final IconData icon;
  final Color color;
  final VoidCallback onTap;
  final bool isEnabled;

  const _NavigationTile({
    required this.title,
    required this.icon,
    required this.color,
    required this.onTap,
    this.isEnabled = true,
  });

  @override
  Widget build(BuildContext context) {
    return Opacity(
      opacity: isEnabled ? 1.0 : 0.5,
      child: Card(
        elevation: isEnabled ? 3 : 1,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
        ),
        child: InkWell(
          onTap: isEnabled ? onTap : null,
          borderRadius: BorderRadius.circular(16),
          child: Container(
            height: 140,
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(16),
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [
                  color,
                  color.withOpacity(0.8),
                ],
              ),
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                // Icon
                Icon(
                  icon,
                  size: 48,
                  color: Colors.white,
                ),

                const SizedBox(height: 12),

                // Title
                Text(
                  title,
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: Colors.white,
                  ),
                  textAlign: TextAlign.center,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
