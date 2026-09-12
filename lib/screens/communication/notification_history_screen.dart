import 'package:flutter/material.dart';

import '../../config/app_colors.dart';
import '../../models/notification_history_item.dart';
import '../../services/notification_history_service.dart';
import '../../services/notification_navigation_service.dart';

class NotificationHistoryContent extends StatefulWidget {
  final String clubId;
  final String memberId;
  final NotificationHistoryService? service;
  final bool previewMode;

  const NotificationHistoryContent({
    super.key,
    required this.clubId,
    required this.memberId,
    this.service,
    this.previewMode = false,
  });

  @override
  State<NotificationHistoryContent> createState() =>
      _NotificationHistoryContentState();
}

class _NotificationHistoryContentState
    extends State<NotificationHistoryContent> {
  late final NotificationHistoryService? _service;
  bool _unreadOnly = false;
  late List<NotificationHistoryItem> _previewItems;

  @override
  void initState() {
    super.initState();
    _service = widget.previewMode
        ? widget.service
        : (widget.service ?? NotificationHistoryService());
    _previewItems = _buildPreviewItems();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.previewMode) return _buildList(_previewItems);

    return StreamBuilder<List<NotificationHistoryItem>>(
      stream: _service!.watch(
        clubId: widget.clubId,
        memberId: widget.memberId,
      ),
      builder: (context, snapshot) {
        if (snapshot.hasError) {
          return const _HistoryMessage(
            icon: Icons.cloud_off_rounded,
            title: 'Historique indisponible',
            body: 'Réessayez dans quelques instants.',
          );
        }
        if (!snapshot.hasData) {
          return const Center(child: CircularProgressIndicator());
        }
        return _buildList(snapshot.data!);
      },
    );
  }

  Widget _buildList(List<NotificationHistoryItem> notifications) {
    final unreadCount = notifications.where((item) => !item.isRead).length;
    final visible = _unreadOnly
        ? notifications.where((item) => !item.isRead).toList(growable: false)
        : notifications;

    return Column(
      children: [
        _FilterBar(
          unreadOnly: _unreadOnly,
          unreadCount: unreadCount,
          onChanged: (value) => setState(() => _unreadOnly = value),
        ),
        Expanded(
          child: visible.isEmpty
              ? _HistoryMessage(
                  icon: _unreadOnly
                      ? Icons.mark_email_read_rounded
                      : Icons.notifications_none_rounded,
                  title:
                      _unreadOnly ? 'Tout est lu' : 'Aucune notification reçue',
                  body: _unreadOnly
                      ? 'Vous n’avez plus de notification non lue.'
                      : 'Les prochaines notifications apparaîtront ici.',
                )
              : ListView.separated(
                  padding: const EdgeInsets.fromLTRB(16, 14, 16, 32),
                  itemCount: visible.length + (widget.previewMode ? 1 : 0),
                  separatorBuilder: (_, __) => const SizedBox(height: 10),
                  itemBuilder: (context, index) {
                    if (widget.previewMode && index == 0) {
                      return const _PrototypeHint();
                    }
                    final item = visible[index - (widget.previewMode ? 1 : 0)];
                    return _NotificationCard(
                      item: item,
                      onTap: () => _open(item),
                    );
                  },
                ),
        ),
      ],
    );
  }

  Future<void> _open(NotificationHistoryItem item) async {
    if (!item.isRead) {
      if (widget.previewMode) {
        setState(() {
          _previewItems = _previewItems
              .map(
                (entry) => entry.id == item.id
                    ? NotificationHistoryItem(
                        id: entry.id,
                        title: entry.title,
                        body: entry.body,
                        createdAt: entry.createdAt,
                        readAt: DateTime.now(),
                        type: entry.type,
                        category: entry.category,
                        payload: entry.payload,
                      )
                    : entry,
              )
              .toList(growable: false);
        });
      } else {
        try {
          await _service!.markRead(
            clubId: widget.clubId,
            memberId: widget.memberId,
            notificationId: item.id,
          );
        } catch (_) {
          if (!mounted) return;
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Impossible de marquer la notification comme lue.'),
            ),
          );
        }
      }
    }

    final opened =
        NotificationHistoryNavigationDispatcher.instance.open(item.payload);
    if (!opened && mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Cette destination ne peut pas encore être ouverte.'),
        ),
      );
    }
  }

  List<NotificationHistoryItem> _buildPreviewItems() {
    final now = DateTime.now();
    return [
      NotificationHistoryItem(
        id: 'preview-team',
        title: 'Nouveau message dans Équipe encadrants',
        body: 'Sophie : « Rendez-vous à 19h30 devant la piscine. »',
        createdAt: now.subtract(const Duration(minutes: 12)),
        type: 'team_message',
        category: 'Conversation',
        payload: const {'type': 'team_message', 'channel_id': 'preview'},
      ),
      NotificationHistoryItem(
        id: 'preview-operation',
        title: 'Inscription confirmée',
        body: 'Votre place pour Sortie Zélande est confirmée.',
        createdAt: now.subtract(const Duration(hours: 2)),
        type: 'event_waitlist_promoted',
        category: 'Activité',
        payload: const {
          'type': 'event_waitlist_promoted',
          'operation_id': 'preview',
        },
      ),
      NotificationHistoryItem(
        id: 'preview-announcement',
        title: 'Information du club',
        body: 'Les horaires de la piscine changent ce vendredi.',
        createdAt: now.subtract(const Duration(days: 1)),
        type: 'announcement',
        category: 'Annonce',
        payload: const {'type': 'announcement', 'announcement_id': 'preview'},
      ),
    ];
  }
}

class _FilterBar extends StatelessWidget {
  final bool unreadOnly;
  final int unreadCount;
  final ValueChanged<bool> onChanged;

  const _FilterBar({
    required this.unreadOnly,
    required this.unreadCount,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) => Container(
        color: Colors.white,
        padding: const EdgeInsets.fromLTRB(18, 12, 18, 13),
        child: Row(
          children: [
            _FilterPill(
              label: 'Toutes',
              selected: !unreadOnly,
              onTap: () => onChanged(false),
            ),
            const SizedBox(width: 9),
            _FilterPill(
              label: 'Non lues  $unreadCount',
              selected: unreadOnly,
              onTap: () => onChanged(true),
            ),
          ],
        ),
      );
}

class _FilterPill extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;

  const _FilterPill({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) => Semantics(
        button: true,
        selected: selected,
        label: label,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(999),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 9),
            decoration: BoxDecoration(
              color: selected ? AppColors.middenblauw : const Color(0xFFEEF6FB),
              borderRadius: BorderRadius.circular(999),
            ),
            child: Text(
              label,
              style: TextStyle(
                color: selected ? Colors.white : AppColors.donkerblauw,
                fontWeight: FontWeight.w800,
                fontSize: 12,
              ),
            ),
          ),
        ),
      );
}

class _PrototypeHint extends StatelessWidget {
  const _PrototypeHint();

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: const Color(0xFFE7F3FB),
          borderRadius: BorderRadius.circular(13),
          border: Border.all(color: const Color(0xFFC7E4F5)),
        ),
        child: const Row(
          children: [
            Icon(Icons.info_outline_rounded, color: AppColors.middenblauw),
            SizedBox(width: 10),
            Expanded(
              child: Text(
                'Mode de test : la version publiée affichera vos notifications reçues.',
                style: TextStyle(
                  color: AppColors.donkerblauw,
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ],
        ),
      );
}

class _HistoryMessage extends StatelessWidget {
  final IconData icon;
  final String title;
  final String body;

  const _HistoryMessage({
    required this.icon,
    required this.title,
    required this.body,
  });

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 52, color: const Color(0xFF7890A4)),
              const SizedBox(height: 14),
              Text(
                title,
                textAlign: TextAlign.center,
                style: const TextStyle(
                  color: AppColors.donkerblauw,
                  fontSize: 17,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: 7),
              Text(
                body,
                textAlign: TextAlign.center,
                style: const TextStyle(color: Color(0xFF60768C)),
              ),
            ],
          ),
        ),
      );
}

class _NotificationCard extends StatelessWidget {
  final NotificationHistoryItem item;
  final VoidCallback onTap;

  const _NotificationCard({required this.item, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final presentation = _presentationFor(item.type);
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: item.isRead
                  ? const Color(0xFFE4EDF3)
                  : const Color(0xFFB8DCF2),
              width: item.isRead ? 1 : 1.5,
            ),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  color: presentation.color.withValues(alpha: 0.13),
                  borderRadius: BorderRadius.circular(13),
                ),
                child: Icon(presentation.icon, color: presentation.color),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            item.title,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              color: AppColors.donkerblauw,
                              fontSize: 14,
                              fontWeight: item.isRead
                                  ? FontWeight.w700
                                  : FontWeight.w900,
                            ),
                          ),
                        ),
                        if (!item.isRead)
                          Container(
                            width: 9,
                            height: 9,
                            decoration: const BoxDecoration(
                              color: Color(0xFFE54B55),
                              shape: BoxShape.circle,
                            ),
                          ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text(
                      item.body,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: Color(0xFF506982),
                        height: 1.25,
                      ),
                    ),
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        Text(
                          _formatDate(item.createdAt),
                          style: const TextStyle(
                            color: Color(0xFF7890A4),
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        const Spacer(),
                        Text(
                          item.category,
                          style: TextStyle(
                            color: presentation.color,
                            fontSize: 11,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                        const SizedBox(width: 2),
                        Icon(
                          Icons.chevron_right_rounded,
                          color: presentation.color,
                          size: 18,
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  static String _formatDate(DateTime value) {
    final date = value.toLocal();
    String two(int number) => number.toString().padLeft(2, '0');
    return '${two(date.day)}/${two(date.month)}/${date.year} · '
        '${two(date.hour)}:${two(date.minute)}';
  }
}

({IconData icon, Color color}) _presentationFor(String type) {
  switch (type) {
    case 'event_message':
    case 'team_message':
    case 'session_message':
      return (icon: Icons.forum_rounded, color: const Color(0xFF2B79C2));
    case 'new_operation':
    case 'event_waitlist_promoted':
    case 'session_reminder':
      return (
        icon: Icons.event_available_rounded,
        color: const Color(0xFF138A72),
      );
    case 'announcement':
    case 'announcement_reply':
      return (icon: Icons.campaign_rounded, color: const Color(0xFF7757B8));
    case 'medical_certificate':
      return (icon: Icons.health_and_safety, color: const Color(0xFF14946B));
    default:
      return (
        icon: Icons.assignment_turned_in_rounded,
        color: const Color(0xFFD77A28),
      );
  }
}
