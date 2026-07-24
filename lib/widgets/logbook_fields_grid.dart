import 'package:flutter/material.dart';

import '../config/app_colors.dart';

/// Canonical compact field grid shared by logbook entry flows.
///
/// Field-specific editors stay owned by the parent flow. Boolean fields expose
/// [onToggle] so they behave as direct controls instead of opening text input.
class LogbookFieldsGrid extends StatelessWidget {
  final List<LogbookGridField> fields;

  const LogbookFieldsGrid({
    super.key,
    required this.fields,
  });

  @override
  Widget build(BuildContext context) {
    const gap = 6.0;
    return LayoutBuilder(
      builder: (context, constraints) {
        final columns = constraints.maxWidth < 360 ? 2 : 3;
        final itemWidth =
            (constraints.maxWidth - (gap * (columns - 1))) / columns;

        return Wrap(
          spacing: gap,
          runSpacing: gap,
          children: [
            for (final field in fields)
              SizedBox(
                width: field.wide ? constraints.maxWidth : itemWidth,
                child: _LogbookFieldCard(field: field),
              ),
          ],
        );
      },
    );
  }
}

class LogbookGridField {
  final String id;
  final String label;
  final String? value;
  final String? hint;
  final bool required;
  final bool wide;
  final bool warning;
  final bool? selected;
  final VoidCallback? onTap;
  final ValueChanged<bool>? onToggle;

  const LogbookGridField({
    required this.id,
    required this.label,
    this.value,
    this.hint,
    this.required = false,
    this.wide = false,
    this.warning = false,
    this.selected,
    this.onTap,
    this.onToggle,
  });

  bool get isToggle => onToggle != null;
  bool get isComplete =>
      isToggle ? selected == true : value?.trim().isNotEmpty == true;
}

class _LogbookFieldCard extends StatelessWidget {
  final LogbookGridField field;

  const _LogbookFieldCard({required this.field});

  @override
  Widget build(BuildContext context) {
    final complete = field.isComplete;
    final color = field.warning
        ? Colors.orange
        : complete
            ? Colors.green
            : field.required
                ? Colors.red
                : Colors.grey;
    final displayValue = complete
        ? (field.isToggle ? 'Oui' : field.value!)
        : (field.hint ?? 'à compléter');
    final onPressed = field.isToggle
        ? () => field.onToggle!(!(field.selected ?? false))
        : field.onTap;

    return Semantics(
      button: !field.isToggle,
      toggled: field.isToggle ? field.selected == true : null,
      label: field.label,
      hint: field.warning ? 'À vérifier' : null,
      value: field.isToggle
          ? (field.selected == true ? 'activé' : 'désactivé')
          : displayValue,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(10),
          onTap: onPressed,
          child: Container(
            constraints: const BoxConstraints(minHeight: 48),
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.10),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: color.withValues(alpha: 0.45)),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(
                  complete
                      ? Icons.check_circle
                      : field.required
                          ? Icons.error_outline
                          : field.isToggle
                              ? Icons.radio_button_unchecked
                              : Icons.edit_outlined,
                  size: 17,
                  color: color.shade700,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        field.label,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 11.5,
                          fontWeight: FontWeight.w900,
                          color: color.shade800,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        displayValue,
                        maxLines: field.wide ? 3 : 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          fontSize: 12.5,
                          fontWeight:
                              complete ? FontWeight.w700 : FontWeight.w500,
                          color:
                              complete ? color.shade900 : Colors.grey.shade600,
                          fontStyle:
                              complete ? FontStyle.normal : FontStyle.italic,
                        ),
                      ),
                    ],
                  ),
                ),
                if (!field.isToggle)
                  const Padding(
                    padding: EdgeInsets.only(left: 6),
                    child: Icon(
                      Icons.edit_outlined,
                      size: 16,
                      color: AppColors.middenblauw,
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
