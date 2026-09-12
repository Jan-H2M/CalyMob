import 'package:flutter/material.dart';

/// Member-facing event withdrawal action.
///
/// The deadline remains a UI guard only; the callable keeps enforcing the
/// authoritative registration and permission checks.
class OperationUnregisterButton extends StatelessWidget {
  const OperationUnregisterButton({
    super.key,
    required this.deadlinePassed,
    required this.inscriptionId,
    required this.onPressed,
    required this.onMissingInscription,
  });

  final bool deadlinePassed;
  final String? inscriptionId;
  final ValueChanged<String> onPressed;
  final VoidCallback onMissingInscription;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 50,
      child: ElevatedButton.icon(
        onPressed: deadlinePassed
            ? null
            : () {
                final targetId = inscriptionId;
                if (targetId == null || targetId.trim().isEmpty) {
                  onMissingInscription();
                  return;
                }
                onPressed(targetId);
              },
        icon: const Icon(Icons.cancel, color: Colors.white),
        label: const FittedBox(
          fit: BoxFit.scaleDown,
          child: Text(
            'Annuler',
            style: TextStyle(fontSize: 16, color: Colors.white),
          ),
        ),
        style: ElevatedButton.styleFrom(
          backgroundColor: Colors.red,
          disabledBackgroundColor: Colors.grey.shade400,
          disabledForegroundColor: Colors.white70,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          elevation: 8,
          shadowColor: Colors.red.withValues(alpha: 0.5),
        ),
      ),
    );
  }
}
