import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:lottie/lottie.dart';
import '../../config/app_assets.dart';
import '../../config/app_colors.dart';
import '../../models/announcement.dart';
import '../../providers/announcement_provider.dart';
import '../../providers/auth_provider.dart';
import '../../utils/permission_helper.dart';
import '../../widgets/announcement_card.dart';
import '../../widgets/glossy_button.dart';
import 'create_announcement_dialog.dart';

class AnnouncementsScreen extends StatefulWidget {
  const AnnouncementsScreen({super.key});

  @override
  State<AnnouncementsScreen> createState() => _AnnouncementsScreenState();
}

class _AnnouncementsScreenState extends State<AnnouncementsScreen>
    with TickerProviderStateMixin {
  List<String>? _clubStatuten;
  String? _appRole;

  late AnimationController _jellyfishController1;
  late AnimationController _jellyfishController2;
  late AnimationController _jellyfishController3;
  late Animation<double> _jellyfishPosition1;
  late Animation<double> _jellyfishPosition2;
  late Animation<double> _jellyfishPosition3;

  @override
  void initState() {
    super.initState();

    // Jellyfish 1: medium, rechts, 25 seconden
    _jellyfishController1 = AnimationController(
      duration: const Duration(seconds: 25),
      vsync: this,
    );
    _jellyfishPosition1 = Tween<double>(
      begin: 1.2,
      end: -0.3,
    ).animate(CurvedAnimation(
      parent: _jellyfishController1,
      curve: Curves.easeInOut,
    ));
    _jellyfishController1.repeat();

    // Jellyfish 2: groter, links, 30 seconden, start na 8 sec
    _jellyfishController2 = AnimationController(
      duration: const Duration(seconds: 30),
      vsync: this,
    );
    _jellyfishPosition2 = Tween<double>(
      begin: 1.3,
      end: -0.4,
    ).animate(CurvedAnimation(
      parent: _jellyfishController2,
      curve: Curves.easeInOut,
    ));
    Future.delayed(const Duration(seconds: 8), () {
      if (mounted) _jellyfishController2.repeat();
    });

    // Jellyfish 3: kleiner, midden, 20 seconden, start na 15 sec
    _jellyfishController3 = AnimationController(
      duration: const Duration(seconds: 20),
      vsync: this,
    );
    _jellyfishPosition3 = Tween<double>(
      begin: 1.1,
      end: -0.2,
    ).animate(CurvedAnimation(
      parent: _jellyfishController3,
      curve: Curves.easeInOut,
    ));
    Future.delayed(const Duration(seconds: 15), () {
      if (mounted) _jellyfishController3.repeat();
    });

    WidgetsBinding.instance.addPostFrameCallback((_) {
      _loadAnnouncements();
      _loadMemberInfo();
    });
  }

  @override
  void dispose() {
    _jellyfishController1.dispose();
    _jellyfishController2.dispose();
    _jellyfishController3.dispose();
    super.dispose();
  }

  Future<void> _loadMemberInfo() async {
    final authProvider = Provider.of<AuthProvider>(context, listen: false);
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
        debugPrint('📋 Member data keys: ${data?.keys.toList()}');
        debugPrint('📋 app_role: ${data?['app_role']}');
        debugPrint('📋 role: ${data?['role']}');
        debugPrint('📋 clubStatuten: ${data?['clubStatuten']}');
        setState(() {
          _clubStatuten = (data?['clubStatuten'] as List<dynamic>?)?.cast<String>();
          // Essayer app_role, sinon role
          _appRole = data?['app_role'] as String? ?? data?['role'] as String?;
        });
      }
    } catch (e) {
      debugPrint('❌ Erreur chargement member info: $e');
    }
  }

  /// Vérifie si l'utilisateur est admin (via clubStatuten OU app_role)
  bool _isUserAdmin() {
    debugPrint('🔐 Checking admin: app_role=$_appRole, clubStatuten=$_clubStatuten');
    // Vérifier app_role d'abord (superadmin, admin)
    if (_appRole != null) {
      final role = _appRole!.toLowerCase();
      if (role == 'superadmin' || role == 'admin') {
        debugPrint('✅ User IS admin via app_role');
        return true;
      }
    }
    // Sinon vérifier clubStatuten
    final result = PermissionHelper.isAdmin(_clubStatuten ?? []);
    debugPrint('🔐 Admin via clubStatuten: $result');
    return result;
  }

  void _loadAnnouncements() {
    final announcementProvider =
        Provider.of<AnnouncementProvider>(context, listen: false);
    const clubId = 'calypso';
    announcementProvider.loadAnnouncements(clubId);
  }

  Future<void> _showCreateDialog() async {
    final result = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (context) => const CreateAnnouncementDialog(),
    );

    if (result != null && mounted) {
      await _createAnnouncement(
        title: result['title'],
        message: result['message'],
        type: result['type'],
      );
    }
  }

  Future<void> _createAnnouncement({
    required String title,
    required String message,
    required AnnouncementType type,
  }) async {
    final authProvider = Provider.of<AuthProvider>(context, listen: false);
    final announcementProvider =
        Provider.of<AnnouncementProvider>(context, listen: false);

    final currentUser = authProvider.currentUser;
    final displayName = authProvider.displayName;
    if (currentUser == null) return;

    const clubId = 'calypso';

    try {
      await announcementProvider.createAnnouncement(
        clubId: clubId,
        senderId: currentUser.uid,
        senderName: displayName ?? 'Membre',
        title: title,
        message: message,
        type: type,
      );

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('✅ Annonce publiée avec succès'),
            backgroundColor: Colors.green,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('❌ Erreur: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  Future<void> _deleteAnnouncement(String announcementId) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Supprimer l\'annonce'),
        content:
            const Text('Êtes-vous sûr de vouloir supprimer cette annonce?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Annuler'),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            child: const Text('Supprimer'),
          ),
        ],
      ),
    );

    if (confirmed == true && mounted) {
      final announcementProvider =
          Provider.of<AnnouncementProvider>(context, listen: false);
      const clubId = 'calypso';

      try {
        await announcementProvider.deleteAnnouncement(
          clubId,
          announcementId,
        );

        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('✅ Annonce supprimée'),
              backgroundColor: Colors.green,
            ),
          );
        }
      } catch (e) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('❌ Erreur: $e'),
              backgroundColor: Colors.red,
            ),
          );
        }
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final authProvider = Provider.of<AuthProvider>(context);
    final announcementProvider = Provider.of<AnnouncementProvider>(context);
    final currentUser = authProvider.currentUser;

    final isAdmin = _isUserAdmin();
    const clubId = 'calypso';

    if (currentUser == null) {
      return Scaffold(
        body: Container(
          decoration: const BoxDecoration(
            image: DecorationImage(
              image: AssetImage(AppAssets.backgroundLight),
              fit: BoxFit.cover,
            ),
          ),
          child: const Center(
            child: Text('Veuillez vous connecter', style: TextStyle(color: Colors.white)),
          ),
        ),
      );
    }

    return Scaffold(
      body: Stack(
        children: [
          // Achtergrond
          Container(
            width: double.infinity,
            height: double.infinity,
            decoration: const BoxDecoration(
              image: DecorationImage(
                image: AssetImage(AppAssets.backgroundLight),
                fit: BoxFit.cover,
              ),
            ),
          ),

          // Jellyfish 1: medium, rechts - ACHTER de cards
          AnimatedBuilder(
            animation: _jellyfishPosition1,
            builder: (context, child) {
              return Positioned(
                top: MediaQuery.of(context).size.height * _jellyfishPosition1.value,
                right: 20,
                child: IgnorePointer(
                  child: Opacity(
                    opacity: 0.7,
                    child: Lottie.asset(
                      'assets/animations/jellyfish.json',
                      width: 120,
                      height: 120,
                      repeat: true,
                    ),
                  ),
                ),
              );
            },
          ),

          // Jellyfish 3: kleiner, midden - ACHTER de cards
          AnimatedBuilder(
            animation: _jellyfishPosition3,
            builder: (context, child) {
              return Positioned(
                top: MediaQuery.of(context).size.height * _jellyfishPosition3.value,
                left: MediaQuery.of(context).size.width * 0.4,
                child: IgnorePointer(
                  child: Opacity(
                    opacity: 0.5,
                    child: Lottie.asset(
                      'assets/animations/jellyfish.json',
                      width: 80,
                      height: 80,
                      repeat: true,
                    ),
                  ),
                ),
              );
            },
          ),

          // Inhoud
          SafeArea(
          child: Column(
            children: [
              // Header
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
                child: Row(
                  children: [
                    IconButton(
                      icon: const Icon(Icons.arrow_back, color: Colors.white, size: 28),
                      onPressed: () => Navigator.pop(context),
                    ),
                    const Expanded(
                      child: Text(
                        'Communication',
                        style: TextStyle(
                          color: Colors.white,
                          fontSize: 22,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                    if (isAdmin)
                      GlossyButton(
                        icon: Icons.add_rounded,
                        label: '',
                        size: 50,
                        onTap: _showCreateDialog,
                      ),
                  ],
                ),
              ),
              // Body
              Expanded(
                child: StreamBuilder<List<Announcement>>(
                  stream: announcementProvider.watchAnnouncements(clubId),
                  builder: (context, snapshot) {
                    if (snapshot.connectionState == ConnectionState.waiting) {
                      return const Center(child: CircularProgressIndicator(color: Colors.white));
                    }

                    if (snapshot.hasError) {
                      return Center(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            const Icon(Icons.error_outline, size: 64, color: Colors.red),
                            const SizedBox(height: 16),
                            Text(
                              'Erreur: ${snapshot.error}',
                              style: const TextStyle(color: Colors.white),
                            ),
                            const SizedBox(height: 16),
                            ElevatedButton(
                              onPressed: _loadAnnouncements,
                              child: const Text('Réessayer'),
                            ),
                          ],
                        ),
                      );
                    }

                    final announcements = snapshot.data ?? [];

                    if (announcements.isEmpty) {
                      return Center(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(Icons.campaign_outlined, size: 80, color: Colors.white.withOpacity(0.6)),
                            const SizedBox(height: 16),
                            Text(
                              'Aucune annonce',
                              style: TextStyle(
                                fontSize: 18,
                                color: Colors.white.withOpacity(0.9),
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            const SizedBox(height: 8),
                            Text(
                              isAdmin
                                  ? 'Cliquez sur + pour créer une annonce'
                                  : 'Les annonces apparaîtront ici',
                              style: TextStyle(
                                fontSize: 14,
                                color: Colors.white.withOpacity(0.7),
                              ),
                            ),
                          ],
                        ),
                      );
                    }

                    return RefreshIndicator(
                      onRefresh: () async => _loadAnnouncements(),
                      child: ListView.builder(
                        padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 16),
                        itemCount: announcements.length,
                        itemBuilder: (context, index) {
                          final announcement = announcements[index];
                          return AnnouncementCard(
                            announcement: announcement,
                            isAdmin: isAdmin,
                            onDelete: isAdmin
                                ? () => _deleteAnnouncement(announcement.id)
                                : null,
                          );
                        },
                      ),
                    );
                  },
                ),
              ),
            ],
          ),
          ),

          // Jellyfish 2: groter, links - VOOR de cards
          AnimatedBuilder(
            animation: _jellyfishPosition2,
            builder: (context, child) {
              return Positioned(
                top: MediaQuery.of(context).size.height * _jellyfishPosition2.value,
                left: 15,
                child: IgnorePointer(
                  child: Opacity(
                    opacity: 0.6,
                    child: Lottie.asset(
                      'assets/animations/jellyfish.json',
                      width: 160,
                      height: 160,
                      repeat: true,
                    ),
                  ),
                ),
              );
            },
          ),
        ],
      ),
    );
  }
}
