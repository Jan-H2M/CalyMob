import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import '../../models/announcement.dart';
import '../../providers/announcement_provider.dart';
import '../../providers/auth_provider.dart';
import '../../utils/permission_helper.dart';
import '../../widgets/announcement_card.dart';
import '../../widgets/glossy_button.dart';
import '../../widgets/ocean/ocean_gradient_background.dart';
import '../../services/local_read_tracker.dart';
import '../../utils/search_highlight.dart';
import '../../providers/unread_count_provider.dart';
import 'announcement_detail_screen.dart';
import 'create_announcement_dialog.dart';

class AnnouncementsScreen extends StatefulWidget {
  final String initialSearchQuery;

  const AnnouncementsScreen({
    super.key,
    this.initialSearchQuery = '',
  });

  @override
  State<AnnouncementsScreen> createState() => _AnnouncementsScreenState();
}

class _AnnouncementsScreenState extends State<AnnouncementsScreen> {
  List<String>? _clubStatuten;
  String? _appRole;

  @override
  void initState() {
    super.initState();

    WidgetsBinding.instance.addPostFrameCallback((_) {
      _loadAnnouncements();
      _loadMemberInfo();
      // Marquer comme lu après 2 secondes (pour que l'utilisateur voie d'abord les badges NOUVEAU)
      Future.delayed(const Duration(seconds: 2), () {
        if (mounted) _markAnnouncementsAsRead();
      });
    });
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
        debugPrint('📋 clubStatuten: ${data?['clubStatuten']}');
        setState(() {
          _clubStatuten =
              (data?['clubStatuten'] as List<dynamic>?)?.cast<String>();
          _appRole = data?['app_role'] as String?;
        });
      }
    } catch (e) {
      debugPrint('❌ Erreur chargement member info: $e');
    }
  }

  /// Vérifie si l'utilisateur est admin (via clubStatuten OU app_role)
  bool _isUserAdmin() {
    debugPrint(
        '🔐 Checking admin: app_role=$_appRole, clubStatuten=$_clubStatuten');
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

  void _navigateToDetail(Announcement announcement) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (context) => AnnouncementDetailScreen(
          announcement: announcement,
          clubId: 'calypso',
          initialSearchQuery: widget.initialSearchQuery,
        ),
      ),
    );
  }

  /// Marque les annonces comme lues et rafraîchit le badge
  Future<void> _markAnnouncementsAsRead() async {
    final tracker = LocalReadTracker();
    await tracker.markAsRead('announcements');
    // Refresh unread counts so badge disappears
    if (mounted) {
      try {
        final unreadProvider =
            Provider.of<UnreadCountProvider>(context, listen: false);
        unreadProvider.refresh();
      } catch (_) {}
    }
  }

  /// Vérifie si une annonce est non lue (créée après lastRead)
  bool _isAnnouncementUnread(Announcement announcement) {
    final tracker = LocalReadTracker();
    final lastRead = tracker.getLastRead('announcements');
    if (lastRead == null) return true; // Jamais ouvert = tout est nouveau
    return announcement.createdAt.isAfter(lastRead);
  }

  @override
  Widget build(BuildContext context) {
    final authProvider = Provider.of<AuthProvider>(context);
    final announcementProvider = Provider.of<AnnouncementProvider>(context);
    final currentUser = authProvider.currentUser;

    final isAdmin = _isUserAdmin();
    const clubId = 'calypso';

    if (currentUser == null) {
      return const Scaffold(
        body: OceanGradientBackground(
          creatures: CreatureSet.jellyfish,
          child: Center(
            child: Text('Veuillez vous connecter',
                style: TextStyle(color: Colors.white)),
          ),
        ),
      );
    }

    return Scaffold(
      body: OceanGradientBackground(
        creatures: CreatureSet.jellyfish,
        child: SafeArea(
          child: Column(
            children: [
              // Header
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
                child: Row(
                  children: [
                    IconButton(
                      icon: const Icon(Icons.arrow_back,
                          color: Colors.white, size: 28),
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
                        size: 55,
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
                      return const Center(
                          child:
                              CircularProgressIndicator(color: Colors.white));
                    }

                    if (snapshot.hasError) {
                      return Center(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            const Icon(Icons.error_outline,
                                size: 64, color: Colors.red),
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

                    final searchQuery = widget.initialSearchQuery.trim();
                    final allAnnouncements = snapshot.data ?? [];
                    final announcements = allAnnouncements
                        .where(
                          (announcement) => textMatchesSearch(searchQuery, [
                            announcement.title,
                            announcement.message,
                            announcement.senderName,
                            announcement.type.name,
                          ]),
                        )
                        .toList();

                    if (announcements.isEmpty) {
                      return Center(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(Icons.campaign_outlined,
                                size: 80,
                                color: Colors.white.withValues(alpha: 0.6)),
                            const SizedBox(height: 16),
                            Text(
                              searchQuery.isEmpty
                                  ? 'Aucune annonce'
                                  : 'Aucun résultat',
                              style: TextStyle(
                                fontSize: 18,
                                color: Colors.white.withValues(alpha: 0.9),
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            const SizedBox(height: 8),
                            Text(
                              searchQuery.isEmpty
                                  ? (isAdmin
                                      ? 'Cliquez sur + pour créer une annonce'
                                      : 'Les annonces apparaîtront ici')
                                  : 'Aucune annonce ne contient "$searchQuery"',
                              style: TextStyle(
                                fontSize: 14,
                                color: Colors.white.withValues(alpha: 0.7),
                              ),
                            ),
                          ],
                        ),
                      );
                    }

                    return RefreshIndicator(
                      onRefresh: () async => _loadAnnouncements(),
                      child: ListView.builder(
                        padding: const EdgeInsets.symmetric(
                            vertical: 8, horizontal: 16),
                        itemCount: announcements.length,
                        itemBuilder: (context, index) {
                          final announcement = announcements[index];
                          return AnnouncementCard(
                            announcement: announcement,
                            currentUserId: currentUser.uid,
                            isUnread: _isAnnouncementUnread(announcement),
                            searchQuery: searchQuery,
                            onTap: () => _navigateToDetail(announcement),
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
      ),
    );
  }
}
