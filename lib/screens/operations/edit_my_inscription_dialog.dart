import 'package:flutter/material.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import '../../config/app_colors.dart';
import '../../models/operation.dart';
import '../../models/participant_operation.dart';
import '../../models/supplement.dart';
import '../../models/tariff.dart';
import '../../models/member_profile.dart';
import '../../services/operation_service.dart';
import 'add_guest_dialog.dart';

/// Dialog om een bestaande inschrijving te wijzigen (supplementen, gasten).
///
/// Gebaseerd op dezelfde stijl als [AddGuestDialog].
/// Toont de huidige supplementen als checked, bestaande gasten met edit/
/// verwijder, en laat de gebruiker nieuwe gasten toevoegen.
class EditMyInscriptionDialog extends StatefulWidget {
  final Operation operation;
  final ParticipantOperation currentInscription;
  final MemberProfile userProfile;
  final String clubId;

  const EditMyInscriptionDialog({
    super.key,
    required this.operation,
    required this.currentInscription,
    required this.userProfile,
    this.clubId = 'calypso',
  });

  @override
  State<EditMyInscriptionDialog> createState() =>
      _EditMyInscriptionDialogState();
}

class _EditMyInscriptionDialogState extends State<EditMyInscriptionDialog> {
  late Set<String> _initialSupplementIds;
  late Set<String> _selectedSupplementIds;

  /// Fetched guests linked to this participant (parent_inscription_id == participant.id).
  /// Each entry: {id (doc id of guest inscription), prenom, nom, prix, membreId}
  List<Map<String, dynamic>> _guests = [];

  /// Newly added guests during this edit session (not yet saved).
  /// Each entry: {prenom, nom, prix, tariffId}
  final List<Map<String, dynamic>> _newGuests = [];

  /// Guest doc IDs to remove (from _guests, keyed by 'id' field).
  final Set<String> _deletedGuestIds = {};

  bool _guestsLoaded = false;
  bool _saving = false;

  double get _oldSupplementTotal => widget.currentInscription.supplementTotal;

  double get _newSupplementTotal {
    double total = 0;
    for (final supp in widget.operation.supplements) {
      if (_selectedSupplementIds.contains(supp.id)) {
        total += supp.price;
      }
    }
    return total;
  }

  double get _newGuestTotal {
    double total = 0;
    for (final guest in _guests) {
      if (!_deletedGuestIds.contains(guest['id'] as String)) {
        total += (guest['prix'] as num).toDouble();
      }
    }
    for (final guest in _newGuests) {
      total += (guest['prix'] as num).toDouble();
    }
    return total;
  }

  double get _delta => (_newSupplementTotal + _newGuestTotal) -
      (_oldSupplementTotal + _oldGuestTotal);

  double get _oldGuestTotal {
    double total = 0;
    for (final guest in _guests) {
      total += (guest['prix'] as num).toDouble();
    }
    return total;
  }

  bool get _hasChanges {
    if (_selectedSupplementIds.length != _initialSupplementIds.length ||
        !_selectedSupplementIds.containsAll(_initialSupplementIds)) {
      return true;
    }
    if (_deletedGuestIds.isNotEmpty) return true;
    if (_newGuests.isNotEmpty) return true;
    return false;
  }

  List<Tariff> get _guestTariffs =>
      widget.operation.eventTariffs
          .where((t) => t.isGuestTariff)
          .toList();

  @override
  void initState() {
    super.initState();
    _initialSupplementIds =
        widget.currentInscription.selectedSupplements.map((s) => s.id).toSet();
    _selectedSupplementIds = Set.from(_initialSupplementIds);
    _loadGuests();
  }

  Future<void> _loadGuests() async {
    try {
      final snapshot = await FirebaseFirestore.instance
          .collection(
              'clubs/${widget.clubId}/operations/${widget.operation.id}/inscriptions')
          .where('parent_inscription_id', isEqualTo: widget.currentInscription.id)
          .get();

      final guests = snapshot.docs.map((doc) {
        final data = doc.data();
        return <String, dynamic>{
          'id': doc.id,
          'prenom': data['membre_prenom'] as String? ?? '',
          'nom': data['membre_nom'] as String? ?? '',
          'prix': (data['prix'] as num?)?.toDouble() ?? 0,
          'membreId': data['membre_id'] as String? ?? '',
        };
      }).toList();

      if (mounted) {
        setState(() {
          _guests = guests;
          _guestsLoaded = true;
        });
      }
    } catch (e) {
      debugPrint('Error loading guests: $e');
      if (mounted) {
        setState(() => _guestsLoaded = true);
      }
    }
  }

  Future<void> _addGuest() async {
    final result = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (_) => AddGuestDialog(
        availableGuestTariffs: _guestTariffs,
      ),
    );

    if (result != null && mounted) {
      setState(() {
        _newGuests.add({
          'prenom': result['prenom'] as String,
          'nom': result['nom'] as String,
          'prix': result['prix'] as double,
          'tariffId': result['tariffId'] as String?,
        });
      });
    }
  }

  Future<void> _save() async {
    if (_saving) return;

    // Validate: no empty guest fields
    for (final guest in _newGuests) {
      final prenom = (guest['prenom'] as String?)?.trim() ?? '';
      final nom = (guest['nom'] as String?)?.trim() ?? '';
      if (prenom.isEmpty || nom.isEmpty) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
                content:
                    Text('Veuillez remplir tous les champs des invites')),
          );
        }
        return;
      }
    }

    // Confirmation dialog for refunds
    if (_delta < 0 && widget.currentInscription.paye) {
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Confirmation'),
          content: Text(
            'Une demande de remboursement de ${_delta.abs().toStringAsFixed(2)} € sera creee. Continuer?',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(false),
              child: const Text('Annuler'),
            ),
            TextButton(
              onPressed: () => Navigator.of(ctx).pop(true),
              child: const Text('Continuer'),
            ),
          ],
        ),
      );
      if (confirmed != true) return;
    }

    setState(() => _saving = true);

    try {
      // Build guests list: existing (not deleted) + new guests
      final List<GuestUpdate> guestUpdates = [];

      // Existing guests that were NOT deleted: keep as-is (pass prenom/nom/prix)
      for (final guest in _guests) {
        if (!_deletedGuestIds.contains(guest['id'] as String)) {
          // Keep existing guest — no changes to them, just pass through
          guestUpdates.add(GuestUpdate(
            inscriptionId: guest['id'] as String,
            prenom: guest['prenom'] as String,
            nom: guest['nom'] as String,
            prix: (guest['prix'] as num).toDouble(),
          ));
        }
      }

      // New guests
      for (final guest in _newGuests) {
        guestUpdates.add(GuestUpdate(
          inscriptionId: null, // null = create new
          prenom: guest['prenom'] as String,
          nom: guest['nom'] as String,
          prix: (guest['prix'] as num).toDouble(),
          tariffId: guest['tariffId'] as String?,
        ));
      }

      // Guest IDs to remove
      final guestIdsToRemove = _guests
          .where((g) => _deletedGuestIds.contains(g['id'] as String))
          .map((g) => g['id'] as String)
          .toList();

      await OperationService().updateMyInscription(
        clubId: widget.clubId,
        operationId: widget.operation.id,
        inscriptionId: widget.currentInscription.id,
        selectedSupplements: widget.operation.supplements
            .where((s) => _selectedSupplementIds.contains(s.id))
            .map((s) => SelectedSupplement(id: s.id, name: s.name, price: s.price))
            .toList(),
        supplementTotal: _newSupplementTotal,
        guests: guestUpdates.isNotEmpty ? guestUpdates : null,
        guestIdsToRemove:
            guestIdsToRemove.isNotEmpty ? guestIdsToRemove : null,
      );

      if (mounted) {
        // Build the list of SelectedSupplement objects for the caller
        final supplements = widget.operation.supplements
            .where((s) => _selectedSupplementIds.contains(s.id))
            .map((s) => SelectedSupplement(
              id: s.id,
              name: s.name,
              price: s.price,
            ))
            .toList();

        Navigator.of(context).pop({
          'supplements': supplements,
          'supplementTotal': _newSupplementTotal,
          'delta': _delta,
        });
      }
    } catch (e) {
      debugPrint('Error saving inscription: $e');
      if (mounted) {
        setState(() => _saving = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
                'Erreur: ${e.toString().replaceFirst('Exception: ', '')}'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
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
                  color: AppColors.donkerblauw.withValues(alpha: 0.4),
                  blurRadius: 24,
                  offset: const Offset(0, 12),
                ),
              ],
            ),
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _buildHeader(),
                  const SizedBox(height: 24),
                  _buildMyInscriptionSection(),
                  if (widget.operation.supplements.isNotEmpty) ...[
                    const SizedBox(height: 20),
                    _buildSupplementsSection(),
                  ],
                  if (widget.operation.allowGuests) ...[
                    const SizedBox(height: 20),
                    _buildGuestsSection(),
                  ],
                  const SizedBox(height: 20),
                  _buildFooter(),
                  const SizedBox(height: 20),
                  _buildActionButtons(),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildHeader() {
    return Row(
      children: [
        Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            color: AppColors.oranje.withValues(alpha: 0.3),
            borderRadius: BorderRadius.circular(12),
          ),
          child: const Icon(
            Icons.edit,
            color: Colors.white,
            size: 24,
          ),
        ),
        const SizedBox(width: 14),
        const Expanded(
          child: Text(
            'Modifier mon inscription',
            style: TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.bold,
              color: Colors.white,
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildSectionLabel(String label) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 13,
          fontWeight: FontWeight.w600,
          color: Colors.white.withValues(alpha: 0.8),
          letterSpacing: 1.2,
        ),
      ),
    );
  }

  Widget _buildMyInscriptionSection() {
    final displayName = widget.currentInscription.membrePrenom != null
        ? '${widget.currentInscription.membrePrenom} ${widget.currentInscription.membreNom}'
        : widget.userProfile.fullName;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildSectionLabel('MON INSCRIPTION'),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          decoration: BoxDecoration(
            color: Colors.white.withValues(alpha: 0.95),
            borderRadius: BorderRadius.circular(14),
          ),
          child: Row(
            children: [
              const Icon(Icons.person, size: 20, color: AppColors.donkerblauw),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  displayName,
                  style: const TextStyle(
                    color: AppColors.donkerblauw,
                    fontSize: 15,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
              Text(
                '${widget.currentInscription.totalPrix.toStringAsFixed(2)} €',
                style: const TextStyle(
                  color: AppColors.donkerblauw,
                  fontSize: 15,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildSupplementsSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildSectionLabel('SUPPLEMENTS OPTIONNELS'),
        ...widget.operation.supplements
            .map((supp) => _buildSupplementTile(supp)),
      ],
    );
  }

  Widget _buildSupplementTile(Supplement supp) {
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
          color: Colors.white.withValues(alpha: 0.92),
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
                      color: AppColors.donkerblauw.withValues(alpha: 0.6),
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
  }

  Widget _buildGuestsSection() {
    final visibleGuests = _guests
        .where((g) => !_deletedGuestIds.contains(g['id'] as String))
        .toList();
    final hasAnyGuests = visibleGuests.isNotEmpty || _newGuests.isNotEmpty;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _buildSectionLabel('MES INVITES'),
        if (!_guestsLoaded)
          const Padding(
            padding: EdgeInsets.all(8),
            child: SizedBox(
              width: 20,
              height: 20,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                valueColor: AlwaysStoppedAnimation<Color>(Colors.white70),
              ),
            ),
          ),
        if (_guestsLoaded && !hasAnyGuests)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Text(
              'Aucun invite pour le moment',
              style: TextStyle(
                color: Colors.white.withValues(alpha: 0.7),
                fontSize: 14,
              ),
            ),
          ),
        // Existing guests
        ...visibleGuests.map((g) => _buildGuestCard(
              prenom: g['prenom'] as String? ?? '',
              nom: g['nom'] as String? ?? '',
              prix: (g['prix'] as num).toDouble(),
              isNew: false,
              onDelete: () {
                setState(() {
                  _deletedGuestIds.add(g['id'] as String);
                });
              },
            )),
        // New guests
        ..._newGuests.map((g) => _buildGuestCard(
              prenom: g['prenom'] as String? ?? '',
              nom: g['nom'] as String? ?? '',
              prix: (g['prix'] as num).toDouble(),
              isNew: true,
              onDelete: () {
                setState(() {
                  _newGuests.remove(g);
                });
              },
            )),
        const SizedBox(height: 8),
        // Add guest button
        TextButton.icon(
          onPressed: _addGuest,
          icon: Icon(
            Icons.person_add_alt_1,
            color: Colors.white.withValues(alpha: 0.9),
            size: 20,
          ),
          label: Text(
            'Ajouter un invite',
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.9),
              fontSize: 14,
              fontWeight: FontWeight.w500,
            ),
          ),
          style: TextButton.styleFrom(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
              side: BorderSide(
                color: Colors.white.withValues(alpha: 0.4),
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildGuestCard({
    required String prenom,
    required String nom,
    required double prix,
    required bool isNew,
    required VoidCallback onDelete,
  }) {
    return Container(
      margin: const EdgeInsets.only(bottom: 6),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: isNew
            ? Colors.greenAccent.withValues(alpha: 0.15)
            : Colors.white.withValues(alpha: 0.92),
        borderRadius: BorderRadius.circular(12),
        border: isNew
            ? Border.all(color: Colors.greenAccent.withValues(alpha: 0.4), width: 1)
            : null,
      ),
      child: Row(
        children: [
          Icon(
            isNew ? Icons.person_add : Icons.person,
            size: 18,
            color: isNew ? Colors.greenAccent : AppColors.donkerblauw,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '$prenom $nom',
                  style: TextStyle(
                    color:
                        isNew ? Colors.greenAccent.shade200 : AppColors.donkerblauw,
                    fontSize: 14,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                Text(
                  '${prix.toStringAsFixed(2)} €${isNew ? ' (nouveau)' : ''}',
                  style: TextStyle(
                    color: isNew
                        ? Colors.greenAccent.shade100
                        : AppColors.donkerblauw.withValues(alpha: 0.6),
                    fontSize: 12,
                  ),
                ),
              ],
            ),
          ),
          IconButton(
            icon: Icon(
              Icons.delete_outline,
              size: 20,
              color: Colors.red.shade300,
            ),
            onPressed: onDelete,
            padding: EdgeInsets.zero,
            constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
            splashRadius: 16,
          ),
        ],
      ),
    );
  }

  Widget _buildFooter() {
    final delta = _delta;
    final isPaid = widget.currentInscription.paye;

    String message;
    IconData? icon;
    Color? color;

    if (delta == 0) {
      message = 'Aucun changement de prix';
      icon = Icons.check_circle;
      color = AppColors.success;
    } else if (delta > 0) {
      message = 'Reste a payer: +${delta.toStringAsFixed(2)} €';
      icon = Icons.warning_amber;
      color = AppColors.oranje;
    } else if (!isPaid) {
      message = 'Pas encore paye';
      icon = null;
      color = Colors.white70;
    } else {
      message =
          'Remboursement a recevoir: -${delta.abs().toStringAsFixed(2)} €';
      icon = Icons.payment;
      color = AppColors.success;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          if (icon != null) ...[
            Icon(icon, size: 20, color: color),
            const SizedBox(width: 8),
          ],
          Expanded(
            child: Text(
              message,
              style: TextStyle(
                color: color,
                fontSize: 14,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildActionButtons() {
    return Row(
      children: [
        Expanded(
          child: TextButton(
            onPressed: _saving ? null : () => Navigator.of(context).pop(),
            style: TextButton.styleFrom(
              foregroundColor: Colors.white70,
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
                side: BorderSide(
                  color: Colors.white.withValues(alpha: 0.3),
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
            onPressed: (!_hasChanges || _saving) ? null : _save,
            icon: _saving
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      valueColor:
                          AlwaysStoppedAnimation<Color>(Colors.white),
                    ),
                  )
                : const Icon(Icons.save, size: 20),
            label: Text(
              _saving ? 'Enregistrement...' : 'Enregistrer',
              style: const TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.bold,
              ),
            ),
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.oranje,
              foregroundColor: Colors.white,
              disabledBackgroundColor: AppColors.oranje.withValues(alpha: 0.4),
              disabledForegroundColor: Colors.white.withValues(alpha: 0.6),
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(12),
              ),
              elevation: 0,
            ),
          ),
        ),
      ],
    );
  }
}
