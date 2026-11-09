import 'package:flutter/material.dart';
import '../config/app_colors.dart';
import '../models/event_card_appearance.dart';
import 'event_card_decoration.dart';

/// All information stays left of artwork that follows the full card height.
class EventCardBody extends StatelessWidget {
  final EventCardAppearance? appearance;
  final List<Widget> children;
  const EventCardBody({super.key, this.appearance, required this.children});

  @override
  Widget build(BuildContext context) {
    final decorated = appearance?.hasArtwork == true;
    final content = Padding(
      padding: const EdgeInsets.all(14),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: children,
      ),
    );
    if (!decorated) return content;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Expanded(child: content),
        SizedBox(
          width: 120,
          child: EventCardDecoration(
            key: const ValueKey('full-height-event-art'),
            appearance: appearance!,
            fullHeight: true,
          ),
        ),
      ],
    );
  }
}

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
    if (decorated) {
      return Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 18, color: iconColor),
          const SizedBox(height: 4),
          titleText,
        ],
      );
    }
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
            padding: const EdgeInsets.only(top: 2),
            child: Icon(icon, size: 18, color: iconColor)),
        const SizedBox(width: 8),
        Expanded(child: titleText),
      ],
    );
  }
}
