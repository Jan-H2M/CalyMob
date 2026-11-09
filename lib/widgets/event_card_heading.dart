import 'package:flutter/material.dart';
import '../config/app_colors.dart';
import '../models/event_card_appearance.dart';
import 'event_card_decoration.dart';

/// Keep event names readable on a phone: artwork has its own compact row.
class EventCardHeading extends StatelessWidget {
  final String title;
  final IconData icon;
  final Color iconColor;
  final EventCardAppearance? appearance;

  const EventCardHeading({
    super.key,
    required this.title,
    required this.icon,
    required this.iconColor,
    this.appearance,
  });

  @override
  Widget build(BuildContext context) {
    final decorated = appearance?.hasArtwork == true;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Icon(icon, size: 18, color: iconColor),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                title,
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                  color: AppColors.donkerblauw,
                ),
                // A themed event name must not compete with its illustration.
                maxLines: decorated ? null : 2,
                overflow:
                    decorated ? TextOverflow.visible : TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
        if (decorated)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Align(
              alignment: Alignment.centerRight,
              child: SizedBox(
                width: 64,
                height: 64,
                child: FittedBox(
                  child: EventCardDecoration(appearance: appearance!),
                ),
              ),
            ),
          ),
      ],
    );
  }
}
