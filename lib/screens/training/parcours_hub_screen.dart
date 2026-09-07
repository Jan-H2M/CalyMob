import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../config/app_colors.dart';
import '../../config/firebase_config.dart';
import '../../models/formation_task.dart';
import '../../providers/member_provider.dart';
import '../../services/formation_task_service.dart';
import '../../widgets/ocean/ocean_gradient_background.dart';
import '../communication/communication_hub_screen.dart';
import '../exercises/member_exercises_screen.dart';
import 'logbook_dive_confirmation_screen.dart';
import 'historical_claims_screen.dart';
import 'mon_carnet_screen.dart';
import '../formation/my_declarations_screen.dart';
import 'stats_screen.dart';

const _parcoursSecondaryText = Color(0xFF5F6B7A);

@visibleForTesting
class ParcoursHubEntryDefinition {
  const ParcoursHubEntryDefinition({
    required this.key,
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.color,
    this.badge = false,
  });

  final String key;
  final String title;
  final String subtitle;
  final IconData icon;
  final Color color;
  final bool badge;
}

@visibleForTesting
const parcoursHubEntryDefinitions = <ParcoursHubEntryDefinition>[
  ParcoursHubEntryDefinition(
    key: 'carnet',
    title: 'Mon carnet',
    subtitle: 'Consulter vos plongées et ajouter une nouvelle entrée.',
    icon: Icons.menu_book_outlined,
    color: AppColors.middenblauw,
  ),
  ParcoursHubEntryDefinition(
    key: 'confirmations',
    title: 'Plongées à confirmer',
    subtitle: 'Valider les plongées qui attendent votre confirmation.',
    icon: Icons.verified_outlined,
    color: Colors.teal,
    badge: true,
  ),
  ParcoursHubEntryDefinition(
    key: 'exercises',
    title: 'Mes exercices',
    subtitle: 'Suivre vos exercices, rôles et validations de formation.',
    icon: Icons.checklist_rtl_outlined,
    color: AppColors.oranje,
  ),
  ParcoursHubEntryDefinition(
    key: 'declarations',
    title: 'Mes demandes',
    subtitle: 'Retrouver vos demandes de rôles et d’évaluation.',
    icon: Icons.assignment_outlined,
    color: Colors.purple,
  ),
  ParcoursHubEntryDefinition(
    key: 'actions',
    title: 'Actions & évaluations',
    subtitle: 'Répondre aux tâches, décisions et validations en attente.',
    icon: Icons.task_alt_outlined,
    color: AppColors.success,
    badge: true,
  ),
  ParcoursHubEntryDefinition(
    key: 'stats',
    title: 'Statistiques',
    subtitle: 'Visualiser l’évolution de vos plongées et paramètres.',
    icon: Icons.insights_outlined,
    color: AppColors.info,
  ),
  ParcoursHubEntryDefinition(
    key: 'paper-card',
    title: 'Reprendre ma carte papier',
    subtitle: 'Encoder votre historique papier dans le carnet numérique.',
    icon: Icons.drive_file_rename_outline,
    color: AppColors.warning,
  ),
];

class ParcoursHubScreen extends StatelessWidget {
  const ParcoursHubScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final userId = FirebaseAuth.instance.currentUser?.uid;

    return Scaffold(
      backgroundColor: AppColors.donkerblauw,
      body: OceanGradientBackground(
        child: SafeArea(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _Header(onBack: () => Navigator.of(context).pop()),
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(24, 8, 24, 32),
                  children: [
                    const _IntroCard(),
                    const SizedBox(height: 24),
                    const _SectionTitle('Carnet & suivi'),
                    const SizedBox(height: 12),
                    _ParcoursCard(
                      definition: parcoursHubEntryDefinitions[0],
                      onTap: () =>
                          _open(context, parcoursHubEntryDefinitions[0]),
                    ),
                    _ParcoursCard(
                      definition: parcoursHubEntryDefinitions[1],
                      countStream: userId == null
                          ? null
                          : _pendingConfirmationsCountStream(userId),
                      onTap: () =>
                          _open(context, parcoursHubEntryDefinitions[1]),
                    ),
                    const SizedBox(height: 12),
                    const _SectionTitle('Formation'),
                    const SizedBox(height: 12),
                    _ParcoursCard(
                      definition: parcoursHubEntryDefinitions[2],
                      onTap: () =>
                          _open(context, parcoursHubEntryDefinitions[2]),
                    ),
                    _ParcoursCard(
                      definition: parcoursHubEntryDefinitions[3],
                      onTap: () =>
                          _open(context, parcoursHubEntryDefinitions[3]),
                    ),
                    _ParcoursCard(
                      definition: parcoursHubEntryDefinitions[4],
                      countStream: userId == null
                          ? null
                          : _openActionCountStream(userId),
                      onTap: () =>
                          _open(context, parcoursHubEntryDefinitions[4]),
                    ),
                    const SizedBox(height: 12),
                    const _SectionTitle('Historique'),
                    const SizedBox(height: 12),
                    _ParcoursCard(
                      definition: parcoursHubEntryDefinitions[5],
                      onTap: () =>
                          _open(context, parcoursHubEntryDefinitions[5]),
                    ),
                    _ParcoursCard(
                      definition: parcoursHubEntryDefinitions[6],
                      onTap: () =>
                          _open(context, parcoursHubEntryDefinitions[6]),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Stream<int> _pendingConfirmationsCountStream(String userId) {
    return FirebaseFirestore.instance
        .collection('clubs')
        .doc(FirebaseConfig.defaultClubId)
        .collection('logbook_dive_confirmations')
        .where('target_member_id', isEqualTo: userId)
        .where('status', isEqualTo: 'pending')
        .snapshots()
        .map((snapshot) => snapshot.docs.length);
  }

  Stream<int> _openActionCountStream(String userId) {
    return FormationTaskService()
        .streamUserInbox(FirebaseConfig.defaultClubId, userId)
        .map(
          (tasks) => tasks.where((task) {
            final isClosed = task.status == FormationTaskStatus.done ||
                task.status == FormationTaskStatus.dismissed ||
                task.status == FormationTaskStatus.expired;
            return !isClosed;
          }).length,
        );
  }

  void _open(BuildContext context, ParcoursHubEntryDefinition definition) {
    final navigator = Navigator.of(context);
    switch (definition.key) {
      case 'carnet':
        navigator.push(
          MaterialPageRoute(builder: (_) => const MonCarnetScreen()),
        );
        return;
      case 'confirmations':
        navigator.push(
          MaterialPageRoute(
            builder: (_) => const LogbookDiveConfirmationsInboxScreen(),
          ),
        );
        return;
      case 'exercises':
        navigator.push(
          MaterialPageRoute(
            builder: (_) => MemberExercisesScreen(
              memberId: FirebaseAuth.instance.currentUser?.uid ?? '',
              memberName: _memberNameForExercises(context),
              isOwnProfile: true,
            ),
          ),
        );
        return;
      case 'declarations':
        navigator.push(
          MaterialPageRoute(builder: (_) => const MyDeclarationsScreen()),
        );
        return;
      case 'actions':
        navigator.push(
          MaterialPageRoute(
            builder: (_) =>
                const CommunicationHubScreen(initialActionsOnly: true),
          ),
        );
        return;
      case 'stats':
        navigator.push(MaterialPageRoute(builder: (_) => const StatsScreen()));
        return;
      case 'paper-card':
        navigator.push(
          MaterialPageRoute(builder: (_) => const HistoricalClaimsScreen()),
        );
        return;
    }
  }

  String _memberNameForExercises(BuildContext context) {
    try {
      final memberProvider = context.read<MemberProvider>();
      final providerName = ('${memberProvider.prenom ?? ''} '
              '${memberProvider.nom ?? ''}')
          .trim();
      if (providerName.isNotEmpty) return providerName;
    } catch (_) {
      // Provider can be unavailable in isolated tests; fallback keeps navigation safe.
    }
    final displayName = FirebaseAuth.instance.currentUser?.displayName?.trim();
    return (displayName == null || displayName.isEmpty) ? 'Moi' : displayName;
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.onBack});

  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 8, 24, 16),
      child: Row(
        children: [
          IconButton(
            icon: const Icon(Icons.arrow_back, color: Colors.white),
            onPressed: onBack,
          ),
          const SizedBox(width: 8),
          const Expanded(
            child: Text(
              'Parcours',
              style: TextStyle(
                color: Colors.white,
                fontSize: 28,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _IntroCard extends StatelessWidget {
  const _IntroCard();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.94),
        borderRadius: BorderRadius.circular(24),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.10),
            blurRadius: 20,
            offset: const Offset(0, 10),
          ),
        ],
      ),
      child: const Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Tout votre parcours de plongée au même endroit',
            style: TextStyle(
              color: AppColors.donkerblauw,
              fontSize: 20,
              fontWeight: FontWeight.w700,
              height: 1.2,
            ),
          ),
          SizedBox(height: 10),
          Text(
            'Carnet, confirmations, exercices, demandes et statistiques sont regroupés ici pour éviter de chercher dans plusieurs écrans.',
            style: TextStyle(
              color: _parcoursSecondaryText,
              fontSize: 15,
              height: 1.35,
            ),
          ),
        ],
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.label);

  final String label;

  @override
  Widget build(BuildContext context) {
    return Text(
      label,
      style: const TextStyle(
        color: Colors.white,
        fontSize: 16,
        fontWeight: FontWeight.w700,
      ),
    );
  }
}

class _ParcoursCard extends StatelessWidget {
  const _ParcoursCard({
    required this.definition,
    required this.onTap,
    this.countStream,
  });

  final ParcoursHubEntryDefinition definition;
  final VoidCallback onTap;
  final Stream<int>? countStream;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Material(
        color: Colors.white.withValues(alpha: 0.94),
        borderRadius: BorderRadius.circular(18),
        child: InkWell(
          borderRadius: BorderRadius.circular(18),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                Container(
                  width: 52,
                  height: 52,
                  decoration: BoxDecoration(
                    color: definition.color.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(16),
                  ),
                  child: Icon(
                    definition.icon,
                    color: definition.color,
                    size: 28,
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        definition.title,
                        style: const TextStyle(
                          color: AppColors.donkerblauw,
                          fontSize: 17,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      const SizedBox(height: 5),
                      Text(
                        definition.subtitle,
                        style: const TextStyle(
                          color: _parcoursSecondaryText,
                          fontSize: 13.5,
                          height: 1.28,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 10),
                if (countStream != null) _Badge(stream: countStream!),
                const SizedBox(width: 8),
                const Icon(Icons.chevron_right, color: _parcoursSecondaryText),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Badge extends StatelessWidget {
  const _Badge({required this.stream});

  final Stream<int> stream;

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<int>(
      stream: stream,
      builder: (context, snapshot) {
        final count = snapshot.data ?? 0;
        if (count <= 0) return const SizedBox.shrink();
        return Container(
          constraints: const BoxConstraints(minWidth: 30),
          padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 6),
          decoration: BoxDecoration(
            color: AppColors.warning.withValues(alpha: 0.20),
            borderRadius: BorderRadius.circular(99),
          ),
          child: Text(
            count > 99 ? '99+' : '$count',
            textAlign: TextAlign.center,
            style: const TextStyle(
              color: AppColors.donkerblauw,
              fontSize: 13,
              fontWeight: FontWeight.w800,
            ),
          ),
        );
      },
    );
  }
}
