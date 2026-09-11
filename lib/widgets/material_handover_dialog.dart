import 'package:flutter/material.dart';
import '../models/material_loan.dart';

class MaterialHandoverResult {
  final List<String> itemIds;
  final Map<String, double> leadKgByItemId;

  const MaterialHandoverResult({
    required this.itemIds,
    this.leadKgByItemId = const {},
  });
}

/// Returns physical IDs only after staff confirms the observed payment.
class MaterialHandoverDialog extends StatefulWidget {
  final List<MaterialLoanRequestedLine> lines;
  final Stream<List<MaterialLoanItem>> availableItems;
  final double cautionAmount;
  const MaterialHandoverDialog(
      {super.key,
      required this.lines,
      required this.availableItems,
      required this.cautionAmount});
  @override
  State<MaterialHandoverDialog> createState() => _MaterialHandoverDialogState();
}

class _MaterialHandoverDialogState extends State<MaterialHandoverDialog> {
  final Map<int, TextEditingController> _cdcControllers = {};
  final Map<int, TextEditingController> _leadControllers = {};
  bool paid = false;

  double? _leadKgFor(int index) => double.tryParse(
      (_leadControllers[index]?.text ?? '').replaceAll(',', '.'));

  MaterialLoanItem? _selectedItemFor(
    int index,
    MaterialLoanRequestedLine line,
    List<MaterialLoanItem> available,
  ) {
    final cdcNumber = _cdcControllers[index]?.text ?? '';
    return available
        .where(
          (item) =>
              item.isBorrowable &&
              line.matches(item) &&
              _matchesCdc(item, cdcNumber),
        )
        .firstOrNull;
  }

  bool _matchesCdc(MaterialLoanItem item, String value) {
    final entered = _normalizeCdc(value);
    if (entered.isEmpty) return false;
    final itemCode = _normalizeCdc(item.inventoryLabel);
    return itemCode == entered || itemCode == 'CDC$entered';
  }

  String _normalizeCdc(String value) =>
      value.toUpperCase().replaceAll(RegExp(r'[^A-Z0-9]'), '');

  @override
  void dispose() {
    for (final controller in _cdcControllers.values) {
      controller.dispose();
    }
    for (final controller in _leadControllers.values) {
      controller.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => StreamBuilder<List<MaterialLoanItem>>(
        stream: widget.availableItems,
        builder: (context, snapshot) {
          final available = snapshot.data ?? [];
          final selectedItems = widget.lines
              .asMap()
              .entries
              .map((entry) =>
                  _selectedItemFor(entry.key, entry.value, available))
              .toList();
          final valid = selectedItems.every((item) => item != null) &&
              selectedItems
                      .whereType<MaterialLoanItem>()
                      .map((item) => item.id)
                      .toSet()
                      .length ==
                  widget.lines.length &&
              selectedItems.whereType<MaterialLoanItem>().every((item) {
                final index = selectedItems.indexOf(item);
                return !item.isPocketWeightBelt ||
                    ((_leadKgFor(index) ?? 0) > 0);
              });
          return AlertDialog(
            title: const Text('Remise du matériel'),
            content: SizedBox(
                width: 420,
                child: SingleChildScrollView(
                    child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Text(
                        'Saisissez ou scannez le NR. CDC inscrit sur chaque pièce réellement remise.'),
                    if (snapshot.hasError)
                      const Text(
                          'Impossible de charger le matériel disponible.'),
                    for (final entry in widget.lines.asMap().entries) ...[
                      Padding(
                          padding: const EdgeInsets.only(top: 12),
                          child: Builder(builder: (context) {
                            final selectedItem = _selectedItemFor(
                              entry.key,
                              entry.value,
                              available,
                            );
                            final hasEntry =
                                (_cdcControllers[entry.key]?.text ?? '')
                                    .trim()
                                    .isNotEmpty;
                            return Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                TextFormField(
                                  controller: _cdcControllers.putIfAbsent(
                                    entry.key,
                                    TextEditingController.new,
                                  ),
                                  textCapitalization:
                                      TextCapitalization.characters,
                                  decoration: InputDecoration(
                                    labelText: '${entry.value.label} — NR. CDC',
                                    hintText: 'Ex. CDC 20',
                                    suffixIcon: selectedItem == null
                                        ? null
                                        : const Icon(
                                            Icons.verified,
                                            color: Colors.green,
                                          ),
                                  ),
                                  onChanged: (_) => setState(() {}),
                                ),
                                if (hasEntry && selectedItem == null)
                                  const Padding(
                                    padding: EdgeInsets.only(top: 5),
                                    child: Text(
                                      'Numéro CDC indisponible ou ne correspondant pas au matériel demandé.',
                                      style: TextStyle(
                                        color: Colors.red,
                                        fontSize: 12,
                                      ),
                                    ),
                                  ),
                                if (selectedItem != null)
                                  Padding(
                                    padding: const EdgeInsets.only(top: 5),
                                    child: Text(
                                      '${selectedItem.typeLabel} · ${selectedItem.variantLabel}${selectedItem.serialNumber == null ? '' : ' · série ${selectedItem.serialNumber}'}',
                                      style: const TextStyle(
                                          color: Colors.black54),
                                    ),
                                  ),
                              ],
                            );
                          })),
                      if (_selectedItemFor(entry.key, entry.value, available)
                              ?.isPocketWeightBelt ==
                          true)
                        Padding(
                          padding: const EdgeInsets.only(top: 8),
                          child: TextFormField(
                            controller: _leadControllers.putIfAbsent(
                                entry.key, TextEditingController.new),
                            keyboardType: const TextInputType.numberWithOptions(
                                decimal: true),
                            decoration: const InputDecoration(
                              labelText: 'Lest remis (kg)',
                              hintText: 'Ex. 6',
                              suffixText: 'kg',
                            ),
                            onChanged: (_) => setState(() {}),
                          ),
                        ),
                    ],
                    CheckboxListTile(
                        value: paid,
                        title: Text(
                            'J’ai constaté le paiement de ${widget.cautionAmount.toStringAsFixed(2)} EUR.'),
                        onChanged: (value) =>
                            setState(() => paid = value == true)),
                  ],
                ))),
            actions: [
              TextButton(
                  onPressed: () => Navigator.pop(context),
                  child: const Text('Annuler')),
              FilledButton(
                  onPressed: valid && paid && !snapshot.hasError
                      ? () => Navigator.pop(
                          context,
                          MaterialHandoverResult(
                            itemIds: selectedItems
                                .whereType<MaterialLoanItem>()
                                .map((item) => item.id)
                                .toList(),
                            leadKgByItemId: {
                              for (final entry in widget.lines.asMap().entries)
                                if (_selectedItemFor(
                                        entry.key, entry.value, available)!
                                    .isPocketWeightBelt)
                                  _selectedItemFor(
                                          entry.key, entry.value, available)!
                                      .id: _leadKgFor(entry.key)!,
                            },
                          ))
                      : null,
                  child: const Text('Confirmer la remise')),
            ],
          );
        },
      );
}
