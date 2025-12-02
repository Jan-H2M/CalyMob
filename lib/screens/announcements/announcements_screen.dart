import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import '../../models/announcement.dart';
import '../../providers/announcement_provider.dart';
import '../../providers/auth_provider.dart';
import '../../utils/permission_helper.dart';
import '../../widgets/announcement_card.dart';
import 'create_announcement_dialog.dart';

class AnnouncementsScreen extends StatefulWidget {
  const AnnouncementsScreen({super.key});

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
      return const Scaffold(
        body: Center(
          child: Text('Veuillez vous connecter'),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('Annonces du club'),
        backgroundColor: Colors.blue,
        foregroundColor: Colors.white,
      ),
      body: StreamBuilder<List<Announcement>>(
        stream: announcementProvider.watchAnnouncements(clubId),
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }

          if (snapshot.hasError) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.error_outline,
                      size: 64, color: Colors.red),
                  const SizedBox(height: 16),
                  Text('Erreur: ${snapshot.error}'),
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
                  Icon(Icons.campaign_outlined,
                      size: 80, color: Colors.grey[400]),
                  const SizedBox(height: 16),
                  Text(
                    'Aucune annonce',
                    style: TextStyle(
                      fontSize: 18,
                      color: Colors.grey[600],
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    isAdmin
                        ? 'Cliquez sur + pour créer une annonce'
                        : 'Les annonces apparaîtront ici',
                    style: TextStyle(
                      fontSize: 14,
                      color: Colors.grey[500],
                    ),
                  ),
                ],
              ),
            );
          }

          return RefreshIndicator(
            onRefresh: () async => _loadAnnouncements(),
            child: ListView.builder(
              padding: const EdgeInsets.symmetric(vertical: 8),
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
      floatingActionButton: isAdmin
          ? FloatingActionButton.extended(
              heroTag: 'announcement_fab',
              onPressed: _showCreateDialog,
              icon: const Icon(Icons.add),
              label: const Text('Nouvelle annonce'),
              backgroundColor: Colors.blue,
              foregroundColor: Colors.white,
            )
          : null,
    );
  }
}
