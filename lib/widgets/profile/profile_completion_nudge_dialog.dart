import 'package:flutter/material.dart';

import '../../config/app_colors.dart';

class ProfileCompletionNudgeDialog extends StatelessWidget {
  final bool needsPhoto;
  final bool needsEmergencyContact;
  final VoidCallback onAddPhoto;
  final VoidCallback onAddEmergencyContact;
  final VoidCallback onRemindLater;

  const ProfileCompletionNudgeDialog({
    super.key,
    required this.needsPhoto,
    required this.needsEmergencyContact,
    required this.onAddPhoto,
    required this.onAddEmergencyContact,
    required this.onRemindLater,
  });

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      child: AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(18)),
        title: const Row(
          children: [
            Icon(Icons.health_and_safety, color: AppColors.middenblauw, size: 30),
            SizedBox(width: 12),
            Expanded(child: Text('Votre profil doit être complété')),
          ],
        ),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'Ces informations sont importantes pour vous reconnaître et vous aider rapidement pendant une activité.',
                style: TextStyle(fontSize: 15, height: 1.35),
              ),
              const SizedBox(height: 16),
              if (needsPhoto)
                _CompletionAction(
                  icon: Icons.add_a_photo_outlined,
                  title: 'Ajoutez une photo de profil',
                  subtitle: 'Votre visage aide les membres à vous reconnaître immédiatement.',
                  buttonLabel: 'Ajouter ma photo',
                  onPressed: onAddPhoto,
                ),
              if (needsPhoto && needsEmergencyContact)
                const SizedBox(height: 12),
              if (needsEmergencyContact)
                _CompletionAction(
                  icon: Icons.contact_emergency_outlined,
                  title: 'Ajoutez un contact d’urgence',
                  subtitle: 'Il sera visible uniquement par les encadrants et le CA.',
                  buttonLabel: 'Ajouter mon contact',
                  onPressed: onAddEmergencyContact,
                  urgent: true,
                ),
              const SizedBox(height: 12),
              const Text(
                'Vous pourrez modifier ces informations à tout moment dans Mes informations.',
                style: TextStyle(fontSize: 12, color: Colors.black54),
              ),
            ],
          ),
        ),
        actionsAlignment: MainAxisAlignment.center,
        actions: [
          TextButton(
            onPressed: onRemindLater,
            child: const Text('Me le rappeler dans 3 jours'),
          ),
        ],
      ),
    );
  }
}

class _CompletionAction extends StatelessWidget {
  final IconData icon;
  final String title;
  final String subtitle;
  final String buttonLabel;
  final VoidCallback onPressed;
  final bool urgent;

  const _CompletionAction({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.buttonLabel,
    required this.onPressed,
    this.urgent = false,
  });

  @override
  Widget build(BuildContext context) {
    final color = urgent ? Colors.red.shade700 : AppColors.middenblauw;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: urgent ? Colors.red.shade50 : AppColors.middenblauw.withValues(alpha: .07),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: color.withValues(alpha: .45)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(icon, color: color),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: const TextStyle(fontWeight: FontWeight.bold)),
                    const SizedBox(height: 3),
                    Text(subtitle, style: const TextStyle(fontSize: 12.5, height: 1.3)),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          ElevatedButton.icon(
            onPressed: onPressed,
            icon: Icon(icon, size: 18),
            label: Text(buttonLabel),
            style: ElevatedButton.styleFrom(
              backgroundColor: color,
              foregroundColor: Colors.white,
            ),
          ),
        ],
      ),
    );
  }
}
