import 'package:flutter/material.dart';

bool isRosterMemberComplete(bool? presence, String? verdict) =>
    presence != null && (presence == false || verdict != null);

int applyVerdictToUnevaluated(
  Map<String, String?> verdicts,
  String verdict, {
  Map<String, bool?>? presence,
}) {
  var changed = 0;
  for (final memberId in verdicts.keys) {
    if (verdicts[memberId] == null && presence?[memberId] != false) {
      verdicts[memberId] = verdict;
      changed++;
    }
  }
  return changed;
}

class MonitorObservationRosterMemberCard extends StatelessWidget {
  final String memberId;
  final String name;
  final String level;
  final String? photoUrl;
  final int taskCount;
  final String activityLabel;
  final String attendanceLabel;
  final bool? isPresent;
  final bool? selectedPresence;
  final ValueChanged<bool> onPresenceChanged;
  final String? selectedVerdict;
  final ValueChanged<String?> onVerdictChanged;
  final bool hasComment;
  final VoidCallback onComment;

  const MonitorObservationRosterMemberCard({
    super.key,
    required this.memberId,
    required this.name,
    required this.level,
    this.photoUrl,
    required this.taskCount,
    required this.activityLabel,
    required this.attendanceLabel,
    required this.isPresent,
    required this.selectedPresence,
    required this.onPresenceChanged,
    required this.selectedVerdict,
    required this.onVerdictChanged,
    required this.hasComment,
    required this.onComment,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
      child: Column(
        children: [
          Row(
            children: [
              CircleAvatar(
                radius: 20,
                foregroundImage:
                    photoUrl == null ? null : NetworkImage(photoUrl!),
                child: photoUrl == null ? Text(_initials(name)) : null,
              ),
              const SizedBox(width: 9),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Flexible(
                          child: Text(
                            name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontWeight: FontWeight.w800,
                              fontSize: 14,
                            ),
                          ),
                        ),
                        if (taskCount > 1) ...[
                          const SizedBox(width: 5),
                          Tooltip(
                            message: '$taskCount anciennes tâches regroupées',
                            child: const Icon(
                              Icons.layers_outlined,
                              size: 16,
                              color: Colors.orange,
                            ),
                          ),
                        ],
                      ],
                    ),
                    Text(
                      '$level · $activityLabel',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        color: Colors.grey.shade600,
                        fontSize: 11.5,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 6),
              _attendanceControl(),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: Row(
                  children: [
                    _verdictButton(
                      context,
                      value: 'acquis',
                      shortLabel: 'A',
                      semanticsLabel: 'Acquis',
                      color: const Color(0xFF16A34A),
                    ),
                    const SizedBox(width: 6),
                    _verdictButton(
                      context,
                      value: 'en_progres',
                      shortLabel: 'P',
                      semanticsLabel: 'En progrès',
                      color: const Color(0xFFF59E0B),
                    ),
                    const SizedBox(width: 6),
                    _verdictButton(
                      context,
                      value: 'a_revoir',
                      shortLabel: 'R',
                      semanticsLabel: 'À revoir',
                      color: const Color(0xFFE5484D),
                    ),
                  ],
                ),
              ),
              IconButton(
                key: ValueKey('comment-$memberId'),
                tooltip: hasComment
                    ? 'Modifier le commentaire de $name'
                    : 'Ajouter un commentaire pour $name',
                onPressed: onComment,
                icon: Icon(
                  hasComment ? Icons.chat_bubble : Icons.add_comment_outlined,
                  color: hasComment
                      ? Theme.of(context).colorScheme.primary
                      : Colors.grey.shade600,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _attendanceControl() {
    Widget choice(bool present, String label, Color color) {
      final selected = selectedPresence == present;
      return Semantics(
        button: true,
        selected: selected,
        label: '$label pour $name',
        child: InkWell(
          key: ValueKey(
            'attendance-$memberId-${present ? 'present' : 'absent'}',
          ),
          onTap: () => onPresenceChanged(present),
          borderRadius: BorderRadius.circular(9),
          child: Container(
            constraints: const BoxConstraints(minHeight: 36),
            padding: const EdgeInsets.symmetric(horizontal: 7),
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: selected ? color : Colors.transparent,
              borderRadius: BorderRadius.circular(9),
              border: Border.all(color: selected ? color : Colors.grey),
            ),
            child: Text(
              present ? 'Prés.' : 'Abs.',
              style: TextStyle(
                color: selected ? Colors.white : color,
                fontSize: 10.5,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
        ),
      );
    }

    return Tooltip(
      message: 'Déclaré : $attendanceLabel · correction possible',
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          choice(true, 'Présent', const Color(0xFF15803D)),
          const SizedBox(width: 3),
          choice(false, 'Absent', const Color(0xFFB91C1C)),
        ],
      ),
    );
  }

  Widget _verdictButton(
    BuildContext context, {
    required String value,
    required String shortLabel,
    required String semanticsLabel,
    required Color color,
  }) {
    final selected = selectedVerdict == value;
    final enabled = selectedPresence != false;
    return Semantics(
      button: true,
      selected: selected,
      label: '$semanticsLabel pour $name',
      child: Tooltip(
        message: semanticsLabel,
        child: InkWell(
          key: ValueKey('verdict-$memberId-$value'),
          borderRadius: BorderRadius.circular(9),
          onTap:
              enabled ? () => onVerdictChanged(selected ? null : value) : null,
          child: Container(
            constraints: const BoxConstraints(minWidth: 44, minHeight: 44),
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: selected ? color : Colors.transparent,
              borderRadius: BorderRadius.circular(9),
              border: Border.all(
                color: selected
                    ? color
                    : enabled
                        ? Colors.grey.shade400
                        : Colors.grey.shade300,
              ),
            ),
            child: Text(
              shortLabel,
              style: TextStyle(
                color: selected
                    ? Colors.white
                    : enabled
                        ? color
                        : Colors.grey,
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
        ),
      ),
    );
  }

  String _initials(String value) {
    final parts = value
        .split(RegExp(r'\s+'))
        .where((part) => part.isNotEmpty && !part.startsWith('·'))
        .take(2);
    final result = parts.map((part) => part[0].toUpperCase()).join();
    return result.isEmpty ? '?' : result;
  }
}

class RosterCommentDialog extends StatelessWidget {
  final String memberName;
  final TextEditingController controller;

  const RosterCommentDialog({
    super.key,
    required this.memberName,
    required this.controller,
  });

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text('Commentaire · $memberName'),
      content: TextField(
        key: const ValueKey('roster-comment-field'),
        controller: controller,
        autofocus: true,
        minLines: 3,
        maxLines: 5,
        decoration: const InputDecoration(
          hintText: 'Points forts, conseils, axe de progression…',
          labelText: 'Commentaire pédagogique (optionnel)',
          border: OutlineInputBorder(),
        ),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context, false),
          child: const Text('Annuler'),
        ),
        FilledButton(
          key: const ValueKey('save-roster-comment'),
          onPressed: () => Navigator.pop(context, true),
          child: const Text('Enregistrer'),
        ),
      ],
    );
  }
}
