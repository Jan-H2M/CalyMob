import 'package:flutter/material.dart';

import '../config/app_colors.dart';
import '../services/operation_service.dart';

/// Optional, canonical LIFRAS level selector used for event guests.
///
/// The empty option is intentional: guest inscriptions created before the
/// level field existed remain valid and can still be edited.
class GuestDivingLevelField extends StatelessWidget {
  const GuestDivingLevelField({
    super.key,
    required this.value,
    required this.onChanged,
    this.compact = false,
    this.fillColor = Colors.white,
  });

  final String? value;
  final ValueChanged<String?> onChanged;
  final bool compact;
  final Color fillColor;

  @override
  Widget build(BuildContext context) {
    final canonical = canonicalRegistrationGuestDivingLevel(value);
    return DropdownButtonFormField<String>(
      initialValue: canonical ?? '',
      isExpanded: true,
      decoration: InputDecoration(
        labelText: 'Niveau de plongée',
        helperText: compact ? null : 'Optionnel · utile pour les palanquées',
        prefixIcon: const Icon(
          Icons.scuba_diving,
          color: AppColors.donkerblauw,
          size: 20,
        ),
        filled: true,
        fillColor: fillColor,
        contentPadding: EdgeInsets.symmetric(
          horizontal: compact ? 10 : 16,
          vertical: compact ? 9 : 14,
        ),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(compact ? 8 : 14),
          borderSide: BorderSide.none,
        ),
      ),
      style: const TextStyle(
        color: AppColors.donkerblauw,
        fontSize: 14,
        fontWeight: FontWeight.w500,
      ),
      items: [
        const DropdownMenuItem<String>(
          value: '',
          child: Text('Non renseigné'),
        ),
        ...registrationGuestDivingLevelLabels.entries.map(
          (entry) => DropdownMenuItem<String>(
            value: entry.key,
            child: Text(entry.value),
          ),
        ),
      ],
      onChanged: (selected) => onChanged(
        selected == null || selected.isEmpty ? null : selected,
      ),
    );
  }
}
