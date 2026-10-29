import 'package:flutter/material.dart';
import '../models/operation.dart';
import '../utils/date_formatter.dart';

/// The same date/deadline presentation in the event header and isolated QA.
/// This widget is value-only: it never loads or changes an operation.
class OperationDateMetadata extends StatelessWidget {
  const OperationDateMetadata({super.key, required this.operation, this.now});
  final Operation operation;
  final DateTime? now;

  @override
  Widget build(BuildContext context) {
    final deadline = operation.effectiveDeadline;
    final deadlinePassed =
        deadline != null && (now ?? DateTime.now()).isAfter(deadline);
    return LayoutBuilder(
      builder: (context, constraints) {
        Widget metaItem({
          required IconData icon,
          required String text,
          required TextStyle style,
          Color iconColor = Colors.white70,
        }) =>
            ConstrainedBox(
              constraints: BoxConstraints(maxWidth: constraints.maxWidth),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(icon, size: 18, color: iconColor),
                  const SizedBox(width: 6),
                  Flexible(
                    child: Text(
                      text,
                      style: style,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
            );
        return Wrap(
          spacing: 18,
          runSpacing: 6,
          children: [
            if (operation.dateDebut != null)
              metaItem(
                icon: Icons.calendar_today,
                text:
                    '${DateFormatter.formatDayMonth(operation.dateDebut!)} ${DateFormatter.formatTime(operation.dateDebut!)}',
                style: const TextStyle(fontSize: 14, color: Colors.white),
              ),
            if (deadline != null)
              metaItem(
                icon: Icons.lock_clock,
                iconColor:
                    deadlinePassed ? Colors.orangeAccent : Colors.white70,
                text: deadlinePassed
                    ? 'Inscriptions closes'
                    : 'Clôture inscriptions : ${DateFormatter.formatDayMonthShort(deadline)} ${DateFormatter.formatTime(deadline)}',
                style: TextStyle(
                  fontSize: 13,
                  color: deadlinePassed ? Colors.orangeAccent : Colors.white,
                  fontWeight:
                      deadlinePassed ? FontWeight.w600 : FontWeight.normal,
                ),
              ),
          ],
        );
      },
    );
  }
}
