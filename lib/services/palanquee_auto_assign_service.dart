import '../models/palanquee.dart';
import 'lifras_validation_service.dart';

/// Résultat de l'attribution automatique
class AutoAssignResult {
  final List<Palanquee> palanquees;
  final List<PalanqueeParticipant> unassigned;
  final List<String> warnings;

  const AutoAssignResult({
    required this.palanquees,
    required this.unassigned,
    required this.warnings,
  });
}

/// Service d'attribution automatique des palanquées selon les règles LIFRAS MIL 2026
///
/// Algorithme greedy:
/// 1. Trier les participants par niveau (du plus haut au plus bas)
/// 2. Constituer des palanquées en associant les niveaux compatibles
/// 3. Valider le résultat avec lifrasValidationService
class PalanqueeAutoAssignService {
  /// Retourne le rang hiérarchique d'un niveau
  static int _getLevelRank(String niveau) {
    final code = normalizeLevelCode(niveau);
    return niveauHierarchy[code] ?? -1;
  }

  /// Vérifie si deux participants peuvent plonger ensemble
  static bool _canDiveTogether(PalanqueeParticipant a, PalanqueeParticipant b) {
    final pair = getMaxDepthForPair(a.niveau, b.niveau);
    return pair.allowed;
  }

  /// Vérifie si un participant peut rejoindre une palanquée existante
  static bool _canJoinPalanquee(PalanqueeParticipant participant, List<PalanqueeParticipant> group) {
    return group.every((member) => _canDiveTogether(participant, member));
  }

  /// Attribue automatiquement les participants à des palanquées valides.
  static AutoAssignResult autoAssign(
    List<PalanqueeParticipant> participants, {
    String? lieuType,
  }) {
    final warnings = <String>[];

    if (participants.isEmpty) {
      return const AutoAssignResult(palanquees: [], unassigned: [], warnings: []);
    }

    if (participants.length == 1) {
      warnings.add('Un seul participant — impossible de former une palanquée.');
      return AutoAssignResult(palanquees: [], unassigned: [...participants], warnings: warnings);
    }

    // Déterminer la taille de groupe cible
    final isZelande = lieuType == 'Zélande';
    final maxGroupSize = isZelande ? 2 : 3;
    final totalCount = participants.length;

    // Trier par niveau décroissant (les encadrants en premier)
    final sorted = List<PalanqueeParticipant>.from(participants)
      ..sort((a, b) => _getLevelRank(b.niveau) - _getLevelRank(a.niveau));

    final used = <String>{};
    final groups = <List<PalanqueeParticipant>>[];

    // --- Phase 1: Séparer encadrants et autres ---
    final anchors = <PalanqueeParticipant>[];
    final others = <PalanqueeParticipant>[];

    for (final p in sorted) {
      final code = normalizeLevelCode(p.niveau);
      final rank = niveauHierarchy[code] ?? -1;
      if (rank >= 3) {
        anchors.add(p);
      } else {
        others.add(p);
      }
    }

    // Reverser "others" pour commencer par les plus faibles
    final reversedOthers = others.reversed.toList();

    // --- Phase 2: Former les groupes avec encadrants ---
    for (final anchor in anchors) {
      if (used.contains(anchor.membreId)) continue;

      final group = <PalanqueeParticipant>[anchor];
      used.add(anchor.membreId);

      // Chercher un buddy parmi les non-assignés (priorité: plus faible)
      for (final other in reversedOthers) {
        if (used.contains(other.membreId)) continue;
        if (group.length >= maxGroupSize) break;
        if (_canJoinPalanquee(other, group)) {
          group.add(other);
          used.add(other.membreId);
        }
      }

      // Si l'encadrant n'a pas de buddy, chercher parmi les autres encadrants
      if (group.length == 1) {
        for (final otherAnchor in anchors) {
          if (used.contains(otherAnchor.membreId)) continue;
          if (group.length >= maxGroupSize) break;
          if (_canDiveTogether(anchor, otherAnchor)) {
            group.add(otherAnchor);
            used.add(otherAnchor.membreId);
          }
        }
      }

      if (group.length >= 2) {
        groups.add(group);
      } else {
        // Remettre l'anchor dans le pool
        used.remove(anchor.membreId);
      }
    }

    // --- Phase 3: Former des groupes avec les restants ---
    final remaining = sorted.where((p) => !used.contains(p.membreId)).toList();

    for (int i = 0; i < remaining.length; i++) {
      if (used.contains(remaining[i].membreId)) continue;

      final group = <PalanqueeParticipant>[remaining[i]];
      used.add(remaining[i].membreId);

      for (int j = i + 1; j < remaining.length; j++) {
        if (used.contains(remaining[j].membreId)) continue;
        if (group.length >= maxGroupSize) break;
        if (_canJoinPalanquee(remaining[j], group)) {
          group.add(remaining[j]);
          used.add(remaining[j].membreId);
        }
      }

      if (group.length >= 2) {
        groups.add(group);
      } else {
        used.remove(remaining[i].membreId);
      }
    }

    // --- Phase 4: Zélande — si nombre impair, permettre UNE palanquée de 3 ---
    if (isZelande && totalCount % 2 != 0) {
      final stillUnassigned = sorted.where((p) => !used.contains(p.membreId)).toList();
      if (stillUnassigned.length == 1 && groups.isNotEmpty) {
        bool added = false;
        for (final group in groups) {
          if (group.length == 2 && _canJoinPalanquee(stillUnassigned[0], group)) {
            group.add(stillUnassigned[0]);
            used.add(stillUnassigned[0].membreId);
            added = true;
            warnings.add(
              'Nombre impair de plongeurs en Zélande: une palanquée de 3 a été créée (No Deco obligatoire).',
            );
            break;
          }
        }
        if (!added) {
          warnings.add(
            'Impossible d\'assigner ${stillUnassigned[0].membreNom} ${stillUnassigned[0].membrePrenom} — aucune palanquée compatible en Zélande.',
          );
        }
      }
    }

    // --- Phase 5: Collecter les non-assignés ---
    final unassigned = sorted.where((p) => !used.contains(p.membreId)).toList();
    if (unassigned.isNotEmpty) {
      final names = unassigned.map((p) => '${p.membreNom} ${p.membrePrenom} (${p.niveau})').join(', ');
      warnings.add('${unassigned.length} plongeur(s) non assignable(s) selon les règles: $names');
    }

    // --- Phase 6: Construire les palanquées numérotées ---
    final palanquees = <Palanquee>[];
    for (int idx = 0; idx < groups.length; idx++) {
      final group = groups[idx];
      palanquees.add(Palanquee(
        numero: idx + 1,
        participants: List.generate(
          group.length,
          (ordre) => group[ordre].copyWith(ordre: ordre),
        ),
      ));
    }

    // --- Phase 7: Valider le résultat ---
    final validationResults = validateAllPalanquees(palanquees, lieuType: lieuType);
    bool hasErrors = false;
    for (final entry in validationResults.entries) {
      if (!entry.value.valid) {
        hasErrors = true;
        for (final err in entry.value.errors) {
          warnings.add('Palanquée ${entry.key}: ${err.message}');
        }
      }
    }
    if (hasErrors) {
      warnings.add('Certaines palanquées ont des problèmes de composition. Vérifiez et ajustez manuellement.');
    }

    return AutoAssignResult(palanquees: palanquees, unassigned: unassigned, warnings: warnings);
  }
}
