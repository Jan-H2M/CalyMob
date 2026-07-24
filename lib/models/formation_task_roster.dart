import 'formation_task.dart';

/// Presentation-level roster built from legacy per-member observation tasks.
///
/// No Firestore data is rewritten: tasks are grouped deterministically by
/// session, group and validator. Duplicate documents for the same member are
/// kept in [FormationTaskRosterMember.tasks] and completed together.
class FormationTaskRoster {
  final String key;
  final String sessionId;
  final String groupKey;
  final String validatorId;
  final String? level;
  final String? theme;
  final List<FormationTaskRosterMember> members;

  const FormationTaskRoster({
    required this.key,
    required this.sessionId,
    required this.groupKey,
    required this.validatorId,
    this.level,
    this.theme,
    required this.members,
  });

  int get taskCount =>
      members.fold(0, (total, member) => total + member.tasks.length);

  static List<FormationTaskRoster> aggregate(
    Iterable<FormationTask> tasks,
  ) {
    final grouped = <String, List<FormationTask>>{};
    for (final task in tasks.where(
      (task) => task.type == FormationTaskType.monitorObservation,
    )) {
      final sessionId = task.context.poolSessionId?.trim() ?? '';
      final groupKey = task.context.groupKey?.trim() ?? '';
      final validatorId = task.currentAssigneeId.trim();
      final hasStableContext =
          sessionId.isNotEmpty && groupKey.isNotEmpty && validatorId.isNotEmpty;
      final key = hasStableContext
          ? '$sessionId::$groupKey::$validatorId'
          : 'legacy::${task.id}';
      grouped.putIfAbsent(key, () => []).add(task);
    }

    return grouped.entries.map((entry) {
      final rosterTasks = entry.value..sort((a, b) => a.id.compareTo(b.id));
      final first = rosterTasks.first;
      final byMember = <String, List<FormationTask>>{};
      for (final task in rosterTasks) {
        final memberKey =
            task.memberId.trim().isEmpty ? 'task:${task.id}' : task.memberId;
        byMember.putIfAbsent(memberKey, () => []).add(task);
      }
      final members = byMember.entries
          .map(
            (member) => FormationTaskRosterMember(
              memberId: member.key.startsWith('task:') ? '' : member.key,
              tasks: member.value,
            ),
          )
          .toList()
        ..sort((a, b) => a.displayName.compareTo(b.displayName));
      return FormationTaskRoster(
        key: entry.key,
        sessionId: first.context.poolSessionId ?? '',
        groupKey: first.context.groupKey ?? '',
        validatorId: first.currentAssigneeId,
        level: _firstValue(rosterTasks.map((task) => task.context.level)),
        theme:
            _firstValue(rosterTasks.map((task) => task.effectiveThemeSnapshot)),
        members: members,
      );
    }).toList()
      ..sort((a, b) => b.sessionId.compareTo(a.sessionId));
  }

  static String? _firstValue(Iterable<String?> values) {
    for (final value in values) {
      if (value != null && value.trim().isNotEmpty) return value.trim();
    }
    return null;
  }
}

class FormationTaskRosterMember {
  final String memberId;
  final List<FormationTask> tasks;

  const FormationTaskRosterMember({
    required this.memberId,
    required this.tasks,
  });

  FormationTask get primaryTask => tasks.first;

  String get displayName {
    for (final task in tasks) {
      final value = task.memberName?.trim();
      if (value != null && value.isNotEmpty && value != 'Membre') return value;
    }
    return memberId.isEmpty ? 'Nom manquant' : 'Nom manquant · $memberId';
  }
}
