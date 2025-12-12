import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import '../../providers/auth_provider.dart';
import '../auth/login_screen.dart';
import '../operations/operations_list_screen.dart';
import '../expenses/expense_list_screen.dart';
import '../expenses/approval_list_screen.dart';
import '../profile/profile_screen.dart';
import '../profile/who_is_who_screen.dart';
import '../announcements/announcements_screen.dart';

/// Landing page avec logo Calypso et navigation par grandes cartes
class LandingScreen extends StatefulWidget {
  const LandingScreen({Key? key}) : super(key: key);

  @override
  State<LandingScreen> createState() => _LandingScreenState();
}

class _LandingScreenState extends State<LandingScreen> {
  String? _appRole;
  List<String>? _clubStatuten;

  @override
  void initState() {
    super.initState();
    _loadMemberInfo();
  }

  Future<void> _loadMemberInfo() async {
    final authProvider = context.read<AuthProvider>();
    final uid = authProvider.currentUser?.uid;
    if (uid == null) return;

    const clubId = 'calypso';

    try {
      final doc = await FirebaseFirestore.instance
          .collection('clubs/$clubId/members')
          .doc(uid)
          .get();

      if (doc.exists && mounted) {
        final data = doc.data();
        setState(() {
          _clubStatuten = (data?['clubStatuten'] as List<dynamic>?)?.cast<String>();
          _appRole = data?['app_role'] as String? ?? data?['role'] as String?;
        });
      }
    } catch (e) {
      debugPrint('❌ Erreur chargement member info: $e');
    }
  }

  /// Vérifie si l'utilisateur peut approuver (superadmin, admin, validateur)
  bool _canApprove() {
    if (_appRole != null) {
      final role = _appRole!.toLowerCase();
      if (role == 'superadmin' || role == 'admin' || role == 'validateur') {
        return true;
      }
    }
    return false;
  }

  /// Vérifie si l'utilisateur peut créer des demandes
  /// (superadmin, admin, validateur, ou fonction encadrant/CA)
  bool _canCreateExpenses() {
    // Vérifier app_role
    if (_appRole != null) {
      final role = _appRole!.toLowerCase();
      if (role == 'superadmin' || role == 'admin' || role == 'validateur') {
        return true;
      }
    }
    // Vérifier clubStatuten (fonctions)
    if (_clubStatuten != null) {
      for (final statut in _clubStatuten!) {
        final lower = statut.toLowerCase();
        if (lower.contains('encadrant') || lower.contains('ca') || lower == 'ca') {
          return true;
        }
      }
    }
    return false;
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

    final canApprove = _canApprove();
    final canCreateExpenses = _canCreateExpenses();

    return Scaffold(
      backgroundColor: Colors.grey[50],
      appBar: AppBar(
        title: const Text(
          'CalyMob',
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
        ),
        backgroundColor: const Color(0xFF1976D2),
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
          padding: const EdgeInsets.all(16),
          child: Column(
            children: [
              // Logo Calypso
              Container(
                padding: const EdgeInsets.symmetric(vertical: 16),
                child: Image.asset(
                  'assets/images/logo-vertical.png',
                  height: 100,
                  fit: BoxFit.contain,
                ),
              ),

              const SizedBox(height: 8),

              // Bienvenue
              Text(
                'Bienvenue, $userName',
                style: Theme.of(context).textTheme.titleLarge?.copyWith(
                      fontWeight: FontWeight.bold,
                      color: Colors.grey[800],
                    ),
                textAlign: TextAlign.center,
              ),

              const SizedBox(height: 4),

              Text(
                'Calypso Diving Club',
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: Colors.grey[600],
                    ),
                textAlign: TextAlign.center,
              ),

              const SizedBox(height: 24),

              // Ligne 1: Événements + Communication
              Row(
                children: [
                  Expanded(
                    child: _NavigationTile(
                      title: 'Événements',
                      icon: Icons.event,
                      color: const Color(0xFF2196F3),
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
                  const SizedBox(width: 12),
                  Expanded(
                    child: _NavigationTile(
                      title: 'Communication',
                      icon: Icons.campaign,
                      color: const Color(0xFFE91E63),
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

              const SizedBox(height: 12),

              // Ligne 2: Who is Who + Profil
              Row(
                children: [
                  Expanded(
                    child: _NavigationTile(
                      title: 'Who is Who',
                      icon: Icons.people,
                      color: const Color(0xFF00BCD4),
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
                  const SizedBox(width: 12),
                  Expanded(
                    child: _NavigationTile(
                      title: 'Profil',
                      icon: Icons.person,
                      color: const Color(0xFF9C27B0),
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

              const SizedBox(height: 12),

              // Ligne 3: Mes demandes + Approbation (en bas, avec restrictions)
              Row(
                children: [
                  Expanded(
                    child: _NavigationTile(
                      title: 'Mes demandes',
                      icon: Icons.receipt_long,
                      color: const Color(0xFFFF6F00),
                      isEnabled: canCreateExpenses,
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
                  const SizedBox(width: 12),
                  Expanded(
                    child: _NavigationTile(
                      title: 'Approbation',
                      icon: Icons.check_circle_outline,
                      color: const Color(0xFF4CAF50),
                      isEnabled: canApprove,
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

              const SizedBox(height: 30),

              // Footer
              Text(
                'Version 1.0.5',
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
      opacity: isEnabled ? 1.0 : 0.4,
      child: Card(
        elevation: isEnabled ? 3 : 1,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
        ),
        child: InkWell(
          onTap: isEnabled ? onTap : null,
          borderRadius: BorderRadius.circular(12),
          child: Container(
            height: 100,
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
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
                Icon(
                  icon,
                  size: 36,
                  color: Colors.white,
                ),
                const SizedBox(height: 8),
                Text(
                  title,
                  style: const TextStyle(
                    fontSize: 14,
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
