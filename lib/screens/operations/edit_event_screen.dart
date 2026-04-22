import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import '../../config/app_colors.dart';
import '../../config/firebase_config.dart';
import '../../models/operation.dart';
import '../../models/tariff.dart';
import '../../providers/activity_provider.dart';
import '../../providers/auth_provider.dart';
import '../../providers/member_provider.dart';
import '../../services/operation_service.dart';

/// Écran d'édition d'un événement existant
/// Accessible uniquement par le créateur de l'événement (organisateur_id)
/// Fonctionnalités: édition titre/description/dates/capacité/statut + gestion tarifs
class EditEventScreen extends StatefulWidget {
  final Operation operation;
  final String clubId;

  const EditEventScreen({
    Key? key,
    required this.operation,
    required this.clubId,
  }) : super(key: key);

  @override
  State<EditEventScreen> createState() => _EditEventScreenState();
}

class _EditEventScreenState extends State<EditEventScreen> {
  final OperationService _operationService = OperationService();
  final _formKey = GlobalKey<FormState>();

  // Controllers
  late TextEditingController _titreController;
  late TextEditingController _descriptionController;
  late TextEditingController _capaciteController;
  late TextEditingController _communicationController;

  // State
  late DateTime _dateDebut;
  DateTime? _dateFin;
  late String _statut;
  late List<_EditableTariff> _tariffs;
  bool _saving = false;
  bool _hasChanges = false;

  // Responsable (organisateur) — can be reassigned by admins or the original
  // creator. When updated, we rewrite both organisateur_id and
  // organisateur_nom so the phone-number lookup (which uses organisateur_id)
  // stays in sync with the displayed name.
  String? _organisateurId;
  String? _organisateurNom;
  List<_EncadrantOption> _encadrants = [];
  bool _loadingEncadrants = false;

  @override
  void initState() {
    super.initState();
    final op = widget.operation;

    _titreController = TextEditingController(text: op.titre);
    _descriptionController = TextEditingController(text: op.description ?? '');
    _capaciteController = TextEditingController(
      text: op.capaciteMax?.toString() ?? '',
    );
    _communicationController = TextEditingController(
      text: op.communication ?? '',
    );

    _dateDebut = op.dateDebut ?? DateTime.now();
    _dateFin = op.dateFin;
    _statut = op.statut;
    _organisateurId = op.organisateurId;
    _organisateurNom = op.organisateurNom;

    // Copier les tarifs existants en version éditable
    _tariffs = op.eventTariffs.map((t) => _EditableTariff.fromTariff(t)).toList();

    // Listeners pour détecter les changements
    _titreController.addListener(_markChanged);
    _descriptionController.addListener(_markChanged);
    _capaciteController.addListener(_markChanged);
    _communicationController.addListener(_markChanged);

    // Preload the list of encadrants so the picker opens instantly.
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadEncadrants());
  }

  /// Check whether the current user can change the responsable. Admins can
  /// always edit; otherwise only the original creator of the event. Falls
  /// back to `organisateur_id` for legacy events where `creator_user_id`
  /// wasn't recorded.
  bool get _canEditResponsable {
    final authProvider = context.read<AuthProvider>();
    final memberProvider = context.read<MemberProvider>();
    final currentUserId = authProvider.currentUser?.uid;
    if (currentUserId == null) return false;

    final role = memberProvider.appRole?.toLowerCase();
    if (role == 'admin' || role == 'superadmin') return true;

    final creatorId =
        widget.operation.creatorUserId ?? widget.operation.organisateurId;
    return creatorId != null && creatorId == currentUserId;
  }

  /// Query Firestore for all members flagged as "Encadrants" and cache them
  /// for the picker. We prefer the `clubStatuten` array (canonical in the
  /// rest of the codebase) and match case-insensitively on both the
  /// singular and plural forms.
  Future<void> _loadEncadrants() async {
    if (_loadingEncadrants) return;
    setState(() => _loadingEncadrants = true);
    try {
      final snapshot = await FirebaseFirestore.instance
          .collection('clubs')
          .doc(widget.clubId)
          .collection('members')
          .get();

      final options = <_EncadrantOption>[];
      for (final doc in snapshot.docs) {
        final data = doc.data();
        final statuten = data['clubStatuten'];
        final isEncadrant = statuten is List &&
            statuten.any((s) {
              final v = s.toString().toLowerCase().trim();
              return v == 'encadrant' || v == 'encadrants';
            });
        if (!isEncadrant) continue;

        final prenom = (data['prenom'] ?? '').toString().trim();
        final nom = (data['nom'] ?? '').toString().trim();
        final displayName = [prenom, nom]
            .where((p) => p.isNotEmpty)
            .join(' ')
            .trim();
        if (displayName.isEmpty) continue;

        options.add(_EncadrantOption(
          id: doc.id,
          displayName: displayName,
        ));
      }

      options.sort((a, b) =>
          a.displayName.toLowerCase().compareTo(b.displayName.toLowerCase()));

      if (mounted) {
        setState(() {
          _encadrants = options;
          _loadingEncadrants = false;
        });
      }
    } catch (e) {
      if (mounted) setState(() => _loadingEncadrants = false);
      debugPrint('❌ EditEventScreen: failed to load encadrants - $e');
    }
  }

  /// Open a bottom-sheet picker and, if the user taps an encadrant, rewrite
  /// both id and name so they stay in sync.
  Future<void> _pickResponsable() async {
    if (_loadingEncadrants && _encadrants.isEmpty) {
      // Still loading — wait until the list is ready.
      await _loadEncadrants();
    }

    final selected = await showModalBottomSheet<_EncadrantOption>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) {
        return SafeArea(
          child: DraggableScrollableSheet(
            initialChildSize: 0.7,
            minChildSize: 0.4,
            maxChildSize: 0.95,
            expand: false,
            builder: (_, scrollController) {
              return Column(
                children: [
                  const SizedBox(height: 8),
                  Container(
                    width: 40,
                    height: 4,
                    decoration: BoxDecoration(
                      color: Colors.grey[300],
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    'Choisir un responsable',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                      color: AppColors.donkerblauw,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Encadrants du club',
                    style: TextStyle(
                      fontSize: 12,
                      color: Colors.grey[600],
                    ),
                  ),
                  const SizedBox(height: 8),
                  const Divider(height: 1),
                  if (_encadrants.isEmpty)
                    Expanded(
                      child: Center(
                        child: Text(
                          _loadingEncadrants
                              ? 'Chargement...'
                              : 'Aucun encadrant trouvé',
                          style: TextStyle(color: Colors.grey[600]),
                        ),
                      ),
                    )
                  else
                    Expanded(
                      child: ListView.separated(
                        controller: scrollController,
                        itemCount: _encadrants.length,
                        separatorBuilder: (_, __) =>
                            Divider(height: 1, color: Colors.grey[200]),
                        itemBuilder: (_, i) {
                          final enc = _encadrants[i];
                          final isCurrent = enc.id == _organisateurId;
                          return ListTile(
                            leading: CircleAvatar(
                              backgroundColor:
                                  AppColors.lichtblauw.withOpacity(0.3),
                              child: Text(
                                enc.displayName.isNotEmpty
                                    ? enc.displayName[0].toUpperCase()
                                    : '?',
                                style: TextStyle(
                                  color: AppColors.donkerblauw,
                                  fontWeight: FontWeight.bold,
                                ),
                              ),
                            ),
                            title: Text(enc.displayName),
                            trailing: isCurrent
                                ? Icon(Icons.check_circle,
                                    color: AppColors.middenblauw)
                                : null,
                            onTap: () => Navigator.of(ctx).pop(enc),
                          );
                        },
                      ),
                    ),
                ],
              );
            },
          ),
        );
      },
    );

    if (selected != null && selected.id != _organisateurId) {
      setState(() {
        _organisateurId = selected.id;
        _organisateurNom = selected.displayName;
        _hasChanges = true;
      });
    }
  }

  @override
  void dispose() {
    _titreController.dispose();
    _descriptionController.dispose();
    _capaciteController.dispose();
    _communicationController.dispose();
    super.dispose();
  }

  void _markChanged() {
    if (!_hasChanges) setState(() => _hasChanges = true);
  }

  // ============================================================
  // TARIFF MANAGEMENT
  // ============================================================

  void _addTariff() {
    setState(() {
      _tariffs.add(_EditableTariff(
        id: 'tariff_${DateTime.now().millisecondsSinceEpoch}_${_tariffs.length}',
        label: '',
        category: 'membre',
        price: 0,
        isDefault: _tariffs.isEmpty,
        displayOrder: _tariffs.length,
      ));
      _hasChanges = true;
    });
  }

  void _removeTariff(int index) {
    setState(() {
      _tariffs.removeAt(index);
      _hasChanges = true;
    });
  }

  void _updateTariffLabel(int index, String label) {
    _tariffs[index].label = label;
    _tariffs[index].category = _deriveCategoryFromLabel(label);
    _markChanged();
  }

  void _updateTariffPrice(int index, String priceStr) {
    _tariffs[index].price = double.tryParse(priceStr) ?? 0;
    _markChanged();
  }

  String _deriveCategoryFromLabel(String label) {
    final normalized = label.toLowerCase().trim();
    if (normalized.contains('encadrant')) return 'encadrant';
    if (normalized.contains('ca') || normalized.contains('comité')) return 'ca';
    if (normalized.contains('junior')) return 'junior';
    if (normalized.contains('non-membre') || normalized.contains('non membre')) return 'non_membre';
    if (normalized.contains('membre')) return 'membre';
    return normalized;
  }

  // ============================================================
  // SAVE
  // ============================================================

  Future<void> _handleSave() async {
    if (!_formKey.currentState!.validate()) return;

    // Validation dates
    if (_dateFin != null && _dateFin!.isBefore(_dateDebut)) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('La date de fin doit être après la date de début'),
          backgroundColor: AppColors.error,
        ),
      );
      return;
    }

    setState(() => _saving = true);

    try {
      // Construire les tarifs pour Firestore
      final tariffsData = _tariffs
          .where((t) => t.label.trim().isNotEmpty)
          .map((t) => {
                'id': t.id,
                'label': t.label.trim(),
                'category': t.category,
                'price': t.price,
                'is_default': t.isDefault,
                'display_order': t.displayOrder,
              })
          .toList();

      // Calculer budget prévisionnel
      final capacity = int.tryParse(_capaciteController.text);
      final tariffObjects = _tariffs
          .where((t) => t.label.trim().isNotEmpty)
          .map((t) => Tariff(
                id: t.id,
                label: t.label,
                category: t.category,
                price: t.price,
                isDefault: t.isDefault,
                displayOrder: t.displayOrder,
              ))
          .toList();
      final budget = OperationService.computeBudgetPrevu(tariffObjects, capacity);

      final data = <String, dynamic>{
        'titre': _titreController.text.trim(),
        'description': _descriptionController.text.trim().isNotEmpty
            ? _descriptionController.text.trim()
            : null,
        'date_debut': Timestamp.fromDate(_dateDebut),
        'statut': _statut,
        'event_tariffs': tariffsData,
        'montant_prevu': budget,
        'communication': _communicationController.text.trim().isNotEmpty
            ? _communicationController.text.trim()
            : null,
      };

      // Persist organisateur change only if we have a valid id — and always
      // rewrite id + nom together so the phone-number lookup (keyed on id)
      // stays in sync with the label the user sees. Guarded by
      // `_canEditResponsable` on the UI side; the service layer / Firestore
      // rules enforce the same invariant server-side.
      if (_canEditResponsable &&
          _organisateurId != null &&
          _organisateurId!.isNotEmpty) {
        data['organisateur_id'] = _organisateurId;
        data['organisateur_nom'] = _organisateurNom ?? '';
      }

      // Date fin optionnelle
      if (_dateFin != null) {
        data['date_fin'] = Timestamp.fromDate(_dateFin!);
      } else {
        data['date_fin'] = FieldValue.delete();
      }

      // Capacité optionnelle
      if (_capaciteController.text.isNotEmpty) {
        data['capacite_max'] = int.tryParse(_capaciteController.text);
      } else {
        data['capacite_max'] = FieldValue.delete();
      }

      await _operationService.updateOperation(
        clubId: widget.clubId,
        operationId: widget.operation.id,
        data: data,
      );

      if (mounted) {
        // Refresh providers
        context.read<ActivityProvider>().refresh(widget.clubId);

        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Événement mis à jour'),
            backgroundColor: AppColors.success,
          ),
        );
        Navigator.of(context).pop(true); // true = changes saved
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Erreur: $e'),
            backgroundColor: AppColors.error,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  // ============================================================
  // BUILD
  // ============================================================

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        title: const Text(
          'Modifier l\'événement',
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
        ),
        backgroundColor: Colors.transparent,
        elevation: 0,
        iconTheme: const IconThemeData(color: Colors.white),
        leading: IconButton(
          icon: const Icon(Icons.close),
          onPressed: () {
            if (_hasChanges) {
              _showDiscardDialog();
            } else {
              Navigator.of(context).pop();
            }
          },
        ),
        actions: [
          TextButton(
            onPressed: _saving ? null : _handleSave,
            child: _saving
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(
                      color: Colors.white,
                      strokeWidth: 2,
                    ),
                  )
                : const Text(
                    'Enregistrer',
                    style: TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.bold,
                      fontSize: 15,
                    ),
                  ),
          ),
        ],
      ),
      body: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              AppColors.donkerblauw,
              AppColors.middenblauw.withOpacity(0.9),
              AppColors.lichtblauw.withOpacity(0.4),
              Colors.white,
            ],
            stops: const [0.0, 0.15, 0.3, 0.45],
          ),
        ),
        child: SafeArea(
          child: Form(
            key: _formKey,
            child: ListView(
              padding: const EdgeInsets.fromLTRB(24, 8, 24, 100),
              children: [
                // Titre
                _buildSectionCard(children: [
                  _buildLabel('Titre', required: true, icon: Icons.edit_note),
                  const SizedBox(height: 8),
                  TextFormField(
                    controller: _titreController,
                    decoration: _inputDecoration('Titre de l\'événement'),
                    validator: (v) =>
                        v == null || v.trim().isEmpty ? 'Le titre est requis' : null,
                  ),
                ]),
                const SizedBox(height: 16),

                // Description
                _buildSectionCard(children: [
                  _buildLabel('Description', icon: Icons.description),
                  const SizedBox(height: 8),
                  TextFormField(
                    controller: _descriptionController,
                    decoration: _inputDecoration('Description...'),
                    maxLines: 3,
                  ),
                ]),
                const SizedBox(height: 16),

                // Dates
                _buildSectionCard(children: [
                  _buildLabel('Date de début', required: true, icon: Icons.calendar_today),
                  const SizedBox(height: 8),
                  _buildDateTimeRow(
                    date: _dateDebut,
                    onDateChanged: (d) => setState(() {
                      _dateDebut = DateTime(d.year, d.month, d.day,
                          _dateDebut.hour, _dateDebut.minute);
                      _hasChanges = true;
                    }),
                    onTimeChanged: (t) => setState(() {
                      _dateDebut = DateTime(_dateDebut.year, _dateDebut.month,
                          _dateDebut.day, t.hour, t.minute);
                      _hasChanges = true;
                    }),
                  ),
                  const SizedBox(height: 16),
                  _buildLabel('Date de fin (optionnel)', icon: Icons.event),
                  const SizedBox(height: 8),
                  _buildDateTimeRow(
                    date: _dateFin,
                    onDateChanged: (d) => setState(() {
                      _dateFin = DateTime(d.year, d.month, d.day,
                          _dateFin?.hour ?? 18, _dateFin?.minute ?? 0);
                      _hasChanges = true;
                    }),
                    onTimeChanged: (t) {
                      if (_dateFin != null) {
                        setState(() {
                          _dateFin = DateTime(_dateFin!.year, _dateFin!.month,
                              _dateFin!.day, t.hour, t.minute);
                          _hasChanges = true;
                        });
                      }
                    },
                    allowClear: true,
                    onClear: () => setState(() {
                      _dateFin = null;
                      _hasChanges = true;
                    }),
                  ),
                ]),
                const SizedBox(height: 16),

                // Responsable (organisateur)
                _buildResponsableSection(),
                const SizedBox(height: 16),

                // Capacité
                _buildSectionCard(children: [
                  _buildLabel('Capacité max', icon: Icons.group),
                  const SizedBox(height: 8),
                  TextFormField(
                    controller: _capaciteController,
                    decoration: _inputDecoration('Illimité'),
                    keyboardType: TextInputType.number,
                  ),
                ]),
                const SizedBox(height: 16),

                // Communication (message organisateur)
                _buildSectionCard(children: [
                  _buildLabel('Message aux participants', icon: Icons.campaign),
                  const SizedBox(height: 8),
                  TextFormField(
                    controller: _communicationController,
                    decoration: _inputDecoration('Communication pour les inscrits...'),
                    maxLines: 4,
                  ),
                ]),
                const SizedBox(height: 16),

                // ========== TARIFS ==========
                _buildTariffsSection(),
                const SizedBox(height: 16),

                // Statut
                _buildSectionCard(children: [
                  _buildLabel('Statut', icon: Icons.flag),
                  const SizedBox(height: 8),
                  _buildStatusDropdown(),
                ]),
                const SizedBox(height: 24),
              ],
            ),
          ),
        ),
      ),
    );
  }

  // ============================================================
  // RESPONSABLE SECTION
  // ============================================================

  Widget _buildResponsableSection() {
    final canEdit = _canEditResponsable;
    final label = (_organisateurNom?.trim().isNotEmpty ?? false)
        ? _organisateurNom!.trim()
        : 'Non défini';
    final hasId = (_organisateurId?.trim().isNotEmpty ?? false);

    return _buildSectionCard(children: [
      _buildLabel('Responsable', icon: Icons.person),
      const SizedBox(height: 8),
      InkWell(
        onTap: canEdit ? _pickResponsable : null,
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
          decoration: BoxDecoration(
            color: canEdit ? Colors.grey[50] : Colors.grey[100],
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: Colors.grey[300]!),
          ),
          child: Row(
            children: [
              Icon(
                Icons.account_circle,
                size: 20,
                color: AppColors.middenblauw,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  label,
                  style: TextStyle(
                    fontSize: 14,
                    color: hasId
                        ? AppColors.donkerblauw
                        : Colors.grey[500],
                    fontWeight:
                        hasId ? FontWeight.w500 : FontWeight.normal,
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              if (canEdit)
                Icon(
                  _loadingEncadrants
                      ? Icons.hourglass_empty
                      : Icons.arrow_drop_down,
                  color: Colors.grey[600],
                )
              else
                Icon(Icons.lock_outline,
                    size: 16, color: Colors.grey[400]),
            ],
          ),
        ),
      ),
      if (!canEdit) ...[
        const SizedBox(height: 6),
        Text(
          'Seul l\'organisateur initial ou un admin peut modifier le responsable.',
          style: TextStyle(
            fontSize: 11,
            color: Colors.grey[600],
            fontStyle: FontStyle.italic,
          ),
        ),
      ],
    ]);
  }

  // ============================================================
  // TARIFFS SECTION
  // ============================================================

  Widget _buildTariffsSection() {
    return _buildSectionCard(children: [
      Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          _buildLabel('Tarifs', icon: Icons.receipt_long),
          TextButton.icon(
            onPressed: _addTariff,
            icon: const Icon(Icons.add, size: 18),
            label: const Text('Ajouter'),
            style: TextButton.styleFrom(
              foregroundColor: AppColors.middenblauw,
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            ),
          ),
        ],
      ),
      const SizedBox(height: 8),

      if (_tariffs.isEmpty)
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Colors.grey[50],
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: Colors.grey[200]!),
          ),
          child: Center(
            child: Text(
              'Aucun tarif défini.\nAppuyez sur "Ajouter" pour créer un tarif.',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 13,
                color: Colors.grey[500],
                fontStyle: FontStyle.italic,
              ),
            ),
          ),
        ),

      // Liste des tarifs éditables
      ...List.generate(_tariffs.length, (index) {
        return _buildTariffRow(index);
      }),
    ]);
  }

  Widget _buildTariffRow(int index) {
    final tariff = _tariffs[index];

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.lichtblauw.withOpacity(0.08),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: AppColors.lichtblauw.withOpacity(0.2)),
      ),
      child: Row(
        children: [
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
                contentPadding: const EdgeInsets.symmetric(
                    horizontal: 10, vertical: 10),
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
              onChanged: (v) => _updateTariffLabel(index, v),
            ),
          ),
          const SizedBox(width: 8),

          // Price input
          Expanded(
            flex: 2,
            child: TextFormField(
              initialValue: tariff.price > 0 ? tariff.price.toStringAsFixed(2) : '',
              decoration: InputDecoration(
                hintText: '0.00',
                hintStyle: TextStyle(color: Colors.grey[400], fontSize: 13),
                suffixText: '€',
                suffixStyle: TextStyle(
                  color: AppColors.middenblauw,
                  fontWeight: FontWeight.bold,
                ),
                filled: true,
                fillColor: Colors.white,
                isDense: true,
                contentPadding: const EdgeInsets.symmetric(
                    horizontal: 10, vertical: 10),
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
              onChanged: (v) => _updateTariffPrice(index, v),
            ),
          ),
          const SizedBox(width: 4),

          // Delete button
          IconButton(
            icon: Icon(Icons.close, size: 20, color: Colors.red[400]),
            onPressed: () => _removeTariff(index),
            padding: EdgeInsets.zero,
            constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
          ),
        ],
      ),
    );
  }

  // ============================================================
  // DISCARD DIALOG
  // ============================================================

  void _showDiscardDialog() {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Abandonner les modifications ?'),
        content: const Text(
            'Vous avez des modifications non enregistrées. Voulez-vous les abandonner ?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Continuer l\'édition'),
          ),
          TextButton(
            onPressed: () {
              Navigator.of(ctx).pop();
              Navigator.of(context).pop();
            },
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            child: const Text('Abandonner'),
          ),
        ],
      ),
    );
  }

  // ============================================================
  // UI HELPERS (identiques au wizard)
  // ============================================================

  Widget _buildStatusDropdown() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12),
      decoration: BoxDecoration(
        color: Colors.grey[50],
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.grey[300]!),
      ),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<String>(
          value: _statut,
          isExpanded: true,
          items: const [
            DropdownMenuItem(value: 'brouillon', child: Text('Brouillon')),
            DropdownMenuItem(value: 'ouvert', child: Text('Ouvert')),
            DropdownMenuItem(value: 'ferme', child: Text('Fermé')),
            DropdownMenuItem(value: 'annule', child: Text('Annulé')),
          ],
          onChanged: (v) {
            if (v != null) {
              setState(() {
                _statut = v;
                _hasChanges = true;
              });
            }
          },
        ),
      ),
    );
  }

  Widget _buildDateTimeRow({
    required DateTime? date,
    required ValueChanged<DateTime> onDateChanged,
    required ValueChanged<TimeOfDay> onTimeChanged,
    bool allowClear = false,
    VoidCallback? onClear,
  }) {
    final dateText = date != null
        ? DateFormat('dd/MM/yyyy').format(date)
        : 'Sélectionner';
    final timeText = date != null
        ? DateFormat('HH:mm').format(date)
        : '--:--';

    return Row(
      children: [
        Expanded(
          child: GestureDetector(
            onTap: () async {
              final picked = await showDatePicker(
                context: context,
                initialDate: date ?? DateTime.now(),
                firstDate: DateTime(2020),
                lastDate: DateTime(2030),
                locale: const Locale('fr', 'FR'),
              );
              if (picked != null) onDateChanged(picked);
            },
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
              decoration: BoxDecoration(
                color: Colors.grey[50],
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Colors.grey[300]!),
              ),
              child: Row(
                children: [
                  Icon(Icons.calendar_today,
                      size: 16, color: AppColors.middenblauw),
                  const SizedBox(width: 8),
                  Text(
                    dateText,
                    style: TextStyle(
                      fontSize: 14,
                      color: date != null
                          ? AppColors.donkerblauw
                          : Colors.grey[400],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
        const SizedBox(width: 12),
        GestureDetector(
          onTap: date != null || !allowClear
              ? () async {
                  final picked = await showTimePicker(
                    context: context,
                    initialTime: date != null
                        ? TimeOfDay.fromDateTime(date)
                        : const TimeOfDay(hour: 14, minute: 0),
                  );
                  if (picked != null) onTimeChanged(picked);
                }
              : null,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
            decoration: BoxDecoration(
              color: Colors.grey[50],
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: Colors.grey[300]!),
            ),
            child: Row(
              children: [
                Icon(Icons.access_time,
                    size: 16, color: AppColors.middenblauw),
                const SizedBox(width: 8),
                Text(
                  timeText,
                  style: TextStyle(
                    fontSize: 14,
                    color: date != null
                        ? AppColors.donkerblauw
                        : Colors.grey[400],
                  ),
                ),
              ],
            ),
          ),
        ),
        if (allowClear && date != null)
          IconButton(
            icon: Icon(Icons.close, size: 18, color: Colors.grey[400]),
            onPressed: onClear,
            padding: const EdgeInsets.all(4),
            constraints: const BoxConstraints(),
          ),
      ],
    );
  }

  Widget _buildSectionCard({required List<Widget> children}) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        boxShadow: [
          BoxShadow(
            color: AppColors.donkerblauw.withOpacity(0.08),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: children,
      ),
    );
  }

  Widget _buildLabel(String text, {bool required = false, IconData? icon}) {
    return Row(
      children: [
        if (icon != null) ...[
          Icon(icon, size: 16, color: AppColors.middenblauw),
          const SizedBox(width: 6),
        ],
        Text(
          required ? '$text *' : text,
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: AppColors.donkerblauw,
          ),
        ),
      ],
    );
  }

  InputDecoration _inputDecoration(String hint) {
    return InputDecoration(
      hintText: hint,
      hintStyle: TextStyle(color: Colors.grey[400]),
      filled: true,
      fillColor: Colors.grey[50],
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: Colors.grey[300]!),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: Colors.grey[300]!),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: AppColors.middenblauw, width: 2),
      ),
      contentPadding:
          const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
    );
  }
}

/// Classe helper pour les tarifs éditables (mutable)
class _EditableTariff {
  String id;
  String label;
  String category;
  double price;
  bool isDefault;
  int displayOrder;

  _EditableTariff({
    required this.id,
    required this.label,
    required this.category,
    required this.price,
    this.isDefault = false,
    this.displayOrder = 0,
  });

  factory _EditableTariff.fromTariff(Tariff t) {
    return _EditableTariff(
      id: t.id,
      label: t.label,
      category: t.category,
      price: t.price,
      isDefault: t.isDefault,
      displayOrder: t.displayOrder,
    );
  }
}

/// Lightweight representation of a member who can be picked as responsable.
/// We only need the id (to rewrite `organisateur_id` — the key for the
/// phone-number lookup) and a display label.
class _EncadrantOption {
  final String id;
  final String displayName;

  const _EncadrantOption({required this.id, required this.displayName});
}
