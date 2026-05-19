import 'package:flutter/material.dart';
import '../config/app_colors.dart';
import '../models/member_profile.dart';

class CotisationStatusBadge extends StatelessWidget {
  final MemberProfile profile;
  final bool compact;

  const CotisationStatusBadge({
    super.key,
    required this.profile,
    this.compact = false,
  });

  @override
  Widget build(BuildContext context) {
    final display = _display();

    return Container(
      padding: EdgeInsets.symmetric(
        horizontal: compact ? 8 : 12,
        vertical: compact ? 4 : 8,
      ),
      decoration: BoxDecoration(
        color: display.bgColor,
        borderRadius: BorderRadius.circular(compact ? 12 : 8),
        border: compact
            ? null
            : Border.all(color: display.textColor.withValues(alpha: 0.3)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(
            display.icon,
            size: compact ? 14 : 18,
            color: display.textColor,
          ),
          SizedBox(width: compact ? 4 : 8),
          Flexible(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  display.label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: compact ? 12 : 14,
                    fontWeight: FontWeight.w700,
                    color: display.textColor,
                  ),
                ),
                if (!compact)
                  Text(
                    display.subtext,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                      fontSize: 12,
                      color: display.textColor.withValues(alpha: 0.8),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  _CotisationDisplay _display() {
    switch (profile.cotisationStatus) {
      case ValidationStatus.valid:
        return _CotisationDisplay(
          icon: Icons.check_circle_outline,
          label: 'Valable',
          subtext: _validityText(),
          bgColor: AppColors.statusApproved,
          textColor: AppColors.statusApprovedText,
        );
      case ValidationStatus.warning:
        return _CotisationDisplay(
          icon: Icons.warning_amber_outlined,
          label: 'Expire bientôt',
          subtext: _validityText(),
          bgColor: AppColors.statusPending,
          textColor: AppColors.statusPendingText,
        );
      case ValidationStatus.expired:
        return _CotisationDisplay(
          icon: Icons.error_outline,
          label: 'Expirée',
          subtext: _validityText(),
          bgColor: AppColors.statusRejected,
          textColor: AppColors.statusRejectedText,
        );
      case ValidationStatus.missing:
        return _CotisationDisplay(
          icon: Icons.remove_circle_outline,
          label: 'À régler',
          subtext: 'Cotisation à régler pour participer',
          bgColor: Colors.grey.shade100,
          textColor: Colors.grey.shade700,
        );
    }
  }

  String _validityText() {
    final date = profile.cotisationValidite;
    if (date == null) return 'Cotisation à régler pour participer';

    final days = date.difference(DateTime.now()).inDays;
    if (days < 0) return 'Expirée depuis le ${_formatDate(date)}';
    if (days <= 30) return 'Expire le ${_formatDate(date)}';
    return 'Valable jusqu\'au ${_formatDate(date)}';
  }

  String _formatDate(DateTime date) {
    return '${date.day.toString().padLeft(2, '0')}/${date.month.toString().padLeft(2, '0')}/${date.year}';
  }
}

class _CotisationDisplay {
  final IconData icon;
  final String label;
  final String subtext;
  final Color bgColor;
  final Color textColor;

  const _CotisationDisplay({
    required this.icon,
    required this.label,
    required this.subtext,
    required this.bgColor,
    required this.textColor,
  });
}
