import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:lottie/lottie.dart';
import '../../config/app_assets.dart';
import '../../providers/auth_provider.dart';
import '../../widgets/glossy_button.dart';
import '../auth/login_screen.dart';
import '../operations/operations_list_screen.dart';
import '../expenses/expense_list_screen.dart';
import '../expenses/approval_list_screen.dart';
import '../profile/profile_screen.dart';
import '../profile/who_is_who_screen.dart';
import '../announcements/announcements_screen.dart';

/// Landing page met maritime thema - ocean background en glossy buttons
class LandingScreen extends StatefulWidget {
  const LandingScreen({Key? key}) : super(key: key);

  @override
  State<LandingScreen> createState() => _LandingScreenState();
}

class _LandingScreenState extends State<LandingScreen>
    with TickerProviderStateMixin {
  String? _appRole;
  List<String>? _clubStatuten;

  // Swimming fish animaties - 4 visjes
  late AnimationController _fishController1;
  late AnimationController _fishController2;
  late AnimationController _fishController3;
  late AnimationController _fishController4;
  late Animation<double> _fishPosition1;
  late Animation<double> _fishPosition2;
  late Animation<double> _fishPosition3;
  late Animation<double> _fishPosition4;

  @override
  void initState() {
    super.initState();
    _loadMemberInfo();

    // Vis 1: grote vis, langzaam (links naar rechts) - start meteen
    _fishController1 = AnimationController(
      duration: const Duration(seconds: 25),
      vsync: this,
    );
    _fishPosition1 = Tween<double>(
      begin: -0.2,
      end: 1.2,
    ).animate(CurvedAnimation(
      parent: _fishController1,
      curve: Curves.easeInOut,
    ));
    _fishController1.repeat();

    // Vis 2: kleine vis, sneller (rechts naar links) - start na 3 sec
    _fishController2 = AnimationController(
      duration: const Duration(seconds: 18),
      vsync: this,
    );
    _fishPosition2 = Tween<double>(
      begin: 1.2,
      end: -0.2,
    ).animate(CurvedAnimation(
      parent: _fishController2,
      curve: Curves.easeInOut,
    ));
    Future.delayed(const Duration(seconds: 3), () {
      if (mounted) _fishController2.repeat();
    });

    // Vis 3: medium vis (links naar rechts, lager) - start na 7 sec
    _fishController3 = AnimationController(
      duration: const Duration(seconds: 22),
      vsync: this,
    );
    _fishPosition3 = Tween<double>(
      begin: -0.3,
      end: 1.3,
    ).animate(CurvedAnimation(
      parent: _fishController3,
      curve: Curves.easeInOut,
    ));
    Future.delayed(const Duration(seconds: 7), () {
      if (mounted) _fishController3.repeat();
    });

    // Vis 4: kleine vis (rechts naar links, nog lager) - start na 12 sec
    _fishController4 = AnimationController(
      duration: const Duration(seconds: 15),
      vsync: this,
    );
    _fishPosition4 = Tween<double>(
      begin: 1.1,
      end: -0.1,
    ).animate(CurvedAnimation(
      parent: _fishController4,
      curve: Curves.easeInOut,
    ));
    Future.delayed(const Duration(seconds: 12), () {
      if (mounted) _fishController4.repeat();
    });
  }

  @override
  void dispose() {
    _fishController1.dispose();
    _fishController2.dispose();
    _fishController3.dispose();
    _fishController4.dispose();
    super.dispose();
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
  bool _canCreateExpenses() {
    if (_appRole != null) {
      final role = _appRole!.toLowerCase();
      if (role == 'superadmin' || role == 'admin' || role == 'validateur') {
        return true;
      }
    }
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
    final screenHeight = MediaQuery.of(context).size.height;

    final canApprove = _canApprove();
    final canCreateExpenses = _canCreateExpenses();

    return Scaffold(
      body: Stack(
        children: [
          // Bovenste deel - lichte achtergrond (wit/lichtgrijs)
          Container(
            height: screenHeight * 0.52,
            width: double.infinity,
            color: const Color(0xFFF5F7FA),
          ),

          // Onderste deel - ocean achtergrond met golf
          Positioned(
            top: screenHeight * 0.42,
            left: 0,
            right: 0,
            bottom: 0,
            child: Image.asset(
              AppAssets.backgroundHalf,
              fit: BoxFit.cover,
              width: double.infinity,
            ),
          ),

          // Vis 1 - grote vis (springt uit water, links naar rechts)
          AnimatedBuilder(
            animation: _fishPosition1,
            builder: (context, child) {
              return Positioned(
                top: screenHeight * 0.38,
                left: MediaQuery.of(context).size.width * _fishPosition1.value - 40,
                child: IgnorePointer(
                  child: Transform.scale(
                    scaleX: 1, // Zwemt naar rechts
                    child: Opacity(
                      opacity: 0.9,
                      child: Lottie.asset(
                        'assets/animations/swimming_fish.json',
                        width: 70,
                        height: 70,
                        repeat: true,
                      ),
                    ),
                  ),
                ),
              );
            },
          ),

          // Vis 2 - kleine vis (hoger, rechts naar links)
          AnimatedBuilder(
            animation: _fishPosition2,
            builder: (context, child) {
              return Positioned(
                top: screenHeight * 0.35,
                left: MediaQuery.of(context).size.width * _fishPosition2.value - 25,
                child: IgnorePointer(
                  child: Transform.scale(
                    scaleX: -1, // Zwemt naar links (gespiegeld)
                    child: Opacity(
                      opacity: 0.7,
                      child: Lottie.asset(
                        'assets/animations/swimming_fish.json',
                        width: 45,
                        height: 45,
                        repeat: true,
                      ),
                    ),
                  ),
                ),
              );
            },
          ),

          // Vis 3 - medium vis (net boven golflijn, links naar rechts)
          AnimatedBuilder(
            animation: _fishPosition3,
            builder: (context, child) {
              return Positioned(
                top: screenHeight * 0.40,
                left: MediaQuery.of(context).size.width * _fishPosition3.value - 30,
                child: IgnorePointer(
                  child: Transform.scale(
                    scaleX: 1, // Zwemt naar rechts
                    child: Opacity(
                      opacity: 0.8,
                      child: Lottie.asset(
                        'assets/animations/swimming_fish.json',
                        width: 55,
                        height: 55,
                        repeat: true,
                      ),
                    ),
                  ),
                ),
              );
            },
          ),

          // Vis 4 - kleine vis (springend, rechts naar links)
          AnimatedBuilder(
            animation: _fishPosition4,
            builder: (context, child) {
              return Positioned(
                top: screenHeight * 0.36,
                left: MediaQuery.of(context).size.width * _fishPosition4.value - 20,
                child: IgnorePointer(
                  child: Transform.scale(
                    scaleX: -1, // Zwemt naar links (gespiegeld)
                    child: Opacity(
                      opacity: 0.6,
                      child: Lottie.asset(
                        'assets/animations/swimming_fish.json',
                        width: 40,
                        height: 40,
                        repeat: true,
                      ),
                    ),
                  ),
                ),
              );
            },
          ),

          // Hoofdinhoud
          SafeArea(
            child: Column(
              children: [
                // Logout knop rechtsboven
                Align(
                  alignment: Alignment.topRight,
                  child: Padding(
                    padding: const EdgeInsets.all(8.0),
                    child: IconButton(
                      icon: const Icon(Icons.logout, color: Colors.grey),
                      onPressed: () => _handleLogout(context),
                      tooltip: 'Déconnexion',
                    ),
                  ),
                ),

                // Logo Calypso
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Image.asset(
                    'assets/images/logo-vertical.png',
                    height: 120,
                    fit: BoxFit.contain,
                  ),
                ),

                const SizedBox(height: 16),

                // Welkom tekst
                Text(
                  'Welkom terug,',
                  style: TextStyle(
                    fontSize: 18,
                    color: Colors.blueGrey[600],
                    fontWeight: FontWeight.w400,
                  ),
                ),

                const SizedBox(height: 4),

                // Gebruikersnaam
                Text(
                  userName,
                  style: const TextStyle(
                    fontSize: 28,
                    fontWeight: FontWeight.bold,
                    color: Color(0xFF1A237E),
                  ),
                ),

                const Spacer(),

                // Glossy buttons grid - 3 kolommen bovenaan
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 24),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                    children: [
                      GlossyButton(
                        icon: Icons.calendar_month,
                        label: 'Events',
                        size: 90,
                        onTap: () {
                          Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (_) => const OperationsListScreen(),
                            ),
                          );
                        },
                      ),
                      GlossyButton(
                        icon: Icons.chat_bubble_outline,
                        label: 'Communication',
                        size: 90,
                        onTap: () {
                          Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (_) => const AnnouncementsScreen(),
                            ),
                          );
                        },
                      ),
                      GlossyButton(
                        icon: Icons.groups,
                        label: 'Who is Who',
                        size: 90,
                        onTap: () {
                          Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (_) => const WhoIsWhoScreen(),
                            ),
                          );
                        },
                      ),
                    ],
                  ),
                ),

                const SizedBox(height: 24),

                // Tweede rij - 2 knoppen (Finances en Profil)
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 48),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                    children: [
                      GlossyButton(
                        icon: Icons.receipt_long,
                        label: 'Finances',
                        size: 90,
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
                      GlossyButton(
                        icon: Icons.person,
                        label: 'Mon Profil',
                        size: 90,
                        onTap: () {
                          Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (_) => const ProfileScreen(),
                            ),
                          );
                        },
                      ),
                    ],
                  ),
                ),

                const SizedBox(height: 24),

                // Versie
                Padding(
                  padding: const EdgeInsets.only(bottom: 16),
                  child: Text(
                    'Version 1.0.7',
                    style: TextStyle(
                      fontSize: 12,
                      color: Colors.white.withOpacity(0.7),
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
