import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../config/app_assets.dart';

class PrivacyPolicyScreen extends StatelessWidget {
  const PrivacyPolicyScreen({super.key});

  static final Uri _policyUri = Uri.parse('https://caly.club/privacy');

  Future<void> _openPolicy(BuildContext context) async {
    if (await canLaunchUrl(_policyUri)) {
      await launchUrl(_policyUri, mode: LaunchMode.externalApplication);
      return;
    }

    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Impossible d’ouvrir la politique de confidentialite.'),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        title: const Text(
          'Politique de confidentialite',
          style: TextStyle(color: Colors.white),
        ),
        backgroundColor: Colors.transparent,
        elevation: 0,
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      body: Stack(
        children: [
          Positioned.fill(
            child: Image.asset(
              AppAssets.backgroundFull,
              fit: BoxFit.cover,
            ),
          ),
          SafeArea(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _SectionCard(
                    title: 'Version officielle',
                    icon: Icons.verified,
                    content:
                        'La version complete et a jour de la politique de confidentialite est publiee sur caly.club. '
                        'Cet ecran mobile en donne uniquement un resume.',
                    actionLabel: 'Ouvrir la politique complete',
                    onPressed: () => _openPolicy(context),
                  ),
                  const SizedBox(height: 16),
                  const _SectionCard(
                    title: 'Donnees traitees',
                    icon: Icons.storage,
                    content:
                        'CalyMob traite les donnees de compte, certaines donnees de membre, les inscriptions aux activites, '
                        'les demandes de remboursement, les pieces justificatives, les notifications, ainsi que des donnees techniques utiles au support et a la securite.',
                  ),
                  const SizedBox(height: 16),
                  const _SectionCard(
                    title: 'Diagnostics et support',
                    icon: Icons.bug_report,
                    content:
                        'L’application utilise aussi des rapports de crash, des diagnostics techniques et certains evenements analytics '
                        'pour le suivi du service et la resolution d’incidents.',
                  ),
                  const SizedBox(height: 16),
                  const _SectionCard(
                    title: 'Biometrie',
                    icon: Icons.fingerprint,
                    content:
                        'Si vous activez la connexion biometrique, la verification est geree par votre appareil. '
                        'Le club ne maintient pas de base biometrie centralisee.',
                  ),
                  const SizedBox(height: 16),
                  const _SectionCard(
                    title: 'Contact',
                    icon: Icons.mail_outline,
                    content:
                        'Pour toute question relative a vos donnees, contactez le club a l’adresse calypsodivingclub@gmail.com '
                        'ou consultez la version complete de la politique.',
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _SectionCard extends StatelessWidget {
  final String title;
  final IconData icon;
  final String content;
  final String? actionLabel;
  final VoidCallback? onPressed;

  const _SectionCard({
    required this.title,
    required this.icon,
    required this.content,
    this.actionLabel,
    this.onPressed,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.94),
        borderRadius: BorderRadius.circular(18),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.08),
            blurRadius: 18,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, color: Colors.blue.shade700),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  title,
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                    color: Colors.black87,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            content,
            style: TextStyle(
              fontSize: 14,
              height: 1.5,
              color: Colors.grey.shade800,
            ),
          ),
          if (actionLabel != null && onPressed != null) ...[
            const SizedBox(height: 14),
            FilledButton.icon(
              onPressed: onPressed,
              icon: const Icon(Icons.open_in_new),
              label: Text(actionLabel!),
            ),
          ],
        ],
      ),
    );
  }
}
