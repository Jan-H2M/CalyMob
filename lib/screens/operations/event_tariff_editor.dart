import 'package:flutter/material.dart';

import '../../config/app_colors.dart';
import '../../models/tariff.dart';
import '../../utils/event_edit_safety.dart';

class EditableEventTariff {
  final Tariff _original;
  String label;
  String category;
  double price;
  bool isGuestTariff;

  EditableEventTariff.fromTariff(Tariff tariff)
      : _original = tariff,
        label = tariff.label,
        category = tariff.category,
        price = tariff.hasNumericPrice ? tariff.price : double.nan,
        isGuestTariff = tariff.isGuestTariff;

  Map<String, dynamic> toMap() => {
        ..._original.toMap(),
        'label': label.trim(),
        'category': category,
        'price': price,
        'is_guest_tariff': isGuestTariff,
      };

  Tariff toTariff() => Tariff.fromMap(toMap());

  bool get isMemberCategory =>
      registrationTariffCategory(category, label) == 'membre';

  bool get isOrdinaryMember =>
      !isGuestTariff && label.trim().isNotEmpty && isMemberCategory;
}

class EventTariffEditorRow extends StatelessWidget {
  final EditableEventTariff tariff;
  final bool hasOrdinaryMemberTariff;
  final VoidCallback onChanged;
  final VoidCallback onRemove;

  const EventTariffEditorRow({
    super.key,
    required this.tariff,
    required this.hasOrdinaryMemberTariff,
    required this.onChanged,
    required this.onRemove,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.lichtblauw.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.lichtblauw.withValues(alpha: 0.2)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            // Label input
            Expanded(
              flex: 3,
              child: TextFormField(
                initialValue: tariff.label,
                decoration: InputDecoration(
                  hintText: 'Label (ex: Membre)',
                  hintStyle: TextStyle(color: Colors.grey[400], fontSize: 13),
                  filled: true,
                  fillColor: Colors.white,
                  isDense: true,
                  contentPadding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8),
                    borderSide: BorderSide(color: Colors.grey[300]!),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8),
                    borderSide: BorderSide(color: Colors.grey[300]!),
                  ),
                ),
                style: const TextStyle(fontSize: 14),
                onChanged: (value) {
                  tariff.label = value;
                  tariff.category = registrationTariffCategory(null, value);
                  onChanged();
                },
              ),
            ),
            const SizedBox(width: 8),

            // Price input
            Expanded(
              flex: 2,
              child: TextFormField(
                initialValue: tariff.price == 0 || !tariff.price.isFinite
                    ? ''
                    : tariff.price.toStringAsFixed(2),
                decoration: InputDecoration(
                  hintText: '0.00',
                  hintStyle: TextStyle(color: Colors.grey[400], fontSize: 13),
                  suffixText: '€',
                  suffixStyle: const TextStyle(
                    color: AppColors.middenblauw,
                    fontWeight: FontWeight.bold,
                  ),
                  filled: true,
                  fillColor: Colors.white,
                  isDense: true,
                  contentPadding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8),
                    borderSide: BorderSide(color: Colors.grey[300]!),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8),
                    borderSide: BorderSide(color: Colors.grey[300]!),
                  ),
                ),
                style: const TextStyle(fontSize: 14),
                keyboardType:
                    const TextInputType.numberWithOptions(decimal: true),
                onChanged: (value) {
                  tariff.price = value.trim().isEmpty
                      ? 0
                      : parseEventPriceInput(value) ?? double.nan;
                  onChanged();
                },
              ),
            ),
            const SizedBox(width: 4),

            // Delete button
            IconButton(
              icon: Icon(Icons.close, size: 20, color: Colors.red[400]),
              onPressed: onRemove,
              padding: EdgeInsets.zero,
              constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
            ),
          ]),
          CheckboxListTile(
            title: const Text('Invités uniquement'),
            value: tariff.isGuestTariff,
            contentPadding: EdgeInsets.zero,
            controlAffinity: ListTileControlAffinity.leading,
            dense: true,
            onChanged: (value) {
              tariff.isGuestTariff = value ?? false;
              onChanged();
            },
          ),
          if (tariff.isGuestTariff &&
              tariff.isMemberCategory &&
              !hasOrdinaryMemberTariff)
            Semantics(
              liveRegion: true,
              child: const Text(
                ordinaryMemberTariffProblem,
                style: TextStyle(color: AppColors.error, fontSize: 13),
              ),
            ),
        ],
      ),
    );
  }
}
