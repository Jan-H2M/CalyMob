import 'package:flutter/material.dart';

/// Shared birthday-privacy control for every user-editable profile entry point.
///
/// The backend treats only an explicit `false` as an opt-out. This widget
/// deliberately exposes the already-normalised model value and leaves saving
/// to the owning screen so its existing loading and error feedback stay intact.
class BirthdaySharingSwitch extends StatelessWidget {
  const BirthdaySharingSwitch({
    super.key,
    required this.value,
    required this.onChanged,
    this.contentPadding,
  });

  final bool value;
  final ValueChanged<bool>? onChanged;
  final EdgeInsetsGeometry? contentPadding;

  @override
  Widget build(BuildContext context) {
    return SwitchListTile(
      key: const Key('birthday-sharing-switch'),
      contentPadding: contentPadding,
      value: value,
      onChanged: onChanged,
      title: const Text('Partager mon anniversaire'),
      subtitle: const Text(
        'Seuls le jour et le mois sont visibles dans Who’s Who. '
        'Ce choix active aussi les vœux du club.',
      ),
      secondary: const Icon(Icons.cake_outlined, color: Colors.pink),
    );
  }
}
