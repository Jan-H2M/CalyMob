/// Dev-only scenario gallery for the Carnet de Formation fiches.
///
/// Lets you open every variant of the pool check-in (and later the other
/// fiches) with synthetic data, so each case can be validated without waiting
/// for a real event or being in the right role.
///
/// See `CARNET_SCENARIOS_CATALOGUE.md` for the full list of scenarios.
/// Scenario ids (P1…) match that document.

import 'package:flutter/material.dart';

import '../../config/app_colors.dart';
import '../../models/formation_task.dart';
import 'palanquee_validation_screen.dart';
import 'pool_checkin_screen.dart';
import 'pool_group_roster_screen.dart';

class CarnetPreviewGalleryScreen extends StatelessWidget {
  const CarnetPreviewGalleryScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final scenarios = _poolScenarios();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Aperçu Carnet (dev)'),
        backgroundColor: AppColors.donkerblauw,
        foregroundColor: Colors.white,
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
        children: [
          Text(
            'Tape un scénario pour ouvrir la vraie fiche avec des données '
            'fictives. Rien n\'est écrit dans Firestore — à la validation, '
            'la fiche affiche le completion_data qui serait enregistré.',
            style: TextStyle(color: Colors.grey.shade700, fontSize: 13),
          ),
          const SizedBox(height: 16),
          const _SectionHeader('Séance piscine'),
          for (final s in scenarios) ...[
            _ScenarioCard(scenario: s),
            const SizedBox(height: 10),
          ],
          const _PoolRosterCard(),
          const SizedBox(height: 8),
          const _SectionHeader('Sortie'),
          const _SortieCard(),
        ],
      ),
    );
  }

  // ---- Scenario catalogue (pool) -----------------------------------------

  List<_Scenario> _poolScenarios() {
    FormationTask poolTask({
      required String title,
      required FormationTaskContext context,
      FormationTaskAssigneeType assignee = FormationTaskAssigneeType.student,
    }) {
      return FormationTask(
        id: 'preview-${DateTime.now().microsecondsSinceEpoch}',
        type: FormationTaskType.poolCheckin,
        title: title,
        status: FormationTaskStatus.open,
        memberId: 'preview-member',
        memberName: 'Jan Andriessens',
        currentAssigneeId: 'preview-member',
        currentAssigneeType: assignee,
        context: context,
      );
    }

    return [
      _Scenario(
        code: 'P1',
        label: 'Élève — formation suggérée 2★',
        description: 'Choix Formation / Service / Nage libre, groupe 2★ suggéré.',
        icon: Icons.school_outlined,
        build: () => poolTask(
          title: 'Piscine à compléter — Formation 2★',
          context: const FormationTaskContext(
            poolSessionId: '2026-06-16',
            attendeeId: 'att-preview',
            targetGroupLevel: 'Formation 2★',
          ),
        ),
      ),
      _Scenario(
        code: 'P2',
        label: 'Encadrant — 1 groupe',
        description: '2★ · Groupe 1 — répétition brevet 2★.',
        icon: Icons.workspace_premium_outlined,
        build: () => poolTask(
          title: 'Piscine encadrant à compléter',
          assignee: FormationTaskAssigneeType.monitor,
          context: const FormationTaskContext(
            poolSessionId: '2026-06-16',
            attendeeId: 'att-preview',
            role: 'encadrant',
            encadrantGroups: [
              FormationTaskEncadrantGroup(
                level: '2★',
                groupNumber: 1,
                theme: 'répétition brevet 2★',
                courseId: '2star_2eme_heure_0',
                heure: '2eme_heure',
              ),
            ],
          ),
        ),
      ),
      _Scenario(
        code: 'P3',
        label: 'Encadrant — plusieurs groupes',
        description: 'Deux cours encadrés le même soir, à confirmer.',
        icon: Icons.groups_outlined,
        build: () => poolTask(
          title: 'Piscine encadrant à compléter',
          assignee: FormationTaskAssigneeType.monitor,
          context: const FormationTaskContext(
            poolSessionId: '2026-06-16',
            attendeeId: 'att-preview',
            role: 'encadrant',
            encadrantGroups: [
              FormationTaskEncadrantGroup(
                level: '1★',
                groupNumber: 1,
                theme: 'les débutants',
                heure: '1ere_heure',
              ),
              FormationTaskEncadrantGroup(
                level: '2★',
                groupNumber: 2,
                theme: 'masques occultés',
                heure: '2eme_heure',
              ),
            ],
          ),
        ),
      ),
      _Scenario(
        code: 'P5',
        label: 'Encadrant — service puis cours (v4)',
        description:
            '1ère heure libre (service/accueil), 2ème heure cours 2★ — '
            'illustre la fiche par heure.',
        icon: Icons.schedule_outlined,
        build: () => poolTask(
          title: 'Piscine encadrant à compléter',
          assignee: FormationTaskAssigneeType.monitor,
          context: const FormationTaskContext(
            poolSessionId: '2026-06-16',
            attendeeId: 'att-preview',
            role: 'encadrant',
            encadrantGroups: [
              FormationTaskEncadrantGroup(
                level: '2★',
                groupNumber: 1,
                theme: 'vidage de masque',
                heure: '2eme_heure',
              ),
            ],
          ),
        ),
      ),
      _Scenario(
        code: 'P4',
        label: 'Encadrant — aucun groupe retrouvé',
        description: 'Edge case : role encadrant mais planning vide.',
        icon: Icons.help_outline,
        build: () => poolTask(
          title: 'Piscine encadrant à compléter',
          assignee: FormationTaskAssigneeType.monitor,
          context: const FormationTaskContext(
            poolSessionId: '2026-06-16',
            attendeeId: 'att-preview',
            role: 'encadrant',
            encadrantGroups: [],
          ),
        ),
      ),
    ];
  }
}

class _Scenario {
  final String code;
  final String label;
  final String description;
  final IconData icon;
  final FormationTask Function() build;

  const _Scenario({
    required this.code,
    required this.label,
    required this.description,
    required this.icon,
    required this.build,
  });
}

class _ScenarioCard extends StatelessWidget {
  final _Scenario scenario;
  const _ScenarioCard({required this.scenario});

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 1,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
        leading: CircleAvatar(
          backgroundColor: AppColors.middenblauw.withValues(alpha: 0.15),
          child: Icon(scenario.icon, color: AppColors.middenblauw),
        ),
        title: Text(
          '${scenario.code} · ${scenario.label}',
          style: const TextStyle(fontWeight: FontWeight.w600),
        ),
        subtitle: Text(scenario.description),
        trailing: const Icon(Icons.chevron_right),
        onTap: () {
          Navigator.of(context).push(
            MaterialPageRoute(
              builder: (_) => PoolCheckinScreen(
                task: scenario.build(),
                previewMode: true,
              ),
            ),
          );
        },
      ),
    );
  }
}

class _PoolRosterCard extends StatelessWidget {
  const _PoolRosterCard();

  List<PoolRosterStudent> _mockStudents() {
    return [
      PoolRosterStudent(memberId: 'r-sophie', name: 'Sophie Dubois'),
      PoolRosterStudent(memberId: 'r-marc', name: 'Marc Lambert'),
      PoolRosterStudent(memberId: 'r-lea', name: 'Léa Renard'),
      PoolRosterStudent(memberId: 'r-tom', name: 'Tom Janssen'),
      PoolRosterStudent(memberId: 'r-nora', name: 'Nora Peeters'),
    ];
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 1,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
        leading: CircleAvatar(
          backgroundColor: AppColors.middenblauw.withValues(alpha: 0.15),
          child: const Icon(Icons.groups_outlined, color: AppColors.middenblauw),
        ),
        title: const Text(
          'P9 · Validation groupe (roster)',
          style: TextStyle(fontWeight: FontWeight.w600),
        ),
        subtitle: const Text(
          'Présence + verdict A/P/R + commentaire, en une passe.',
        ),
        trailing: const Icon(Icons.chevron_right),
        onTap: () {
          Navigator.of(context).push(
            MaterialPageRoute(
              builder: (_) => PoolGroupRosterScreen(
                groupTitle: '2★ · répétition brevet 2★',
                students: _mockStudents(),
                previewMode: true,
              ),
            ),
          );
        },
      ),
    );
  }
}

class _SortieCard extends StatelessWidget {
  const _SortieCard();

  List<PalanqueeValidationDiver> _mockDivers() {
    return [
      PalanqueeValidationDiver(
        memberId: 'preview-sophie',
        name: 'Sophie Dubois',
        exercises: [
          DeclaredExercise(code: 'P2.RA', label: 'Remontée assistée'),
          DeclaredExercise(code: 'P2.VM', label: 'Vidage de masque'),
        ],
      ),
      PalanqueeValidationDiver(
        memberId: 'preview-marc',
        name: 'Marc Lambert',
        exercises: [
          DeclaredExercise(code: 'P2.LR', label: 'Lâcher-reprise embout'),
        ],
      ),
      PalanqueeValidationDiver(
        memberId: 'preview-lea',
        name: 'Léa Renard',
        exercises: [
          DeclaredExercise(code: 'P2.RA', label: 'Remontée assistée'),
          DeclaredExercise(code: 'P2.VM', label: 'Vidage de masque'),
          DeclaredExercise(code: 'P2.LR', label: 'Lâcher-reprise embout'),
        ],
      ),
    ];
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 1,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
        leading: CircleAvatar(
          backgroundColor: AppColors.middenblauw.withValues(alpha: 0.15),
          child: const Icon(Icons.groups_2_outlined, color: AppColors.middenblauw),
        ),
        title: const Text(
          'S1 · Validation palanquée (grid)',
          style: TextStyle(fontWeight: FontWeight.w600),
        ),
        subtitle: const Text(
          'Par plongeur, ses exercices déclarés + verdict A/P/R.',
        ),
        trailing: const Icon(Icons.chevron_right),
        onTap: () {
          Navigator.of(context).push(
            MaterialPageRoute(
              builder: (_) => PalanqueeValidationScreen(
                palanqueeTitle: 'Palanquée 2 · Rochefontaine',
                divers: _mockDivers(),
                previewMode: true,
              ),
            ),
          );
        },
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  final String text;
  const _SectionHeader(this.text);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Text(
        text.toUpperCase(),
        style: TextStyle(
          color: Colors.grey.shade600,
          fontSize: 12,
          fontWeight: FontWeight.bold,
          letterSpacing: 1.2,
        ),
      ),
    );
  }
}
