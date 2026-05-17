import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

import '../config/firebase_config.dart';

class MessageReactions extends StatelessWidget {
  static const List<String> quickReactions = ['👍', '❤️', '😂', '🎉', '🙏'];

  final Map<String, List<String>> reactions;
  final String currentUserId;
  final ValueChanged<String> onToggleReaction;
  final String clubId;
  final bool compact;

  const MessageReactions({
    super.key,
    required this.reactions,
    required this.currentUserId,
    required this.onToggleReaction,
    this.clubId = FirebaseConfig.defaultClubId,
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
              userIds: entry.value,
              currentUserId: currentUserId,
              clubId: clubId,
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
  final List<String> userIds;
  final String currentUserId;
  final String clubId;
  final VoidCallback onTap;
  final bool compact;

  const _ReactionChip({
    required this.emoji,
    required this.userIds,
    required this.currentUserId,
    required this.clubId,
    required this.onTap,
    required this.compact,
  });

  int get count => userIds.length;
  bool get selected => userIds.contains(currentUserId);

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      onLongPress: () => _showReactionUsers(context),
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

  Future<List<String>> _loadReactionNames() async {
    return Future.wait(
      userIds.map((userId) async {
        if (userId == currentUserId) return 'Vous';
        return _ReactionNameCache.displayName(clubId, userId);
      }),
    );
  }

  void _showReactionUsers(BuildContext context) {
    final namesFuture = _loadReactionNames();

    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      builder: (context) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 4, 20, 20),
            child: FutureBuilder<List<String>>(
              future: namesFuture,
              builder: (context, snapshot) {
                final names = snapshot.data;

                return Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Text(emoji, style: const TextStyle(fontSize: 24)),
                        const SizedBox(width: 10),
                        Text(
                          '$count réaction${count > 1 ? 's' : ''}',
                          style: const TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    if (snapshot.connectionState != ConnectionState.done)
                      const Padding(
                        padding: EdgeInsets.symmetric(vertical: 16),
                        child: Center(child: CircularProgressIndicator()),
                      )
                    else if (names == null || names.isEmpty)
                      const Padding(
                        padding: EdgeInsets.symmetric(vertical: 16),
                        child: Text('Aucun nom disponible'),
                      )
                    else
                      SizedBox(
                        height: names.length > 5 ? 280.0 : names.length * 56.0,
                        child: ListView.builder(
                          shrinkWrap: true,
                          itemCount: names.length,
                          itemBuilder: (context, index) {
                            final name = names[index];
                            return ListTile(
                              dense: true,
                              contentPadding: EdgeInsets.zero,
                              leading: CircleAvatar(
                                radius: 17,
                                child: Text(_initials(name)),
                              ),
                              title: Text(name),
                            );
                          },
                        ),
                      ),
                  ],
                );
              },
            ),
          ),
        );
      },
    );
  }

  static String _initials(String name) {
    final parts = name
        .split(RegExp(r'\s+'))
        .where((part) => part.trim().isNotEmpty)
        .toList();
    if (parts.isEmpty) return '?';
    if (parts.length == 1) return parts.first.characters.first.toUpperCase();
    return '${parts.first.characters.first}${parts.last.characters.first}'
        .toUpperCase();
  }
}

class _ReactionNameCache {
  static final Map<String, Future<String>> _cache = {};

  static Future<String> displayName(String clubId, String userId) {
    final key = '$clubId/$userId';
    return _cache.putIfAbsent(key, () async {
      try {
        final doc = await FirebaseFirestore.instance
            .collection('clubs')
            .doc(clubId)
            .collection('members')
            .doc(userId)
            .get();

        final data = doc.data();
        if (data == null) return 'Membre inconnu';

        final firstName =
            (data['prenom'] ?? data['firstName'] ?? '').toString().trim();
        final lastName =
            (data['nom'] ?? data['lastName'] ?? '').toString().trim();
        final email = (data['email'] ?? '').toString().trim();
        final fullName = '$firstName $lastName'.trim();

        if (fullName.isNotEmpty) return fullName;
        if (email.isNotEmpty) return email;
        return 'Membre inconnu';
      } catch (_) {
        return 'Membre inconnu';
      }
    });
  }
}
