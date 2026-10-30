import 'package:flutter/material.dart';
import '../../models/boutique/boutique_product.dart';

/// Text labels stay accessible; colours are never conveyed by a swatch alone.
class BoutiqueThreadColorPicker extends StatelessWidget {
  final String label;
  final BoutiqueThreadColors colors;
  final String? selected;
  final ValueChanged<String?> onChanged;
  const BoutiqueThreadColorPicker({
    super.key,
    required this.label,
    required this.colors,
    required this.selected,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    final accepted = colors.accepts(selected);
    final options = colors.choices.isNotEmpty
        ? colors.choices
        : [if (colors.fixedColor != null) colors.fixedColor!];
    if (options.isEmpty && accepted) return const SizedBox.shrink();
    if (!colors.valid) {
      return const Text(
        'Couleurs indisponibles : la configuration de cet article doit être vérifiée.',
      );
    }
    if (options.isEmpty) {
      return TextButton(
        onPressed: () => onChanged(null),
        child: const Text('Actualiser la personnalisation sans couleur'),
      );
    }
    if (colors.choices.isEmpty && accepted) {
      return Text('$label : ${colors.fixedColor}');
    }
    final value = accepted ? colors.resolve(selected) : null;
    return DropdownButtonFormField<String>(
      key: ValueKey('$label:$value:${options.join(';')}'),
      initialValue: value,
      isExpanded: true,
      decoration: InputDecoration(
        labelText: label,
        border: const OutlineInputBorder(),
        errorText: accepted
            ? null
            : 'Cette couleur n’est plus disponible. Choisissez à nouveau.',
      ),
      items: options
          .map((value) => DropdownMenuItem(value: value, child: Text(value)))
          .toList(),
      onChanged: onChanged,
    );
  }
}
