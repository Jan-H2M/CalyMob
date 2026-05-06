import 'package:flutter/material.dart';
import '../../config/app_colors.dart';
import '../../models/tariff.dart';
import '../../models/operation.dart';
import '../../models/supplement.dart';

/// Dialog that lets a member register themselves AND add guests in one
/// go, with a single aggregated total. Used when the event has
/// `allow_guests=true` AND at least one tariff with `is_guest_tariff=true`.
///
/// Returns a Map with keys:
///   - 'guests': List<Map<String,dynamic>> with prenom/nom/prix/tariffId
///   - 'supplements': List<SelectedSupplement> (member's own supplements)
///   - 'supplementTotal': double
///   - 'memberPrice': double (member's base price + supplements)
///   - 'totalPrice': double (member + all guests)
///
/// Returns null when the user cancels.
class RegisterWithGuestsDialog extends StatefulWidget {
  final Operation operation;
  final double memberBasePrice;
  final List<Tariff> guestTariffs;
  final String memberDisplayName;
  final String memberInitials;
  final String? memberRoleLabel;

  const RegisterWithGuestsDialog({
    super.key,
    required this.operation,
    required this.memberBasePrice,
    required this.guestTariffs,
    required this.memberDisplayName,
    required this.memberInitials,
    this.memberRoleLabel,
  });

  @override
  State<RegisterWithGuestsDialog> createState() =>
      _RegisterWithGuestsDialogState();
}

class _GuestEntry {
  String prenom;
  String nom;
  Tariff tariff;

  _GuestEntry({this.prenom = '', this.nom = '', required this.tariff});
}

class _RegisterWithGuestsDialogState extends State<RegisterWithGuestsDialog> {
  final List<_GuestEntry> _guests = [];
  final Map<String, SelectedSupplement> _selectedSupplements = {};

  double get _supplementTotal {
    double total = 0;
    for (final s in _selectedSupplements.values) {
      total += s.price;
    }
    return total;
  }

  double get _memberPrice => widget.memberBasePrice + _supplementTotal;

  double get _guestsTotal {
    double total = 0;
    for (final g in _guests) {
      total += g.tariff.price;
    }
    return total;
  }

  double get _grandTotal => _memberPrice + _guestsTotal;

  void _addGuest() {
    if (widget.guestTariffs.isEmpty) return;
    setState(() {
      _guests.add(_GuestEntry(tariff: widget.guestTariffs.first));
    });
  }

  void _removeGuest(int index) {
    setState(() {
      _guests.removeAt(index);
    });
  }

  bool _validate() {
    for (final g in _guests) {
      if (g.prenom.trim().isEmpty || g.nom.trim().isEmpty) return false;
    }
    return true;
  }

  void _submit() {
    if (!_validate()) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Veuillez remplir le prénom et nom de chaque invité'),
          backgroundColor: Colors.redAccent,
        ),
      );
      return;
    }

    final guestsResult = _guests
        .map((g) => {
              'prenom': g.prenom.trim(),
              'nom': g.nom.trim(),
              'prix': g.tariff.price,
              'tariffId': g.tariff.id,
            })
        .toList();

    Navigator.of(context).pop({
      'guests': guestsResult,
      'supplements': _selectedSupplements.values.toList(),
      'supplementTotal': _supplementTotal,
      'memberPrice': _memberPrice,
      'totalPrice': _grandTotal,
    });
  }

  @override
  Widget build(BuildContext context) {
    return Dialog(
      backgroundColor: Colors.transparent,
      insetPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 460),
        child: _buildContent(context),
      ),
    );
  }

  Widget _buildContent(BuildContext context) {
    final supplements = widget.operation.supplements;
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Header
          Container(
            width: double.infinity,
            padding: const EdgeInsets.fromLTRB(20, 18, 20, 16),
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [AppColors.donkerblauw, AppColors.middenblauw],
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  "Confirmer l'inscription",
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  widget.operation.titre ?? '',
                  style: TextStyle(
                    color: Colors.white.withOpacity(0.85),
                    fontSize: 13,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
          ),

          // Scrollable body
          Flexible(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // -------- Section: Mon inscription --------
                  _sectionLabel('Mon inscription'),
                  const SizedBox(height: 8),
                  _buildSelfRow(),

                  // -------- Section: Suppléments (optional) --------
                  if (supplements.isNotEmpty) ...[
                    const SizedBox(height: 18),
                    _sectionLabel('Suppléments optionnels'),
                    const SizedBox(height: 8),
                    ...supplements.map(_buildSupplementRow),
                  ],

                  // -------- Section: Mes invités --------
                  const SizedBox(height: 18),
                  Row(
                    children: [
                      _sectionLabel('Mes invités'),
                      const Spacer(),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 2),
                        decoration: BoxDecoration(
                          color: AppColors.oranje.withOpacity(0.15),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: const Text(
                          'Famille / amis',
                          style: TextStyle(
                            color: AppColors.oranje,
                            fontSize: 11,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  if (_guests.isEmpty)
                    _emptyGuestsHint(),
                  for (int i = 0; i < _guests.length; i++) ...[
                    _buildGuestCard(i),
                    const SizedBox(height: 8),
                  ],
                  const SizedBox(height: 4),
                  _addGuestButton(),
                ],
              ),
            ),
          ),

          // -------- Footer: total + actions --------
          _buildFooter(),
        ],
      ),
    );
  }

  // ---------- Section helpers ----------

  Widget _sectionLabel(String text) {
    return Text(
      text.toUpperCase(),
      style: TextStyle(
        fontSize: 11,
        letterSpacing: 0.5,
        fontWeight: FontWeight.w600,
        color: AppColors.donkerblauw.withOpacity(0.6),
      ),
    );
  }

  Widget _buildSelfRow() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: AppColors.lichtblauw.withOpacity(0.18),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          CircleAvatar(
            radius: 16,
            backgroundColor: AppColors.middenblauw,
            child: Text(
              widget.memberInitials,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 12,
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  widget.memberDisplayName,
                  style: const TextStyle(
                    fontWeight: FontWeight.w600,
                    fontSize: 14,
                    color: AppColors.donkerblauw,
                  ),
                ),
                if (widget.memberRoleLabel != null)
                  Text(
                    widget.memberRoleLabel!,
                    style: TextStyle(
                      fontSize: 12,
                      color: AppColors.donkerblauw.withOpacity(0.6),
                    ),
                  ),
              ],
            ),
          ),
          Text(
            '${widget.memberBasePrice.toStringAsFixed(2)} €',
            style: const TextStyle(
              fontWeight: FontWeight.w600,
              fontSize: 14,
              color: AppColors.donkerblauw,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSupplementRow(Supplement supplement) {
    final selected = _selectedSupplements.containsKey(supplement.id);
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: InkWell(
        onTap: () {
          setState(() {
            if (selected) {
              _selectedSupplements.remove(supplement.id);
            } else {
              _selectedSupplements[supplement.id] = SelectedSupplement(
                id: supplement.id,
                name: supplement.name,
                price: supplement.price,
              );
            }
          });
        },
        borderRadius: BorderRadius.circular(10),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
          decoration: BoxDecoration(
            border: Border.all(
              color: selected
                  ? AppColors.middenblauw
                  : Colors.grey.withOpacity(0.3),
              width: selected ? 1.5 : 1,
            ),
            borderRadius: BorderRadius.circular(10),
            color: selected
                ? AppColors.middenblauw.withOpacity(0.06)
                : Colors.white,
          ),
          child: Row(
            children: [
              Icon(
                selected
                    ? Icons.check_box
                    : Icons.check_box_outline_blank,
                color: selected ? AppColors.middenblauw : Colors.grey,
                size: 20,
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  supplement.name,
                  style: const TextStyle(
                    fontSize: 14,
                    color: AppColors.donkerblauw,
                  ),
                ),
              ),
              Text(
                '+${supplement.price.toStringAsFixed(2)} €',
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: AppColors.donkerblauw.withOpacity(0.8),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _emptyGuestsHint() {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Text(
        'Aucun invité pour le moment.',
        style: TextStyle(
          fontSize: 12.5,
          fontStyle: FontStyle.italic,
          color: AppColors.donkerblauw.withOpacity(0.55),
        ),
      ),
    );
  }

  Widget _buildGuestCard(int index) {
    final guest = _guests[index];
    final hasMultipleTariffs = widget.guestTariffs.length > 1;

    return Container(
      padding: const EdgeInsets.fromLTRB(12, 10, 8, 10),
      decoration: BoxDecoration(
        color: AppColors.oranje.withOpacity(0.10),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.oranje.withOpacity(0.3), width: 1),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: TextFormField(
                  initialValue: guest.prenom,
                  onChanged: (v) => guest.prenom = v,
                  textCapitalization: TextCapitalization.words,
                  style: const TextStyle(
                    fontSize: 14,
                    color: AppColors.donkerblauw,
                  ),
                  decoration: _miniInputDecoration('Prénom'),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: TextFormField(
                  initialValue: guest.nom,
                  onChanged: (v) => guest.nom = v,
                  textCapitalization: TextCapitalization.words,
                  style: const TextStyle(
                    fontSize: 14,
                    color: AppColors.donkerblauw,
                  ),
                  decoration: _miniInputDecoration('Nom'),
                ),
              ),
              IconButton(
                icon: const Icon(Icons.delete_outline,
                    color: AppColors.oranje, size: 20),
                onPressed: () => _removeGuest(index),
                tooltip: 'Retirer',
                visualDensity: VisualDensity.compact,
              ),
            ],
          ),
          const SizedBox(height: 6),
          if (hasMultipleTariffs)
            _buildGuestTariffDropdown(index)
          else
            _buildSingleGuestTariffLabel(guest.tariff),
        ],
      ),
    );
  }

  Widget _buildGuestTariffDropdown(int index) {
    final guest = _guests[index];
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(
          color: AppColors.oranje.withOpacity(0.5),
          width: 1,
        ),
      ),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<Tariff>(
          value: guest.tariff,
          isExpanded: true,
          icon: const Icon(Icons.arrow_drop_down, color: AppColors.oranje),
          style: const TextStyle(
            fontSize: 13,
            color: AppColors.donkerblauw,
            fontWeight: FontWeight.w500,
          ),
          items: widget.guestTariffs
              .map(
                (t) => DropdownMenuItem<Tariff>(
                  value: t,
                  child: Text(
                    '${t.label.isNotEmpty ? t.label : "Invité"} — ${t.price.toStringAsFixed(2)} €',
                  ),
                ),
              )
              .toList(),
          onChanged: (t) {
            if (t == null) return;
            setState(() => guest.tariff = t);
          },
        ),
      ),
    );
  }

  Widget _buildSingleGuestTariffLabel(Tariff tariff) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        children: [
          const Icon(Icons.local_offer_outlined,
              size: 14, color: AppColors.oranje),
          const SizedBox(width: 6),
          Expanded(
            child: Text(
              tariff.label.isNotEmpty ? tariff.label : 'Tarif invité',
              style: const TextStyle(
                fontSize: 12.5,
                color: AppColors.donkerblauw,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
          Text(
            '${tariff.price.toStringAsFixed(2)} €',
            style: const TextStyle(
              fontSize: 12.5,
              color: AppColors.donkerblauw,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }

  InputDecoration _miniInputDecoration(String hint) {
    return InputDecoration(
      hintText: hint,
      hintStyle: TextStyle(
        color: AppColors.donkerblauw.withOpacity(0.4),
        fontSize: 13,
      ),
      isDense: true,
      filled: true,
      fillColor: Colors.white,
      contentPadding:
          const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: BorderSide(color: AppColors.oranje.withOpacity(0.4)),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: BorderSide(color: AppColors.oranje.withOpacity(0.4)),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: const BorderSide(color: AppColors.oranje, width: 1.5),
      ),
    );
  }

  Widget _addGuestButton() {
    return InkWell(
      onTap: _addGuest,
      borderRadius: BorderRadius.circular(10),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(vertical: 12),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: AppColors.oranje.withOpacity(0.6),
            width: 1,
            style: BorderStyle.solid,
          ),
          color: Colors.white,
        ),
        child: const Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.person_add_alt_1, size: 18, color: AppColors.oranje),
            SizedBox(width: 8),
            Text(
              'Ajouter un invité',
              style: TextStyle(
                color: AppColors.oranje,
                fontWeight: FontWeight.w600,
                fontSize: 14,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildFooter() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(20, 14, 20, 16),
      decoration: BoxDecoration(
        color: AppColors.lichtblauw.withOpacity(0.25),
        border: Border(
          top: BorderSide(color: Colors.grey.withOpacity(0.2)),
        ),
      ),
      child: Column(
        children: [
          Row(
            children: [
              const Text(
                'Total à payer',
                style: TextStyle(
                  fontSize: 14,
                  color: AppColors.donkerblauw,
                ),
              ),
              const Spacer(),
              Text(
                '${_grandTotal.toStringAsFixed(2)} €',
                style: const TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.bold,
                  color: AppColors.donkerblauw,
                ),
              ),
            ],
          ),
          if (_guests.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(
              'Vous + ${_guests.length} invité${_guests.length > 1 ? "s" : ""} · 1 paiement groupé',
              style: TextStyle(
                fontSize: 11.5,
                color: AppColors.donkerblauw.withOpacity(0.6),
              ),
            ),
          ],
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: TextButton(
                  onPressed: () => Navigator.of(context).pop(),
                  style: TextButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10),
                      side: BorderSide(color: Colors.grey.withOpacity(0.4)),
                    ),
                  ),
                  child: const Text(
                    'Annuler',
                    style: TextStyle(
                      color: AppColors.donkerblauw,
                      fontSize: 14,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                flex: 2,
                child: ElevatedButton.icon(
                  onPressed: _submit,
                  icon: const Icon(Icons.check_circle, size: 18),
                  label: const Text(
                    "S'inscrire",
                    style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.middenblauw,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10),
                    ),
                    elevation: 0,
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
