import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/auth_provider.dart';
import '../../models/member_profile.dart';
import '../../services/profile_service.dart';
import '../../services/notification_service.dart';
import 'privacy_policy_screen.dart';

/// Écran des paramètres
class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  final String _clubId = 'calypso';
  final ProfileService _profileService = ProfileService();
  final NotificationService _notificationService = NotificationService();
  final TextEditingController _phoneController = TextEditingController();

  bool _isLoading = false;
  bool _notificationsEnabled = false;

  @override
  void dispose() {
    _phoneController.dispose();
    super.dispose();
  }

  Future<void> _updatePhoneNumber(MemberProfile profile) async {
    _phoneController.text = profile.phoneNumber ?? '';

    final newPhone = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Numéro de téléphone'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Format international recommandé (ex: +32 474 12 34 56)',
              style: TextStyle(fontSize: 12, color: Colors.grey),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _phoneController,
              decoration: const InputDecoration(
                labelText: 'Numéro de téléphone',
                hintText: '+32 474 12 34 56',
                prefixIcon: Icon(Icons.phone),
                border: OutlineInputBorder(),
              ),
              keyboardType: TextInputType.phone,
            ),
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.blue.shade50,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                children: [
                  Icon(Icons.info_outline, size: 16, color: Colors.blue.shade700),
                  const SizedBox(width: 8),
                  const Expanded(
                    child: Text(
                      'Ce numéro sera utilisé pour WhatsApp si vous activez le partage',
                      style: TextStyle(fontSize: 12),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Annuler'),
          ),
          ElevatedButton(
            onPressed: () {
              Navigator.pop(context, _phoneController.text.trim());
            },
            child: const Text('Enregistrer'),
          ),
        ],
      ),
    );

    if (newPhone != null && mounted) {
      setState(() => _isLoading = true);

      try {
        final userId = context.read<AuthProvider>().currentUser?.uid ?? '';
        await _profileService.updatePhoneNumber(
          _clubId,
          userId,
          newPhone.isEmpty ? null : newPhone,
        );

        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('✅ Numéro de téléphone mis à jour'),
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
      } finally {
        if (mounted) {
          setState(() => _isLoading = false);
        }
      }
    }
  }

  Future<void> _toggleNotifications(bool value, MemberProfile profile) async {
    if (value) {
      // Activer les notifications
      final permitted = await _notificationService.requestPermission();

      if (!permitted) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Veuillez autoriser les notifications dans les paramètres de votre appareil'),
              backgroundColor: Colors.orange,
            ),
          );
        }
        return;
      }

      setState(() => _isLoading = true);

      try {
        final userId = context.read<AuthProvider>().currentUser?.uid ?? '';
        await _notificationService.saveTokenToFirestore(_clubId, userId);

        if (mounted) {
          setState(() => _notificationsEnabled = true);
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('✅ Notifications activées'),
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
      } finally {
        if (mounted) {
          setState(() => _isLoading = false);
        }
      }
    } else {
      // Désactiver les notifications
      setState(() => _isLoading = true);

      try {
        final userId = context.read<AuthProvider>().currentUser?.uid ?? '';
        await _notificationService.removeTokenFromFirestore(_clubId, userId);

        if (mounted) {
          setState(() => _notificationsEnabled = false);
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('✅ Notifications désactivées'),
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
      } finally {
        if (mounted) {
          setState(() => _isLoading = false);
        }
      }
    }
  }

  Future<void> _updateContactSharing(
    bool shareEmail,
    bool sharePhone,
  ) async {
    setState(() => _isLoading = true);

    try {
      final userId = context.read<AuthProvider>().currentUser?.uid ?? '';
      await _profileService.updateContactSharing(
        _clubId,
        userId,
        shareEmail: shareEmail,
        sharePhone: sharePhone,
      );

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('✅ Préférences de partage mises à jour'),
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
    } finally{
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  Future<void> _updatePhotoConsents(
    MemberProfile profile, {
    required bool consentInternal,
    required bool consentExternal,
  }) async {
    // Si on retire le consentement interne, afficher une confirmation
    if (!consentInternal && profile.hasPhoto) {
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('⚠️ Retirer le consentement'),
          content: const Text(
            'En retirant votre consentement, votre photo de profil sera supprimée définitivement.\n\n'
            'Cette action est conforme au RGPD (Article 17 - Droit à l\'effacement).\n\n'
            'Voulez-vous continuer ?',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Annuler'),
            ),
            ElevatedButton(
              onPressed: () => Navigator.pop(context, true),
              style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
              child: const Text('Supprimer', style: TextStyle(color: Colors.white)),
            ),
          ],
        ),
      );

      if (confirmed != true) return;
    }

    setState(() => _isLoading = true);

    try {
      final userId = context.read<AuthProvider>().currentUser?.uid ?? '';
      await _profileService.updatePhotoConsents(
        _clubId,
        userId,
        consentInternal: consentInternal,
        consentExternal: consentExternal,
      );

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              consentInternal
                  ? '✅ Consentements mis à jour'
                  : '✅ Consentement retiré - Photo supprimée',
            ),
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
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final userId = context.watch<AuthProvider>().currentUser?.uid ?? '';

    return Scaffold(
      appBar: AppBar(
        title: const Text('Paramètres', style: TextStyle(color: Colors.white)),
        backgroundColor: const Color(0xFF607D8B), // Blue Grey
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      body: StreamBuilder<MemberProfile?>(
        stream: _profileService.watchProfile(_clubId, userId),
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }

          if (!snapshot.hasData || snapshot.data == null) {
            return const Center(
              child: Text('Erreur de chargement du profil'),
            );
          }

          final profile = snapshot.data!;
          _notificationsEnabled = profile.notificationsEnabled;

          return Stack(
            children: [
              ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  // Contact
                  _buildSectionHeader('Contact'),
                  _buildContactSection(profile),

                  const SizedBox(height: 24),

                  // Notifications
                  _buildSectionHeader('Notifications'),
                  _buildNotificationsSection(profile),

                  const SizedBox(height: 24),

                  // Vie privée
                  _buildSectionHeader('Vie privée'),
                  _buildPrivacySection(profile),
                ],
              ),

              if (_isLoading)
                Container(
                  color: Colors.black54,
                  child: const Center(
                    child: CircularProgressIndicator(color: Colors.white),
                  ),
                ),
            ],
          );
        },
      ),
    );
  }

  Widget _buildSectionHeader(String title) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Text(
        title,
        style: const TextStyle(
          fontSize: 18,
          fontWeight: FontWeight.bold,
          color: Color(0xFF607D8B),
        ),
      ),
    );
  }

  Widget _buildContactSection(MemberProfile profile) {
    return Card(
      elevation: 2,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Column(
        children: [
          ListTile(
            leading: const Icon(Icons.phone, color: Colors.blue),
            title: const Text('Numéro de téléphone'),
            subtitle: Text(
              profile.phoneNumber ?? 'Non défini',
              style: TextStyle(
                color: profile.phoneNumber != null ? Colors.black87 : Colors.grey,
              ),
            ),
            trailing: const Icon(Icons.edit, size: 20),
            onTap: () => _updatePhoneNumber(profile),
          ),
        ],
      ),
    );
  }

  Widget _buildNotificationsSection(MemberProfile profile) {
    return Card(
      elevation: 2,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Column(
        children: [
          SwitchListTile(
            value: _notificationsEnabled,
            onChanged: (value) => _toggleNotifications(value, profile),
            title: const Text('Notifications push'),
            subtitle: const Text('Recevoir des notifications sur les événements'),
            secondary: const Icon(Icons.notifications, color: Colors.orange),
          ),
        ],
      ),
    );
  }

  Widget _buildPrivacySection(MemberProfile profile) {
    return Card(
      elevation: 2,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Column(
        children: [
          // Consentement usage interne photo (REQUIS)
          SwitchListTile(
            value: profile.consentInternalPhoto,
            onChanged: (value) => _updatePhotoConsents(
              profile,
              consentInternal: value,
              consentExternal: value ? profile.consentExternalPhoto : false,
            ),
            title: const Text('Usage interne des photos'),
            subtitle: Text(
              profile.consentInternalPhoto
                  ? 'Vos photos sont visibles par les membres du club'
                  : 'Requis pour ajouter une photo de profil',
              style: TextStyle(
                fontSize: 12,
                color: profile.consentInternalPhoto ? Colors.green.shade700 : Colors.orange.shade700,
              ),
            ),
            secondary: Icon(
              Icons.people,
              color: profile.consentInternalPhoto ? Colors.green : Colors.orange,
            ),
          ),

          if (profile.consentInternalPhoto) ...[
            const Divider(height: 1),
            // Consentement usage externe photo (OPTIONNEL)
            SwitchListTile(
              value: profile.consentExternalPhoto,
              onChanged: (value) => _updatePhotoConsents(
                profile,
                consentInternal: profile.consentInternalPhoto,
                consentExternal: value,
              ),
              title: const Text('Usage externe des photos'),
              subtitle: const Text(
                'Autoriser l\'utilisation de vos photos sur les réseaux sociaux, site web public, publications, etc.',
                style: TextStyle(fontSize: 12),
              ),
              secondary: const Icon(Icons.public, color: Colors.blue),
            ),
          ],

          const Divider(height: 1, thickness: 2),

          SwitchListTile(
            value: profile.shareEmail,
            onChanged: (value) => _updateContactSharing(value, profile.sharePhone),
            title: const Text('Partager mon email'),
            subtitle: const Text('Visible dans "Who\'s Who"'),
            secondary: const Icon(Icons.email, color: Colors.blue),
          ),
          const Divider(height: 1),
          SwitchListTile(
            value: profile.sharePhone,
            onChanged: profile.phoneNumber != null
                ? (value) => _updateContactSharing(profile.shareEmail, value)
                : null,
            title: const Text('Partager mon téléphone'),
            subtitle: Text(
              profile.phoneNumber != null
                  ? 'WhatsApp visible dans "Who\'s Who"'
                  : 'Ajoutez d\'abord un numéro de téléphone',
            ),
            secondary: Icon(
              Icons.phone,
              color: profile.phoneNumber != null ? Colors.green : Colors.grey,
            ),
          ),
          const Divider(height: 1),
          ListTile(
            leading: const Icon(Icons.privacy_tip, color: Color(0xFF607D8B)),
            title: const Text('Politique de confidentialité'),
            subtitle: const Text('RGPD et protection des données'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () {
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => const PrivacyPolicyScreen(),
                ),
              );
            },
          ),
        ],
      ),
    );
  }
}
