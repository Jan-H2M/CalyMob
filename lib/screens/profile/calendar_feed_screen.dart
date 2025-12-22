import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../config/app_assets.dart';
import '../../config/app_colors.dart';
import '../../models/calendar_feed.dart';
import '../../services/calendar_service.dart';

/// Écran de configuration du calendrier iCal
/// Permet aux membres de synchroniser les événements du club avec leur agenda
class CalendarFeedScreen extends StatefulWidget {
  const CalendarFeedScreen({super.key});

  @override
  State<CalendarFeedScreen> createState() => _CalendarFeedScreenState();
}

class _CalendarFeedScreenState extends State<CalendarFeedScreen> {
  final CalendarService _calendarService = CalendarService();

  CalendarFeed? _feed;
  bool _isLoading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadFeedUrl();
  }

  Future<void> _loadFeedUrl() async {
    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      final feed = await _calendarService.getMyFeedUrl();
      if (mounted) {
        setState(() {
          _feed = feed;
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = e.toString();
          _isLoading = false;
        });
      }
    }
  }

  Future<void> _copyToClipboard() async {
    if (_feed == null) return;

    await Clipboard.setData(ClipboardData(text: _feed!.feedUrl));

    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Lien copié! ✓'),
          backgroundColor: Colors.green,
          duration: Duration(seconds: 2),
        ),
      );
    }
  }

  Future<void> _openInCalendarApp() async {
    if (_feed == null) return;

    // Use webcal:// scheme for calendar subscription
    final webcalUrl = _feed!.webcalUrl;

    try {
      final uri = Uri.parse(webcalUrl);
      if (await canLaunchUrl(uri)) {
        await launchUrl(uri, mode: LaunchMode.externalApplication);
      } else {
        // If webcal:// doesn't work, try https://
        final httpsUri = Uri.parse(_feed!.feedUrl);
        if (await canLaunchUrl(httpsUri)) {
          await launchUrl(httpsUri, mode: LaunchMode.externalApplication);
        } else {
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                content: Text('Impossible d\'ouvrir le calendrier. Copiez le lien manuellement.'),
                backgroundColor: Colors.orange,
              ),
            );
          }
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Erreur: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  Future<void> _regenerateToken() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Régénérer le lien?'),
        content: const Text(
          'L\'ancien lien ne fonctionnera plus. '
          'Vous devrez reconfigurer votre agenda avec le nouveau lien.',
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
            child: const Text('Régénérer'),
          ),
        ],
      ),
    );

    if (confirmed != true || !mounted) return;

    setState(() => _isLoading = true);

    try {
      final newFeed = await _calendarService.regenerateToken();
      if (mounted) {
        setState(() {
          _feed = newFeed;
          _isLoading = false;
        });
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Nouveau lien généré ✓'),
            backgroundColor: Colors.green,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = e.toString();
          _isLoading = false;
        });
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Erreur: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        title: const Text(
          'Synchronisation calendrier',
          style: TextStyle(color: Colors.white),
        ),
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
            child: _isLoading
                ? const Center(
                    child: CircularProgressIndicator(color: Colors.white),
                  )
                : _error != null
                    ? _buildErrorView()
                    : _buildContent(),
          ),
        ],
      ),
    );
  }

  Widget _buildErrorView() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.error_outline, size: 64, color: Colors.white70),
            const SizedBox(height: 16),
            Text(
              'Erreur de chargement',
              style: const TextStyle(
                color: Colors.white,
                fontSize: 20,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              _error ?? 'Une erreur est survenue',
              style: const TextStyle(color: Colors.white70),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 24),
            ElevatedButton.icon(
              onPressed: _loadFeedUrl,
              icon: const Icon(Icons.refresh),
              label: const Text('Réessayer'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildContent() {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Header illustration
          _buildHeaderCard(),

          const SizedBox(height: 16),

          // What is this?
          _buildInfoCard(
            icon: Icons.help_outline,
            iconColor: AppColors.middenblauw,
            title: "QU'EST-CE QUE C'EST?",
            content: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: const [
                Text(
                  'Tous les événements Calypso apparaissent automatiquement '
                  'dans votre application agenda (Google Calendar, Apple, Outlook...).',
                  style: TextStyle(fontSize: 14),
                ),
                SizedBox(height: 8),
                Text(
                  'Configuration unique - ensuite tout est automatique!',
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.bold,
                    color: AppColors.middenblauw,
                  ),
                ),
              ],
            ),
          ),

          const SizedBox(height: 12),

          // How it works
          _buildInfoCard(
            icon: Icons.auto_awesome,
            iconColor: AppColors.oranje,
            title: 'COMMENT ÇA MARCHE?',
            content: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: const [
                _FeatureRow(icon: Icons.check, text: 'Nouveaux événements ajoutés automatiquement'),
                _FeatureRow(icon: Icons.check, text: 'Modifications synchronisées'),
                _FeatureRow(icon: Icons.check, text: 'Événements annulés supprimés'),
                _FeatureRow(icon: Icons.check, text: 'Vos inscriptions marquées avec ✓'),
                SizedBox(height: 8),
                Text(
                  'La synchronisation se fait toutes les quelques heures automatiquement.',
                  style: TextStyle(fontSize: 13, color: Colors.grey),
                ),
              ],
            ),
          ),

          const SizedBox(height: 12),

          // Instructions
          _buildInstructionsCard(),

          const SizedBox(height: 12),

          // Tip
          _buildInfoCard(
            icon: Icons.lightbulb_outline,
            iconColor: Colors.amber,
            title: 'ASTUCE',
            backgroundColor: Colors.amber.shade50,
            content: const Text(
              'Vous pouvez donner une couleur personnalisée au calendrier '
              'Calypso dans votre app agenda. Ainsi, vous verrez immédiatement '
              'quels événements sont du club!',
              style: TextStyle(fontSize: 14),
            ),
          ),

          const SizedBox(height: 16),

          // Regenerate section
          _buildRegenerateSection(),

          const SizedBox(height: 32),
        ],
      ),
    );
  }

  Widget _buildHeaderCard() {
    return Card(
      elevation: 4,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              AppColors.lichtblauw.withOpacity(0.3),
              AppColors.middenblauw.withOpacity(0.1),
            ],
          ),
        ),
        child: Column(
          children: [
            Icon(
              Icons.calendar_month,
              size: 64,
              color: AppColors.middenblauw,
            ),
            const SizedBox(height: 12),
            const Text(
              'Synchronisez votre agenda',
              style: TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.bold,
                color: AppColors.donkerblauw,
              ),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildInfoCard({
    required IconData icon,
    required Color iconColor,
    required String title,
    required Widget content,
    Color? backgroundColor,
  }) {
    return Card(
      elevation: 2,
      color: backgroundColor,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(icon, color: iconColor, size: 24),
                const SizedBox(width: 10),
                Text(
                  title,
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.bold,
                    color: iconColor,
                  ),
                ),
              ],
            ),
            const Divider(height: 20),
            content,
          ],
        ),
      ),
    );
  }

  Widget _buildInstructionsCard() {
    return Card(
      elevation: 2,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: const [
                Icon(Icons.phone_iphone, color: AppColors.middenblauw, size: 24),
                SizedBox(width: 10),
                Text(
                  'INSTRUCTIONS',
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.bold,
                    color: AppColors.middenblauw,
                  ),
                ),
              ],
            ),
            const Divider(height: 20),

            // iOS Instructions
            const Text(
              'iPhone / iPad:',
              style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15),
            ),
            const SizedBox(height: 8),
            _buildStep('1', 'Appuyez sur le bouton ci-dessous'),
            _buildStep('2', 'iOS demande "Voulez-vous vous abonner?"\n→ Appuyez "S\'abonner"'),
            _buildStep('3', 'C\'est fait! ✓'),

            const SizedBox(height: 12),

            // iOS Button
            _buildActionButton(
              onPressed: _openInCalendarApp,
              icon: Icons.calendar_today,
              label: 'Ajouter à mon agenda',
            ),

            const SizedBox(height: 24),

            // Android Instructions
            const Text(
              'Android / Google Calendar:',
              style: TextStyle(fontWeight: FontWeight.bold, fontSize: 15),
            ),
            const SizedBox(height: 8),
            _buildStep('1', 'Appuyez sur le bouton ci-dessous pour copier le lien'),
            _buildStep('2', 'Ouvrez Google Calendar → Paramètres (roue)'),
            _buildStep('3', 'Appuyez "Ajouter un agenda" → "À partir de l\'URL"'),
            _buildStep('4', 'Collez le lien et confirmez'),
            _buildStep('5', 'C\'est fait! ✓'),

            const SizedBox(height: 12),

            // Android Button
            _buildActionButton(
              onPressed: _copyToClipboard,
              icon: Icons.copy,
              label: 'Copier le lien',
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildActionButton({
    required VoidCallback onPressed,
    required IconData icon,
    required String label,
  }) {
    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            AppColors.middenblauw,
            AppColors.lichtblauw,
          ],
          begin: Alignment.centerLeft,
          end: Alignment.centerRight,
        ),
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: AppColors.middenblauw.withOpacity(0.3),
            blurRadius: 8,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onPressed,
          borderRadius: BorderRadius.circular(12),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 24),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(icon, color: Colors.white, size: 22),
                const SizedBox(width: 12),
                Text(
                  label,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildStep(String number, String text) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 22,
            height: 22,
            decoration: BoxDecoration(
              color: AppColors.middenblauw,
              borderRadius: BorderRadius.circular(11),
            ),
            child: Center(
              child: Text(
                number,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 12,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              text,
              style: const TextStyle(fontSize: 14),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildRegenerateSection() {
    return Card(
      elevation: 1,
      color: Colors.orange.shade50,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.security, color: Colors.orange.shade700, size: 20),
                const SizedBox(width: 8),
                Text(
                  'Sécurité',
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    color: Colors.orange.shade700,
                    fontSize: 14,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            const Text(
              'Ce lien est personnel et confidentiel. Ne le partagez pas. '
              'Si vous pensez qu\'il a été compromis, régénérez-le.',
              style: TextStyle(fontSize: 13),
            ),
            const SizedBox(height: 12),
            TextButton.icon(
              onPressed: _regenerateToken,
              icon: const Icon(Icons.refresh, color: Colors.red, size: 20),
              label: const Text(
                'Régénérer le lien',
                style: TextStyle(color: Colors.red),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Widget pour afficher une fonctionnalité avec icône check
class _FeatureRow extends StatelessWidget {
  final IconData icon;
  final String text;

  const _FeatureRow({required this.icon, required this.text});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        children: [
          Icon(icon, color: Colors.green, size: 20),
          const SizedBox(width: 10),
          Expanded(
            child: Text(text, style: const TextStyle(fontSize: 14)),
          ),
        ],
      ),
    );
  }
}
