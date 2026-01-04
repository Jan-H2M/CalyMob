import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../config/app_assets.dart';
import '../../config/app_colors.dart';
import '../../providers/auth_provider.dart';
import '../../models/member_profile.dart';
import '../../services/profile_service.dart';
import '../../services/notification_service.dart';
import '../../services/biometric_service.dart';
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
  final BiometricService _biometricService = BiometricService();
  final TextEditingController _phoneController = TextEditingController();

  bool _isLoading = false;
  bool _notificationsEnabled = false;
  bool _biometricAvailable = false;
  bool _biometricEnabled = false;
  String _biometricTypeName = 'Biométrie';

  @override
  void initState() {
    super.initState();
    _checkBiometricStatus();
  }

  Future<void> _checkBiometricStatus() async {
    final available = await _biometricService.isBiometricAvailable();
    final enabled = await _biometricService.isBiometricLoginEnabled();
    final hasCredentials = await _biometricService.hasStoredCredentials();
    final typeName = await _biometricService.getBiometricTypeName();

    if (mounted) {
      setState(() {
        _biometricAvailable = available;
        _biometricEnabled = enabled && hasCredentials;
        _biometricTypeName = typeName;
      });
    }
  }

  @override
  void dispose() {
    _phoneController.dispose();
    super.dispose();
  }

  Future<void> _toggleBiometric(bool value) async {
    if (!value) {
      // Désactiver la biométrie
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: Text('Désactiver $_biometricTypeName ?'),
          content: const Text(
            'Vous devrez saisir votre email et mot de passe pour vous connecter.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Annuler'),
            ),
            ElevatedButton(
              onPressed: () => Navigator.pop(context, true),
              style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
              child: const Text('Désactiver', style: TextStyle(color: Colors.white)),
            ),
          ],
        ),
      );

      if (confirmed == true) {
        await _biometricService.disableBiometricLogin();
        if (mounted) {
          setState(() => _biometricEnabled = false);
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text('$_biometricTypeName désactivé'),
              backgroundColor: Colors.orange,
            ),
          );
        }
      }
    } else {
      // Pour activer, l'utilisateur doit se reconnecter avec email/mot de passe
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Déconnectez-vous et reconnectez-vous pour activer la biométrie'),
            backgroundColor: Colors.blue,
          ),
        );
      }
    }
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
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        title: const Text('Paramètres', style: TextStyle(color: Colors.white)),
        backgroundColor: Colors.transparent,
        elevation: 0,
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      body: Stack(
        children: [
          // Ocean background
          Positioned.fill(
            child: Image.asset(
              AppAssets.backgroundFull,
              fit: BoxFit.cover,
            ),
          ),
          // Content
          SafeArea(
            child: StreamBuilder<MemberProfile?>(
              stream: _profileService.watchProfile(_clubId, userId),
              builder: (context, snapshot) {
                if (snapshot.connectionState == ConnectionState.waiting) {
                  return const Center(child: CircularProgressIndicator(color: Colors.white));
                }

                if (!snapshot.hasData || snapshot.data == null) {
                  return const Center(
                    child: Text('Erreur de chargement du profil', style: TextStyle(color: Colors.white)),
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

                        // Sécurité (Biométrie)
                        if (_biometricAvailable) ...[
                          _buildSectionHeader('Sécurité'),
                          _buildSecuritySection(),
                          const SizedBox(height: 24),
                        ],

                        // Notifications
                        _buildSectionHeader('Notifications'),
                        _buildNotificationsSection(profile),

                        const SizedBox(height: 24),

                        // Vie privée
                        _buildSectionHeader('Vie privée'),
                        _buildPrivacySection(profile),

                        const SizedBox(height: 24),

                        // Mon compte
                        _buildSectionHeader('Mon compte'),
                        _buildAccountSection(profile),
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
          ),
        ],
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
          color: Colors.white,
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

  Widget _buildSecuritySection() {
    return Card(
      elevation: 2,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Column(
        children: [
          SwitchListTile(
            value: _biometricEnabled,
            onChanged: _toggleBiometric,
            title: Text('Connexion avec $_biometricTypeName'),
            subtitle: Text(
              _biometricEnabled
                  ? 'Connectez-vous rapidement avec $_biometricTypeName'
                  : 'Reconnectez-vous pour activer cette option',
              style: TextStyle(
                fontSize: 12,
                color: _biometricEnabled ? Colors.green.shade700 : Colors.grey.shade600,
              ),
            ),
            secondary: Icon(
              _biometricTypeName == 'Face ID' ? Icons.face : Icons.fingerprint,
              color: _biometricEnabled ? Colors.green : Colors.grey,
              size: 28,
            ),
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
            leading: const Icon(Icons.privacy_tip, color: AppColors.middenblauw),
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

  Widget _buildAccountSection(MemberProfile profile) {
    return Card(
      elevation: 2,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Column(
        children: [
          ListTile(
            leading: const Icon(Icons.delete_forever, color: Colors.red),
            title: const Text(
              'Supprimer mon compte',
              style: TextStyle(color: Colors.red),
            ),
            subtitle: const Text(
              'Suppression définitive de toutes vos données',
              style: TextStyle(fontSize: 12),
            ),
            trailing: const Icon(Icons.chevron_right, color: Colors.red),
            onTap: () => _showDeleteAccountDialog(profile),
          ),
        ],
      ),
    );
  }

  Future<void> _showDeleteAccountDialog(MemberProfile profile) async {
    final confirmed = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (context) => AlertDialog(
        title: const Row(
          children: [
            Icon(Icons.warning_amber_rounded, color: Colors.red, size: 28),
            SizedBox(width: 12),
            Expanded(
              child: Text(
                'Supprimer votre compte ?',
                style: TextStyle(color: Colors.red),
              ),
            ),
          ],
        ),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.red.shade50,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: Colors.red.shade200),
                ),
                child: const Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '⚠️ Cette action est irréversible !',
                      style: TextStyle(
                        fontWeight: FontWeight.bold,
                        color: Colors.red,
                      ),
                    ),
                    SizedBox(height: 8),
                    Text(
                      'Toutes vos données personnelles seront supprimées :',
                      style: TextStyle(fontSize: 13),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              _buildDeleteInfoItem(Icons.person, 'Vos informations personnelles'),
              _buildDeleteInfoItem(Icons.photo, 'Votre photo de profil'),
              _buildDeleteInfoItem(Icons.notifications, 'Vos préférences de notifications'),
              _buildDeleteInfoItem(Icons.fingerprint, 'Vos données biométriques locales'),
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.blue.shade50,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(Icons.info_outline, size: 20, color: Colors.blue.shade700),
                    const SizedBox(width: 8),
                    const Expanded(
                      child: Text(
                        'Conformément au RGPD, vos inscriptions aux activités et notes de frais seront anonymisées mais conservées pour des raisons légales.',
                        style: TextStyle(fontSize: 12),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Annuler'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(context, true),
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.red,
              foregroundColor: Colors.white,
            ),
            child: const Text('Supprimer définitivement'),
          ),
        ],
      ),
    );

    if (confirmed == true && mounted) {
      await _performAccountDeletion();
    }
  }

  Widget _buildDeleteInfoItem(IconData icon, String text) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Icon(icon, size: 18, color: Colors.grey.shade600),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              text,
              style: TextStyle(
                fontSize: 13,
                color: Colors.grey.shade700,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _performAccountDeletion() async {
    setState(() => _isLoading = true);

    try {
      final authProvider = context.read<AuthProvider>();
      await authProvider.deleteAccount(clubId: _clubId);

      if (mounted) {
        // Afficher un message de confirmation
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('✅ Votre compte a été supprimé'),
            backgroundColor: Colors.green,
            duration: Duration(seconds: 3),
          ),
        );

        // Naviguer vers l'écran de login (remplace toute la stack)
        Navigator.of(context).pushNamedAndRemoveUntil('/login', (route) => false);
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isLoading = false);

        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('❌ Erreur: ${e.toString().replaceFirst('Exception: ', '')}'),
            backgroundColor: Colors.red,
            duration: const Duration(seconds: 5),
          ),
        );
      }
    }
  }
}
