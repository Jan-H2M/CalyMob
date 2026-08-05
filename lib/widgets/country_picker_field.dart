import 'package:country_picker/country_picker.dart';
import 'package:flutter/material.dart';
import '../config/app_colors.dart';
import '../utils/country_codes.dart';

class CountryPickerField extends StatelessWidget {
  final String? value;
  final ValueChanged<String?> onChanged;
  final List<String> recentCountryCodes;
  final bool readOnly;
  final String emptyLabel;

  const CountryPickerField({
    super.key,
    required this.value,
    required this.onChanged,
    this.recentCountryCodes = const [],
    this.readOnly = false,
    this.emptyLabel = 'Ajouter un pays (optionnel)',
  });

  @override
  Widget build(BuildContext context) {
    final code = normalizeCountryCode(value);
    final label = code == null
        ? emptyLabel
        : countryDisplayNameForContext(context, code, includeCode: true);

    return Material(
      color: Colors.transparent,
      child: InkWell(
        key: const ValueKey('logbook-country-picker'),
        onTap: readOnly ? null : () => _openPicker(context),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 11),
          child: Row(
            children: [
              Icon(
                Icons.public,
                color: code == null ? Colors.grey : AppColors.middenblauw,
                size: 21,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      label,
                      style: TextStyle(
                        color: code == null
                            ? Colors.black.withValues(alpha: 0.45)
                            : Colors.black87,
                        fontSize: 14.5,
                        fontWeight:
                            code == null ? FontWeight.w400 : FontWeight.w600,
                      ),
                    ),
                    if (code != null)
                      Text(
                        'Modifiable pour cette plongée',
                        style: TextStyle(
                          color: Colors.black.withValues(alpha: 0.48),
                          fontSize: 11.5,
                        ),
                      ),
                  ],
                ),
              ),
              if (!readOnly && code != null)
                IconButton(
                  key: const ValueKey('clear-logbook-country'),
                  tooltip: 'Retirer le pays',
                  visualDensity: VisualDensity.compact,
                  onPressed: () => onChanged(null),
                  icon: const Icon(Icons.close, size: 18),
                ),
              if (!readOnly)
                Icon(
                  Icons.unfold_more,
                  color: Colors.black.withValues(alpha: 0.4),
                  size: 20,
                ),
            ],
          ),
        ),
      ),
    );
  }

  void _openPicker(BuildContext context) {
    showCountryPicker(
      context: context,
      favorite: countryFavorites(recentCountryCodes),
      showPhoneCode: false,
      searchAutofocus: true,
      useSafeArea: true,
      customFlagBuilder: (_) => const SizedBox(
        width: 24,
        child: Icon(Icons.public, size: 20, color: AppColors.middenblauw),
      ),
      countryListTheme: CountryListThemeData(
        bottomSheetHeight: MediaQuery.sizeOf(context).height * 0.78,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
        inputDecoration: InputDecoration(
          labelText: 'Rechercher un pays',
          hintText: 'Belgique, Croatie, Égypte…',
          prefixIcon: const Icon(Icons.search),
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
        ),
      ),
      header: const Padding(
        padding: EdgeInsets.fromLTRB(20, 4, 20, 0),
        child: Text(
          'Pays de la plongée',
          style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
        ),
      ),
      onSelect: (country) => onChanged(country.countryCode),
    );
  }
}
