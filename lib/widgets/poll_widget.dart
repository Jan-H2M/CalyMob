import 'package:flutter/material.dart';
import '../models/poll.dart';

class ChatPollWidget extends StatelessWidget {
  final Poll poll;
  final String currentUserId;
  final ValueChanged<String> onVote;
  final VoidCallback? onClose;
  final bool canClose;

  const ChatPollWidget({
    super.key,
    required this.poll,
    required this.currentUserId,
    required this.onVote,
    this.onClose,
    this.canClose = false,
  });

  @override
  Widget build(BuildContext context) {
    final totalVotes = poll.totalVotes;

    return Container(
      margin: const EdgeInsets.only(top: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.92),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.blueGrey.shade100),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.poll_outlined, size: 18, color: Colors.blueGrey),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  poll.question,
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    color: Colors.black87,
                  ),
                ),
              ),
              if (canClose && !poll.isClosed && onClose != null)
                TextButton(
                  onPressed: onClose,
                  child: const Text('Clore'),
                ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            poll.isClosed
                ? 'Sondage clôturé'
                : poll.allowMultiple
                    ? 'Choix multiple autorisé'
                    : 'Un seul choix possible',
            style: TextStyle(
              fontSize: 12,
              color: poll.isClosed ? Colors.red.shade600 : Colors.grey.shade700,
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(height: 10),
          for (final option in poll.options)
            _PollOptionTile(
              option: option,
              totalVotes: totalVotes,
              selected: option.votes.contains(currentUserId),
              disabled: poll.isClosed,
              onTap: () => onVote(option.id),
            ),
          const SizedBox(height: 6),
          Text(
            '$totalVotes vote${totalVotes > 1 ? 's' : ''}',
            style: TextStyle(
              fontSize: 12,
              color: Colors.grey.shade700,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

class _PollOptionTile extends StatelessWidget {
  final PollOption option;
  final int totalVotes;
  final bool selected;
  final bool disabled;
  final VoidCallback onTap;

  const _PollOptionTile({
    required this.option,
    required this.totalVotes,
    required this.selected,
    required this.disabled,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final ratio = totalVotes == 0 ? 0.0 : option.votes.length / totalVotes;

    return InkWell(
      onTap: disabled ? null : onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: selected ? Colors.blue.shade50 : Colors.grey.shade50,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: selected ? Colors.blue.shade300 : Colors.grey.shade300,
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    option.text,
                    style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: Colors.black87,
                    ),
                  ),
                ),
                Text(
                  '${option.votes.length}',
                  style: TextStyle(
                    fontSize: 12,
                    color: Colors.grey.shade700,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 8),
            ClipRRect(
              borderRadius: BorderRadius.circular(999),
              child: LinearProgressIndicator(
                value: ratio,
                minHeight: 7,
                backgroundColor: Colors.grey.shade200,
                valueColor: AlwaysStoppedAnimation<Color>(
                  selected ? Colors.blue.shade400 : Colors.blueGrey.shade300,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
