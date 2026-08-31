import 'package:flutter/material.dart';
import '../models/material_loan.dart';

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
  final Map<int, String> selected = {};
  bool paid = false;
  @override
  Widget build(BuildContext context) => StreamBuilder<List<MaterialLoanItem>>(
        stream: widget.availableItems,
        builder: (context, snapshot) {
          final available = snapshot.data ?? [];
          final valid = widget.lines.asMap().entries.every((entry) =>
                  available.any((item) =>
                      item.id == selected[entry.key] &&
                      item.isBorrowable &&
                      entry.value.matches(item))) &&
              selected.values.toSet().length == widget.lines.length;
          return AlertDialog(
            title: const Text('Remise du matériel'),
            content: SizedBox(
                width: 420,
                child: SingleChildScrollView(
                    child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Text(
                        'Aucun article n’a été réservé. Sélectionnez les pièces réellement remises.'),
                    if (snapshot.hasError)
                      const Text(
                          'Impossible de charger le matériel disponible.'),
                    for (final entry in widget.lines.asMap().entries)
                      Padding(
                          padding: const EdgeInsets.only(top: 12),
                          child: DropdownButtonFormField<String>(
                            key: ValueKey('handover-${entry.key}'),
                            isExpanded: true,
                            initialValue: available.any((item) =>
                                    item.id == selected[entry.key] &&
                                    entry.value.matches(item))
                                ? selected[entry.key]
                                : null,
                            decoration:
                                InputDecoration(labelText: entry.value.label),
                            items: available
                                .where((item) =>
                                    item.isBorrowable &&
                                    entry.value.matches(item))
                                .map((item) => DropdownMenuItem(
                                    value: item.id,
                                    child: Text(
                                        '${item.inventoryLabel} · ${item.serialNumber ?? "sans n° série"}',
                                        overflow: TextOverflow.ellipsis)))
                                .toList(),
                            onChanged: (id) => setState(() {
                              if (id != null) selected[entry.key] = id;
                            }),
                          )),
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
                          List<String>.generate(
                              widget.lines.length, (i) => selected[i]!))
                      : null,
                  child: const Text('Confirmer la remise')),
            ],
          );
        },
      );
}
