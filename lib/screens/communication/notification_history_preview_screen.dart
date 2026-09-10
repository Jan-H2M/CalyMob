import 'package:flutter/material.dart';

import '../../config/app_colors.dart';

/// A local-only visual prototype for COM-136.
///
/// The production implementation will replace these examples with a user-scoped
/// notification stream. Keeping this screen data-free makes the preview safe to
/// run in Chrome before the storage and push-delivery contract is approved.
class NotificationHistoryPreviewContent extends StatefulWidget {
  const NotificationHistoryPreviewContent({super.key});

  @override
  State<NotificationHistoryPreviewContent> createState() =>
      _NotificationHistoryPreviewContentState();
}

class _NotificationHistoryPreviewContentState
    extends State<NotificationHistoryPreviewContent> {
  bool _unreadOnly = false;
  final List<_PreviewNotification> _notifications = [
    _PreviewNotification(
      icon: Icons.forum_rounded,
      color: const Color(0xFF2B79C2),
      title: 'Nouveau message dans Équipe encadrants',
      body: 'Sophie : « Rendez-vous à 19h30 devant la piscine. »',
      time: 'Aujourd’hui · 10:42',
      category: 'Conversation',
    ),
    _PreviewNotification(
      icon: Icons.event_available_rounded,
      color: const Color(0xFF138A72),
      title: 'Inscription confirmée',
      body: 'Votre place pour Sortie Zélande est confirmée.',
      time: 'Aujourd’hui · 08:15',
      category: 'Activité',
    ),
    _PreviewNotification(
      icon: Icons.campaign_rounded,
      color: const Color(0xFF7757B8),
      title: 'Information du club',
      body: 'Les horaires de la piscine changent ce vendredi.',
      time: 'Hier · 18:06',
      category: 'Annonce',
    ),
    _PreviewNotification(
      icon: Icons.assignment_turned_in_rounded,
      color: const Color(0xFFD77A28),
      title: 'Une action vous attend',
      body: 'Votre déclaration d’exercice doit être complétée.',
      time: 'Hier · 14:20',
      category: 'Action',
      isRead: true,
    ),
    _PreviewNotification(
      icon: Icons.shopping_bag_rounded,
      color: const Color(0xFFBE4C76),
      title: 'Commande en préparation',
      body: 'Votre commande Boutique sera bientôt disponible.',
      time: 'Lundi · 16:31',
      category: 'Boutique',
      isRead: true,
    ),
  ];

  int get _unreadCount => _notifications.where((item) => !item.isRead).length;

  @override
  Widget build(BuildContext context) {
    final visible = _unreadOnly
        ? _notifications.where((item) => !item.isRead).toList()
        : _notifications;

    return Column(
      children: [
        _FilterBar(
          unreadOnly: _unreadOnly,
          unreadCount: _unreadCount,
          onChanged: (value) => setState(() => _unreadOnly = value),
        ),
        Expanded(
          child: ListView.separated(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 32),
            itemCount: visible.length + 1,
            separatorBuilder: (_, __) => const SizedBox(height: 10),
            itemBuilder: (context, index) {
              if (index == 0) return const _PrototypeHint();
              final item = visible[index - 1];
              return _NotificationCard(
                item: item,
                onTap: () {
                  setState(() => item.isRead = true);
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text('Ouvrir : ${item.category}'),
                      behavior: SnackBarBehavior.floating,
                    ),
                  );
                },
              );
            },
          ),
        ),
      ],
    );
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
  Widget build(BuildContext context) => InkWell(
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
                'Prévisualisation : les éléments seront reliés à vos notifications reçues.',
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

class _NotificationCard extends StatelessWidget {
  final _PreviewNotification item;
  final VoidCallback onTap;

  const _NotificationCard({required this.item, required this.onTap});

  @override
  Widget build(BuildContext context) => Material(
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
                    color: item.color.withValues(alpha: 0.13),
                    borderRadius: BorderRadius.circular(13),
                  ),
                  child: Icon(item.icon, color: item.color),
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
                            item.time,
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
                              color: item.color,
                              fontSize: 11,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                          const SizedBox(width: 2),
                          Icon(
                            Icons.chevron_right_rounded,
                            color: item.color,
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

class _PreviewNotification {
  final IconData icon;
  final Color color;
  final String title;
  final String body;
  final String time;
  final String category;
  bool isRead;

  _PreviewNotification({
    required this.icon,
    required this.color,
    required this.title,
    required this.body,
    required this.time,
    required this.category,
    this.isRead = false,
  });
}
