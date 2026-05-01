import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:provider/provider.dart';
import '../../config/app_assets.dart';
import '../../config/app_colors.dart';
import '../../config/firebase_config.dart';
import '../../providers/auth_provider.dart';
import '../../widgets/ocean/ocean_gradient_background.dart';

/// Écran de préférences de notifications granulaires
/// Permet de choisir quels types de notifications recevoir
class NotificationPreferencesScreen extends StatefulWidget {
  const NotificationPreferencesScreen({super.key});

  @override
  State<NotificationPreferencesScreen> createState() =>
      _NotificationPreferencesScreenState();
}

class _NotificationPreferencesScreenState
    extends State<NotificationPreferencesScreen> {
  final String _clubId = FirebaseConfig.defaultClubId;
  bool _isLoading = false;

  // Default preferences (all enabled)
  Map<String, bool> _preferences = {
    'new_events': true,
    'event_messages': true,
    'piscine_tasks': true,
    'announcement_replies': true,
    'team_messages': true,
    'session_messages': true,
    'session_reminders': true,
    'medical_certificates': true,
    'exercise_declarations': true,
  };

  @override
  void initState() {
    super.initState();
    _loadPreferences();
  }

  Future<void> _loadPreferences() async {
    final userId = context.read<AuthProvider>().currentUser?.uid;
    if (userId == null) return;

    try {
      final doc = await FirebaseFirestore.instance
          .collection('clubs')
          .doc(_clubId)
          .collection('members')
          .doc(userId)
          .get();

      if (doc.exists && mounted) {
        final data = doc.data();
        final prefs = data?['notification_preferences'] as Map<String, dynamic>?;
        if (prefs != null) {
          setState(() {
            for (final key in _preferences.keys) {
              if (prefs.containsKey(key)) {
                _preferences[key] = prefs[key] == true;
              }
            }
          });
        }
      }
    } catch (e) {
      debugPrint('Error loading notification preferences: $e');
    }
  }

  Future<void> _updatePreference(String key, bool value) async {
    final userId = context.read<AuthProvider>().currentUser?.uid;
    if (userId == null) return;

    setState(() {
      _preferences[key] = value;
      _isLoading = true;
    });

    try {
      await FirebaseFirestore.instance
          .collection('clubs')
          .doc(_clubId)
          .collection('members')
          .doc(userId)
          .update({
        'notification_preferences.$key': value,
      });
    } catch (e) {
      // Revert on error
      if (mounted) {
        setState(() => _preferences[key] = !value);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Erreur: $e'),
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
    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        title: const Text('Préférences de notifications',
            style: TextStyle(color: Colors.white)),
        backgroundColor: Colors.transparent,
        elevation: 0,
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      body: OceanGradientBackground(
        creatures: CreatureSet.bubbles,
        opacity: 0.7,
        child: Stack(
          children: [
            SafeArea(
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  // Info card
                  Card(
                    elevation: 2,
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12)),
                    color: AppColors.middenblauw.withOpacity(0.9),
                    child: const Padding(
                      padding: EdgeInsets.all(16),
                      child: Row(
                        children: [
                          Icon(Icons.info_outline, color: Colors.white, size: 20),
                          SizedBox(width: 12),
                          Expanded(
                            child: Text(
                              'Choisis les notifications que tu souhaites recevoir. '
                              'Les annonces du club sont toujours envoyées.',
                              style: TextStyle(color: Colors.white, fontSize: 13),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),

                  const SizedBox(height: 16),

                  // Notification preferences card
                  Card(
                    elevation: 2,
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12)),
                    child: Column(
                      children: [
                        // Announcements - always on, disabled toggle
                        SwitchListTile(
                          value: true,
                          onChanged: null, // Disabled/greyed out
                          title: const Text('Annonces du club'),
                          subtitle: const Text(
                            'Les annonces importantes sont toujours envoyées',
                            style: TextStyle(fontSize: 12, color: Colors.grey),
                          ),
                          secondary: Icon(
                            Icons.campaign,
                            color: Colors.grey.shade400,
                          ),
                        ),

                        const Divider(height: 1),

                        // New outdoor events
                        _buildPreferenceTile(
                          key: 'new_events',
                          icon: Icons.scuba_diving,
                          iconColor: AppColors.middenblauw,
                          title: 'Nouvelles sorties extérieures',
                          subtitle: 'Quand une nouvelle plongée ou sortie est proposée',
                        ),

                        const Divider(height: 1),

                        // Event messages (participants only)
                        _buildPreferenceTile(
                          key: 'event_messages',
                          icon: Icons.chat_bubble_outline,
                          iconColor: AppColors.middenblauw,
                          title: 'Messages d\'événements',
                          subtitle:
                              'Discussions des événements auxquels tu participes',
                        ),

                        const Divider(height: 1),

                        // Pool task assignments
                        _buildPreferenceTile(
                          key: 'piscine_tasks',
                          icon: Icons.pool,
                          iconColor: Colors.blue,
                          title: 'Tâches de piscine',
                          subtitle:
                              'Quand tu es assigné(e) à une tâche (accueil, gonflage, encadrant)',
                        ),

                        const Divider(height: 1),

                        // Announcement replies (thread participants)
                        _buildPreferenceTile(
                          key: 'announcement_replies',
                          icon: Icons.reply_all,
                          iconColor: Colors.orange,
                          title: 'Réponses aux annonces',
                          subtitle:
                              'Réponses dans les threads auxquels tu participes',
                        ),

                        const Divider(height: 1),

                        // Team messages
                        _buildPreferenceTile(
                          key: 'team_messages',
                          icon: Icons.groups,
                          iconColor: Colors.green,
                          title: 'Messages d\'équipe',
                          subtitle: 'Messages dans tes canaux d\'équipe',
                        ),

                        const Divider(height: 1),

                        // Session messages
                        _buildPreferenceTile(
                          key: 'session_messages',
                          icon: Icons.pool,
                          iconColor: Colors.teal,
                          title: 'Messages de piscine',
                          subtitle: 'Discussions dans les sessions de piscine',
                        ),

                        const Divider(height: 1),

                        // Session reminders
                        _buildPreferenceTile(
                          key: 'session_reminders',
                          icon: Icons.alarm,
                          iconColor: Colors.purple,
                          title: 'Rappels de piscine',
                          subtitle: 'Rappel la veille d\'une session',
                        ),

                        const Divider(height: 1),

                        // Medical certificates
                        _buildPreferenceTile(
                          key: 'medical_certificates',
                          icon: Icons.medical_services,
                          iconColor: Colors.red,
                          title: 'Certificats médicaux',
                          subtitle:
                              'Quand ton certificat est approuvé ou refusé',
                        ),

                        const Divider(height: 1),

                        // Exercise declarations digest (encadrants only — those
                        // without the role won't ever receive these anyway, but
                        // the toggle stays visible so opt-out is consistent).
                        _buildPreferenceTile(
                          key: 'exercise_declarations',
                          icon: Icons.school_outlined,
                          iconColor: Colors.indigo,
                          title: 'Déclarations d\'exercices',
                          subtitle:
                              'Récapitulatif quotidien (19h) des exercices à valider — encadrants',
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),

            // Loading overlay
            if (_isLoading)
              Positioned(
                top: 0,
                left: 0,
                right: 0,
                child: LinearProgressIndicator(
                  backgroundColor: Colors.transparent,
                  valueColor:
                      AlwaysStoppedAnimation<Color>(AppColors.middenblauw),
                ),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildPreferenceTile({
    required String key,
    required IconData icon,
    required Color iconColor,
    required String title,
    required String subtitle,
  }) {
    final isEnabled = _preferences[key] ?? true;

    return SwitchListTile(
      value: isEnabled,
      onChanged: (value) => _updatePreference(key, value),
      title: Text(title),
      subtitle: Text(
        subtitle,
        style: const TextStyle(fontSize: 12),
      ),
      secondary: Icon(icon, color: isEnabled ? iconColor : Colors.grey),
    );
  }
}
