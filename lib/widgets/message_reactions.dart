import 'package:flutter/material.dart';

class MessageReactions extends StatelessWidget {
  static const List<String> quickReactions = ['👍', '❤️', '😂', '🎉', '🙏'];

  final Map<String, List<String>> reactions;
  final String currentUserId;
  final ValueChanged<String> onToggleReaction;
  final bool compact;

  const MessageReactions({
    super.key,
    required this.reactions,
    required this.currentUserId,
    required this.onToggleReaction,
    this.compact = false,
  });

  @override
  Widget build(BuildContext context) {
    if (reactions.isEmpty) return const SizedBox.shrink();

    final entries = reactions.entries.toList()
      ..sort((a, b) => b.value.length.compareTo(a.value.length));

    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Wrap(
        spacing: 6,
        runSpacing: 6,
        children: [
          for (final entry in entries)
            _ReactionChip(
              emoji: entry.key,
              count: entry.value.length,
              selected: entry.value.contains(currentUserId),
              onTap: () => onToggleReaction(entry.key),
              compact: compact,
            ),
        ],
      ),
    );
  }
}

class _ReactionChip extends StatelessWidget {
  final String emoji;
  final int count;
  final bool selected;
  final VoidCallback onTap;
  final bool compact;

  const _ReactionChip({
    required this.emoji,
    required this.count,
    required this.selected,
    required this.onTap,
    required this.compact,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(999),
      child: Container(
        padding: EdgeInsets.symmetric(
          horizontal: compact ? 8 : 10,
          vertical: compact ? 4 : 6,
        ),
        decoration: BoxDecoration(
          color: selected ? Colors.blue.shade50 : Colors.white,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(
            color: selected ? Colors.blue.shade300 : Colors.grey.shade300,
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(emoji, style: TextStyle(fontSize: compact ? 14 : 16)),
            const SizedBox(width: 4),
            Text(
              '$count',
              style: TextStyle(
                fontSize: compact ? 11 : 12,
                fontWeight: FontWeight.w700,
                color: selected ? Colors.blue.shade700 : Colors.grey.shade700,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
