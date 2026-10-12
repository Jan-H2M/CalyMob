import 'package:flutter/material.dart';
import 'package:cached_network_image/cached_network_image.dart';
import '../../models/member_profile.dart';

class FormationStudentAvatar extends StatelessWidget {
  final MemberProfile member;
  final double size;
  const FormationStudentAvatar(
      {super.key, required this.member, this.size = 30});
  Widget _initials() => Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
          shape: BoxShape.circle, color: Colors.white.withValues(alpha: 0.2)),
      alignment: Alignment.center,
      child: Text(
          '${member.prenom.isNotEmpty ? member.prenom[0] : ''}${member.nom.isNotEmpty ? member.nom[0] : ''}'
              .toUpperCase(),
          style: TextStyle(
              color: Colors.white,
              fontSize: size * 0.36,
              fontWeight: FontWeight.bold)));
  @override
  Widget build(BuildContext context) =>
      member.hasPhoto && member.consentInternalPhoto
          ? ClipOval(
              child: CachedNetworkImage(
                  imageUrl: member.photoUrl!,
                  width: size,
                  height: size,
                  fit: BoxFit.cover,
                  errorWidget: (_, __, ___) => _initials()))
          : _initials();
}

/// Identical placement, typography and read-only state in each track.
class FormationGoalSelector extends StatelessWidget {
  final String? value;
  final Map<String, String> levels;
  final bool canEdit;
  final bool busy;
  final ValueChanged<String> onChanged;
  const FormationGoalSelector(
      {super.key,
      required this.value,
      required this.levels,
      required this.onChanged,
      this.canEdit = false,
      this.busy = false});
  @override
  Widget build(BuildContext context) {
    const style = TextStyle(color: Colors.white70, fontSize: 11);
    if (!canEdit) return Text(levels[value] ?? '—', style: style);
    return DropdownButtonHideUnderline(
        child: DropdownButton<String>(
      isDense: true,
      isExpanded: true,
      value: value,
      hint: const Text('—', style: style),
      dropdownColor: const Color(0xFF173853),
      style: style,
      items: levels.entries
          .map((level) => DropdownMenuItem(
              value: level.key, child: Text(level.value, style: style)))
          .toList(),
      onChanged: busy
          ? null
          : (next) {
              if (next != null) onChanged(next);
            },
    ));
  }
}

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
