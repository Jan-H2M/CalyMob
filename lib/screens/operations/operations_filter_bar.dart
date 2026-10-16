import 'package:flutter/material.dart';

import '../../config/app_colors.dart';

/// Keep access to past events visible without scrolling the category filters.
/// An unread event discussion may belong to a recently closed event.
class OperationsFilterBar extends StatelessWidget {
  const OperationsFilterBar({
    super.key,
    required this.selectedFilter,
    required this.canCreateEvents,
    required this.includePast,
    required this.onFilterSelected,
    required this.onPastToggled,
  });

  final String selectedFilter;
  final bool canCreateEvents;
  final bool includePast;
  final ValueChanged<String> onFilterSelected;
  final VoidCallback onPastToggled;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 50,
      margin: const EdgeInsets.only(bottom: 10),
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        children: [
          _filterChip('all', 'Tout'),
          const SizedBox(width: 12),
          // Put the way to find discussions in closed events in the first
          // viewport, before category chips that can scroll out of view.
          if (canCreateEvents)
            _filterChip('closed', 'Clôturés')
          else
            _pastToggleChip(),
          const SizedBox(width: 12),
          _filterChip('plongee', 'Plongées'),
          const SizedBox(width: 12),
          _filterChip('piscine', 'Piscine'),
          const SizedBox(width: 12),
          _filterChip('sortie', 'Sorties'),
        ],
      ),
    );
  }

  Widget _pastToggleChip() {
    return GestureDetector(
      onTap: onPastToggled,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
        decoration: _decoration(includePast),
        alignment: Alignment.center,
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.history,
              size: 16,
              color: includePast ? AppColors.donkerblauw : Colors.white,
            ),
            const SizedBox(width: 6),
            Text('Passés', style: _textStyle(includePast)),
          ],
        ),
      ),
    );
  }

  Widget _filterChip(String value, String label) {
    final isSelected = selectedFilter == value;
    return GestureDetector(
      onTap: () => onFilterSelected(value),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
        decoration: _decoration(isSelected),
        alignment: Alignment.center,
        child: Text(label, style: _textStyle(isSelected)),
      ),
    );
  }

  BoxDecoration _decoration(bool selected) => BoxDecoration(
        color: selected ? Colors.white : Colors.white.withValues(alpha: 0.2),
        borderRadius: BorderRadius.circular(20),
        border:
            Border.all(color: Colors.white.withValues(alpha: 0.3), width: 1),
      );

  TextStyle _textStyle(bool selected) => TextStyle(
        color: selected ? AppColors.donkerblauw : Colors.white,
        fontWeight: FontWeight.w600,
        fontSize: 14,
      );
}
