import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../config/app_colors.dart';
import '../../models/supplement.dart';
import '../../models/tariff.dart';

/// Dialog to add a guest (non-member) to an operation.
///
/// Two modes depending on the [availableGuestTariffs] argument:
///  - When the list is non-empty (member-driven flow on an event with
///    `allow_guests=true`): the user picks a tariff (e.g. "Invité adulte"
///    vs "Invité enfant") and the price is locked to that tariff. If the
///    list has exactly one entry, no dropdown is shown — just the price.
///  - When the list is empty (legacy admin flow): falls back to a free
///    price field, preserving the original behaviour.
///
/// If [availableSupplements] is non-empty, supplement checkboxes are shown
/// after the tariff so the guest can directly opt into hamburger menus,
/// "je viens mais je ne mange pas", etc. — same UX as the member's own
/// supplement selection on the inscription dialog.
///
/// Returns a Map with keys: `prenom`, `nom`, `prix`, `tariffId` (nullable
/// when in legacy free-price mode), `selectedSupplements`
/// (List<SelectedSupplement>) and `supplementTotal` (double).
class AddGuestDialog extends StatefulWidget {
  final List<Tariff> availableGuestTariffs;
  final List<Supplement> availableSupplements;

  const AddGuestDialog({
    super.key,
    this.availableGuestTariffs = const [],
    this.availableSupplements = const [],
  });

  @override
  State<AddGuestDialog> createState() => _AddGuestDialogState();
}

class _AddGuestDialogState extends State<AddGuestDialog> {
  final _formKey = GlobalKey<FormState>();
  final _prenomController = TextEditingController();
  final _nomController = TextEditingController();
  final _prixController = TextEditingController();
  final _prenomFocusNode = FocusNode();
  final _nomFocusNode = FocusNode();
  final _prixFocusNode = FocusNode();

  Tariff? _selectedTariff;

  /// IDs des suppléments sélectionnés pour cet invité.
  final Set<String> _selectedSupplementIds = {};

  bool get _hasGuestTariffs => widget.availableGuestTariffs.isNotEmpty;

  bool get _hasSupplements => widget.availableSupplements.isNotEmpty;

  double get _supplementTotal {
    double total = 0;
    for (final supp in widget.availableSupplements) {
      if (_selectedSupplementIds.contains(supp.id)) {
        total += supp.price;
      }
    }
    return total;
  }

  @override
  void initState() {
    super.initState();
    if (_hasGuestTariffs) {
      _selectedTariff = widget.availableGuestTariffs.first;
    }
  }

  @override
  void dispose() {
    _prenomController.dispose();
    _nomController.dispose();
    _prixController.dispose();
    _prenomFocusNode.dispose();
    _nomFocusNode.dispose();
    _prixFocusNode.dispose();
    super.dispose();
  }

  void _submit() {
    if (!(_formKey.currentState?.validate() ?? false)) return;

    final double prix;
    final String? tariffId;
    if (_hasGuestTariffs) {
      // Member-driven flow: price comes from the selected tariff, never typed.
      if (_selectedTariff == null) return;
      prix = _selectedTariff!.price;
      tariffId = _selectedTariff!.id;
    } else {
      // Legacy admin flow: free-typed price, no tariff link.
      prix = double.tryParse(_prixController.text.replaceAll(',', '.')) ?? 0.0;
      tariffId = null;
    }

    final selectedSupplements = widget.availableSupplements
        .where((s) => _selectedSupplementIds.contains(s.id))
        .map((s) => SelectedSupplement(id: s.id, name: s.name, price: s.price))
        .toList();

    Navigator.of(context).pop({
      'prenom': _prenomController.text.trim(),
      'nom': _nomController.text.trim(),
      'prix': prix,
      'tariffId': tariffId,
      'selectedSupplements': selectedSupplements,
      'supplementTotal': _supplementTotal,
    });
  }

  InputDecoration _buildInputDecoration(String hintText) {
    return InputDecoration(
      hintText: hintText,
      hintStyle: TextStyle(
        color: AppColors.donkerblauw.withOpacity(0.5),
        fontWeight: FontWeight.normal,
      ),
      filled: true,
      fillColor: Colors.white,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide.none,
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide.none,
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(
          color: AppColors.oranje,
          width: 2,
        ),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(
          color: Colors.redAccent,
          width: 2,
        ),
      ),
      focusedErrorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(
          color: Colors.redAccent,
          width: 2,
        ),
      ),
      contentPadding: const EdgeInsets.symmetric(
        horizontal: 18,
        vertical: 16,
      ),
      counterText: '',
    );
  }

  /// Tariff selector — dropdown if multiple, locked card if single.
  Widget _buildTariffSection() {
    final tariffs = widget.availableGuestTariffs;
    if (tariffs.length == 1) {
      final t = tariffs.first;
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
        decoration: BoxDecoration(
          color: Colors.white.withOpacity(0.95),
          borderRadius: BorderRadius.circular(14),
        ),
        child: Row(
          children: [
            const Icon(Icons.local_offer_outlined,
                size: 18, color: AppColors.donkerblauw),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                t.label.isNotEmpty ? t.label : 'Tarif invité',
                style: const TextStyle(
                  color: AppColors.donkerblauw,
                  fontSize: 15,
                  fontWeight: FontWeight.w500,
                ),
              ),
            ),
            Text(
              '${t.price.toStringAsFixed(2)} €',
              style: const TextStyle(
                color: AppColors.donkerblauw,
                fontSize: 15,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ),
      );
    }

    return DropdownButtonFormField<Tariff>(
      value: _selectedTariff,
      isExpanded: true,
      decoration: _buildInputDecoration('Type d\'invité').copyWith(
        prefixIcon: const Icon(Icons.local_offer_outlined,
            color: AppColors.donkerblauw, size: 20),
      ),
      style: const TextStyle(
        color: AppColors.donkerblauw,
        fontSize: 16,
        fontWeight: FontWeight.w500,
      ),
      items: tariffs
          .map((t) => DropdownMenuItem<Tariff>(
                value: t,
                child: Text(
                  '${t.label.isNotEmpty ? t.label : "Invité"} — ${t.price.toStringAsFixed(2)} €',
                ),
              ))
          .toList(),
      onChanged: (t) => setState(() => _selectedTariff = t),
      validator: (t) => t == null ? 'Choisissez un type' : null,
    );
  }

  /// Supplément checkboxes — same look as the member's own supplements
  /// section on the inscription/edit dialogs.
  Widget _buildSupplementsSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.only(bottom: 8),
          child: Text(
            'SUPPLÉMENTS OPTIONNELS',
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: Colors.white.withOpacity(0.8),
              letterSpacing: 1.2,
            ),
          ),
        ),
        ...widget.availableSupplements.map((supp) {
          final isSelected = _selectedSupplementIds.contains(supp.id);
          return GestureDetector(
            onTap: () {
              setState(() {
                if (isSelected) {
                  _selectedSupplementIds.remove(supp.id);
                } else {
                  _selectedSupplementIds.add(supp.id);
                }
              });
            },
            child: Container(
              margin: const EdgeInsets.only(bottom: 6),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.92),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                children: [
                  SizedBox(
                    width: 24,
                    height: 24,
                    child: Checkbox(
                      value: isSelected,
                      onChanged: (val) {
                        setState(() {
                          if (val == true) {
                            _selectedSupplementIds.add(supp.id);
                          } else {
                            _selectedSupplementIds.remove(supp.id);
                          }
                        });
                      },
                      activeColor: AppColors.oranje,
                      checkColor: Colors.white,
                      materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                      visualDensity: VisualDensity.compact,
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          supp.name,
                          style: const TextStyle(
                            color: AppColors.donkerblauw,
                            fontSize: 14,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                        Text(
                          '${supp.price.toStringAsFixed(2)} €',
                          style: TextStyle(
                            color: AppColors.donkerblauw.withOpacity(0.6),
                            fontSize: 12,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          );
        }),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: Colors.transparent,
      insetPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
      child: GestureDetector(
        onTap: () => FocusScope.of(context).unfocus(),
        child: SingleChildScrollView(
          child: Container(
            constraints: const BoxConstraints(maxWidth: 400),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [
                  AppColors.donkerblauw,
                  AppColors.middenblauw,
                ],
              ),
              borderRadius: BorderRadius.circular(20),
              boxShadow: [
                BoxShadow(
                  color: AppColors.donkerblauw.withOpacity(0.4),
                  blurRadius: 24,
                  offset: const Offset(0, 12),
                ),
              ],
            ),
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Form(
                key: _formKey,
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // Header
                    Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.all(10),
                          decoration: BoxDecoration(
                            color: AppColors.oranje.withOpacity(0.3),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: const Icon(
                            Icons.person_add_alt_1,
                            color: Colors.white,
                            size: 24,
                          ),
                        ),
                        const SizedBox(width: 14),
                        const Text(
                          'Ajouter un invité',
                          style: TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.bold,
                            color: Colors.white,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 28),

                    // Prénom field
                    TextFormField(
                      controller: _prenomController,
                      focusNode: _prenomFocusNode,
                      style: const TextStyle(
                        color: AppColors.donkerblauw,
                        fontSize: 16,
                        fontWeight: FontWeight.w500,
                      ),
                      decoration: _buildInputDecoration('Prénom'),
                      maxLength: 50,
                      textInputAction: TextInputAction.next,
                      textCapitalization: TextCapitalization.words,
                      onFieldSubmitted: (_) {
                        FocusScope.of(context).requestFocus(_nomFocusNode);
                      },
                      validator: (value) {
                        if (value == null || value.trim().isEmpty) {
                          return 'Veuillez saisir le prénom';
                        }
                        return null;
                      },
                    ),
                    const SizedBox(height: 16),

                    // Nom field
                    TextFormField(
                      controller: _nomController,
                      focusNode: _nomFocusNode,
                      style: const TextStyle(
                        color: AppColors.donkerblauw,
                        fontSize: 16,
                        fontWeight: FontWeight.w500,
                      ),
                      decoration: _buildInputDecoration('Nom'),
                      maxLength: 50,
                      textInputAction: _hasGuestTariffs
                          ? TextInputAction.done
                          : TextInputAction.next,
                      textCapitalization: TextCapitalization.words,
                      onFieldSubmitted: (_) {
                        if (_hasGuestTariffs) {
                          _submit();
                        } else {
                          FocusScope.of(context).requestFocus(_prixFocusNode);
                        }
                      },
                      validator: (value) {
                        if (value == null || value.trim().isEmpty) {
                          return 'Veuillez saisir le nom';
                        }
                        return null;
                      },
                    ),
                    const SizedBox(height: 16),

                    // Tariff selector OR free-price field
                    if (_hasGuestTariffs)
                      _buildTariffSection()
                    else
                      TextFormField(
                        controller: _prixController,
                        focusNode: _prixFocusNode,
                        style: const TextStyle(
                          color: AppColors.donkerblauw,
                          fontSize: 16,
                          fontWeight: FontWeight.w500,
                        ),
                        decoration: _buildInputDecoration('Prix (€)').copyWith(
                          suffixText: '€',
                          suffixStyle: TextStyle(
                            color: AppColors.donkerblauw.withOpacity(0.7),
                            fontSize: 16,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                        keyboardType: const TextInputType.numberWithOptions(
                            decimal: true),
                        inputFormatters: [
                          FilteringTextInputFormatter.allow(
                              RegExp(r'[\d.,]')),
                        ],
                        textInputAction: TextInputAction.done,
                        onFieldSubmitted: (_) => _submit(),
                        validator: (value) {
                          if (value == null || value.trim().isEmpty) {
                            return 'Veuillez saisir le prix';
                          }
                          final parsed =
                              double.tryParse(value.replaceAll(',', '.'));
                          if (parsed == null || parsed < 0) {
                            return 'Montant invalide';
                          }
                          return null;
                        },
                      ),
                    if (_hasSupplements) ...[
                      const SizedBox(height: 20),
                      _buildSupplementsSection(),
                    ],
                    const SizedBox(height: 24),

                    // Action buttons
                    Row(
                      children: [
                        Expanded(
                          child: TextButton(
                            onPressed: () => Navigator.of(context).pop(),
                            style: TextButton.styleFrom(
                              foregroundColor: Colors.white70,
                              padding:
                                  const EdgeInsets.symmetric(vertical: 14),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(12),
                                side: BorderSide(
                                  color: Colors.white.withOpacity(0.3),
                                ),
                              ),
                            ),
                            child: const Text(
                              'Annuler',
                              style: TextStyle(
                                fontSize: 15,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          flex: 2,
                          child: ElevatedButton.icon(
                            onPressed: _submit,
                            icon: const Icon(Icons.person_add, size: 20),
                            label: const Text(
                              'Ajouter',
                              style: TextStyle(
                                fontSize: 15,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: AppColors.oranje,
                              foregroundColor: Colors.white,
                              padding:
                                  const EdgeInsets.symmetric(vertical: 14),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(12),
                              ),
                              elevation: 0,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
