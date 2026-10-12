import 'package:flutter/material.dart';

/// Compact entry to a full learner fiche, identical in both disciplines.
/// Detailed statistics and progress bars belong in that fiche, not the list.
class FormationStudentTile extends StatelessWidget {
  final String name;
  final String? subtitle;
  final Widget avatar;
  final Widget? goal;
  final bool active;
  final bool showEnrollment;
  final VoidCallback? onToggle;
  final VoidCallback? onTap;
  const FormationStudentTile(
      {super.key,
      required this.name,
      required this.avatar,
      this.subtitle,
      this.goal,
      this.active = false,
      this.showEnrollment = true,
      this.onToggle,
      this.onTap});
  @override
  Widget build(BuildContext context) => Card(
        color: const Color(0xCC173853),
        margin: const EdgeInsets.symmetric(vertical: 3),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        child: ListTile(
          dense: true,
          visualDensity: const VisualDensity(vertical: -1),
          minVerticalPadding: 6,
          contentPadding: const EdgeInsets.symmetric(horizontal: 8),
          leading: Row(mainAxisSize: MainAxisSize.min, children: [
            if (showEnrollment)
              IconButton(
                  tooltip: active
                      ? 'Retirer de la formation'
                      : 'Démarrer la formation',
                  padding: EdgeInsets.zero,
                  constraints:
                      const BoxConstraints.tightFor(width: 28, height: 32),
                  iconSize: 19,
                  icon: Icon(Icons.school,
                      color: active ? Colors.lightBlueAccent : Colors.white54),
                  onPressed: onToggle),
            avatar,
          ]),
          title: Text(name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(
                  color: Colors.white,
                  fontSize: 13,
                  fontWeight: FontWeight.w600)),
          subtitle: subtitle == null
              ? null
              : Text(subtitle!,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(color: Colors.white70, fontSize: 10)),
          trailing: Row(mainAxisSize: MainAxisSize.min, children: [
            if (goal != null) SizedBox(width: 48, child: goal),
            const Icon(Icons.chevron_right, color: Colors.white70, size: 20),
          ]),
          onTap: onTap,
        ),
      );
}
