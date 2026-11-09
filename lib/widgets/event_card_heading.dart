import 'package:flutter/material.dart';
import '../config/app_colors.dart';
import '../models/event_card_appearance.dart';
import 'event_card_decoration.dart';

/// Wrap the full themed title beside large artwork on the same horizontal band.
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
    final titleText = Text(
      title,
      style: const TextStyle(
          fontSize: 16,
          fontWeight: FontWeight.bold,
          color: AppColors.donkerblauw),
      maxLines: decorated ? null : 2,
      overflow: decorated ? TextOverflow.visible : TextOverflow.ellipsis,
    );
    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Expanded(
          child: decorated
              ? Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(icon, size: 18, color: iconColor),
                    const SizedBox(height: 4),
                    titleText
                  ],
                )
              : Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Padding(
                        padding: const EdgeInsets.only(top: 2),
                        child: Icon(icon, size: 18, color: iconColor)),
                    const SizedBox(width: 8),
                    Expanded(child: titleText),
                  ],
                ),
        ),
        if (decorated) ...[
          const SizedBox(width: 8),
          SizedBox(
            width: 100,
            height: 120,
            child:
                FittedBox(child: EventCardDecoration(appearance: appearance!)),
          ),
        ],
      ],
    );
  }
}
