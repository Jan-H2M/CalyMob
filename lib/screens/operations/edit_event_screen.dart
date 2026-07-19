import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import '../../config/app_colors.dart';
import '../../models/operation.dart';
import '../../models/supplement.dart';
import '../../models/tariff.dart';
import '../../providers/activity_provider.dart';
import '../../providers/auth_provider.dart';
import '../../providers/member_provider.dart';
import '../../services/operation_service.dart';
import '../../utils/member_name.dart';

/// Écran d'édition d'un événement existant
/// Accessible par le créateur original, le responsable actuel ou un admin.
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
  DateTime? _registrationDeadline;
  late String _statut;
  late List<_EditableTariff> _tariffs;
  late List<_EditableSupplement> _supplements;
  late bool _priceTbd;
  late bool _allowGuests;
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
    _registrationDeadline = op.registrationDeadline;
    _statut = op.statut;
    _organisateurId = op.organisateurId;
    _organisateurNom = op.organisateurNom;
    _priceTbd = op.priceTbd;
    _allowGuests = op.allowGuests;

    // Copier les tarifs existants en version éditable
    _tariffs =
        op.eventTariffs.map((t) => _EditableTariff.fromTariff(t)).toList();
    // Copier les suppléments existants en version éditable
    _supplements = op.supplements
        .map((s) => _EditableSupplement.fromSupplement(s))
        .toList();

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

        final displayName = memberDisplayName(data, fallback: '');
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
    if (normalized.contains('non-membre') || normalized.contains('non membre'))
      return 'non_membre';
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
      // Construire les tarifs pour Firestore — bewaar de is_guest_tariff
      // flag zodat de "Invité" markering correct in Firestore terechtkomt.
      final tariffsData = _tariffs
          .where((t) => t.label.trim().isNotEmpty)
          .map((t) => {
                'id': t.id,
                'label': t.label.trim(),
                'category': t.category,
                'price': t.price,
                'is_default': t.isDefault,
                'is_guest_tariff': t.isGuestTariff,
                'display_order': t.displayOrder,
              })
          .toList();

      // Construire les suppléments pour Firestore
      final supplementsData = _supplements
          .where((s) => s.name.trim().isNotEmpty)
          .map((s) => {
                'id': s.id,
                'name': s.name.trim(),
                'price': s.price,
                'display_order': s.displayOrder,
              })
          .toList();

      // Calculer budget prévisionnel — alleen op niet-gast-tarieven, want
      // gasten zijn pas bevestigd zodra een lid hen toevoegt.
      final capacity = int.tryParse(_capaciteController.text);
      final tariffObjects = _tariffs
          .where((t) => t.label.trim().isNotEmpty && !t.isGuestTariff)
          .map((t) => Tariff(
                id: t.id,
                label: t.label,
                category: t.category,
                price: t.price,
                isDefault: t.isDefault,
                displayOrder: t.displayOrder,
              ))
          .toList();
      final budget =
          OperationService.computeBudgetPrevu(tariffObjects, capacity);

      final data = <String, dynamic>{
        'titre': _titreController.text.trim(),
        'description': _descriptionController.text.trim().isNotEmpty
            ? _descriptionController.text.trim()
            : null,
        'date_debut': Timestamp.fromDate(_dateDebut),
        'statut': _statut,
        'event_tariffs': tariffsData,
        'supplements': supplementsData,
        'price_tbd': _priceTbd,
        'allow_guests': _allowGuests,
        'montant_prevu': budget,
        'communication': _communicationController.text.trim().isNotEmpty
            ? _communicationController.text.trim()
            : null,
      };

      // Date butoir d'inscription — null = geen deadline gezet (Firestore
      // rule valt dan terug op date_debut - 24u). Schrijf delete weg
      // wanneer leeg zodat het veld effectief verdwijnt uit het doc.
      if (_registrationDeadline != null) {
        data['registration_deadline'] =
            Timestamp.fromDate(_registrationDeadline!);
      } else {
        data['registration_deadline'] = FieldValue.delete();
      }

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
                    validator: (v) => v == null || v.trim().isEmpty
                        ? 'Le titre est requis'
                        : null,
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
                  _buildLabel('Date de début',
                      required: true, icon: Icons.calendar_today),
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

                // ========== DATE BUTOIR D'INSCRIPTION ==========
                _buildDeadlineSection(),
                const SizedBox(height: 16),

                // Communication (message organisateur)
                _buildSectionCard(children: [
                  _buildLabel('Message aux participants', icon: Icons.campaign),
                  const SizedBox(height: 8),
                  TextFormField(
                    controller: _communicationController,
                    decoration:
                        _inputDecoration('Communication pour les inscrits...'),
                    maxLines: 4,
                  ),
                ]),
                const SizedBox(height: 16),

                // ========== PRIX À CONFIRMER ==========
                _buildPriceTbdSection(),
                const SizedBox(height: 16),

                // ========== AUTORISER LES INVITÉS EXTERNES ==========
                _buildAllowGuestsSection(),
                const SizedBox(height: 16),

                // ========== TARIFS ==========
                _buildTariffsSection(),
                const SizedBox(height: 16),

                // ========== SUPPLÉMENTS OPTIONNELS ==========
                _buildSupplementsSection(),
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
                    color: hasId ? AppColors.donkerblauw : Colors.grey[500],
                    fontWeight: hasId ? FontWeight.w500 : FontWeight.normal,
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
                Icon(Icons.lock_outline, size: 16, color: Colors.grey[400]),
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
              onChanged: (v) => _updateTariffLabel(index, v),
            ),
          ),
          const SizedBox(width: 8),

          // Price input
          Expanded(
            flex: 2,
            child: TextFormField(
              initialValue:
                  tariff.price > 0 ? tariff.price.toStringAsFixed(2) : '',
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
              onChanged: (v) => _updateTariffPrice(index, v),
            ),
          ),
          const SizedBox(width: 4),

          // Invité checkbox — alleen relevant wanneer "Autoriser les
          // invités externes" aanstaat (zelfde principe als CalyCompta).
          // Markeert deze tarief als gast-tarief (bv. "Invité adulte").
          if (_allowGuests)
            Tooltip(
              message:
                  'Marquer ce tarif comme tarif invité (sera utilisé quand un membre ajoute un invité externe)',
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Checkbox(
                    value: tariff.isGuestTariff,
                    onChanged: (v) {
                      setState(() {
                        tariff.isGuestTariff = v ?? false;
                        _hasChanges = true;
                      });
                    },
                    visualDensity: VisualDensity.compact,
                    materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  ),
                  const Text('Invité', style: TextStyle(fontSize: 12)),
                ],
              ),
            ),

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
  // SUPPLEMENT MANAGEMENT
  // ============================================================

  void _addSupplement() {
    setState(() {
      _supplements.add(_EditableSupplement(
        id: 'supp_${DateTime.now().millisecondsSinceEpoch}_${_supplements.length}',
        name: '',
        price: 0,
        displayOrder: _supplements.length,
      ));
      _hasChanges = true;
    });
  }

  void _removeSupplement(int index) {
    setState(() {
      _supplements.removeAt(index);
      _hasChanges = true;
    });
  }

  void _updateSupplementName(int index, String name) {
    _supplements[index].name = name;
    _markChanged();
  }

  void _updateSupplementPrice(int index, String priceStr) {
    _supplements[index].price =
        double.tryParse(priceStr.replaceAll(',', '.')) ?? 0;
    _markChanged();
  }

  Widget _buildSupplementsSection() {
    return _buildSectionCard(children: [
      Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          _buildLabel('Suppléments optionnels', icon: Icons.add_box_outlined),
          TextButton.icon(
            onPressed: _addSupplement,
            icon: const Icon(Icons.add, size: 18),
            label: const Text('Ajouter'),
            style: TextButton.styleFrom(
              foregroundColor: AppColors.middenblauw,
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            ),
          ),
        ],
      ),
      Padding(
        padding: const EdgeInsets.only(top: 2, bottom: 6),
        child: Text(
          'Options additionnelles que les membres peuvent sélectionner lors de l\'inscription (ex: Réservation Hamburger, location de matériel).',
          style: TextStyle(
            fontSize: 12,
            color: Colors.grey[600],
            fontStyle: FontStyle.italic,
          ),
        ),
      ),
      const SizedBox(height: 4),
      if (_supplements.isEmpty)
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: Colors.grey[50],
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: Colors.grey[200]!),
          ),
          child: Center(
            child: Text(
              'Aucun supplément défini.\nAppuyez sur "Ajouter" pour en créer un.',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 13,
                color: Colors.grey[500],
                fontStyle: FontStyle.italic,
              ),
            ),
          ),
        ),
      ...List.generate(_supplements.length, (index) {
        final s = _supplements[index];
        return Container(
          margin: const EdgeInsets.only(bottom: 10),
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: Colors.blue.shade50.withOpacity(0.4),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: Colors.blue.shade100),
          ),
          child: Row(
            children: [
              Expanded(
                flex: 3,
                child: TextFormField(
                  initialValue: s.name,
                  decoration: InputDecoration(
                    hintText: 'Nom (ex: Réservation Hamburger viande)',
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
                  onChanged: (v) => _updateSupplementName(index, v),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                flex: 2,
                child: TextFormField(
                  initialValue: s.price > 0 ? s.price.toStringAsFixed(2) : '',
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
                  onChanged: (v) => _updateSupplementPrice(index, v),
                ),
              ),
              const SizedBox(width: 4),
              IconButton(
                icon: Icon(Icons.close, size: 20, color: Colors.red[400]),
                onPressed: () => _removeSupplement(index),
                padding: EdgeInsets.zero,
                constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
              ),
            ],
          ),
        );
      }),
    ]);
  }

  // ============================================================
  // DEADLINE / FLAGS
  // ============================================================

  /// Veld voor de date butoir d'inscription. Datum + uur inputs zoals
  /// de date_debut/date_fin velden, plus een 'Effacer' knop om terug te
  /// vallen op de Firestore-default (date_debut - 24u).
  Widget _buildDeadlineSection() {
    return _buildSectionCard(children: [
      _buildLabel('Date butoir d\'inscription', icon: Icons.lock_clock),
      Padding(
        padding: const EdgeInsets.only(top: 2, bottom: 8),
        child: Text(
          'Optionnel — par défaut, 24h avant le début. Après cette date, '
          'les membres ne peuvent plus s\'inscrire, modifier ou se désinscrire '
          'depuis l\'app.',
          style: TextStyle(
            fontSize: 12,
            color: Colors.grey[600],
            fontStyle: FontStyle.italic,
          ),
        ),
      ),
      Row(
        children: [
          Expanded(
            child: InkWell(
              onTap: _pickDeadlineDate,
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                decoration: BoxDecoration(
                  color: Colors.grey[50],
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: Colors.grey[300]!),
                ),
                child: Row(
                  children: [
                    Icon(Icons.calendar_today,
                        size: 18, color: AppColors.middenblauw),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        _registrationDeadline != null
                            ? DateFormat('dd/MM/yyyy')
                                .format(_registrationDeadline!)
                            : 'Sélectionner',
                        style: TextStyle(
                          fontSize: 14,
                          color: _registrationDeadline != null
                              ? Colors.black87
                              : Colors.grey[500],
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: InkWell(
              onTap: _registrationDeadline != null ? _pickDeadlineTime : null,
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                decoration: BoxDecoration(
                  color: _registrationDeadline != null
                      ? Colors.grey[50]
                      : Colors.grey[100],
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: Colors.grey[300]!),
                ),
                child: Row(
                  children: [
                    Icon(Icons.schedule,
                        size: 18,
                        color: _registrationDeadline != null
                            ? AppColors.middenblauw
                            : Colors.grey[400]),
                    const SizedBox(width: 8),
                    Text(
                      _registrationDeadline != null
                          ? DateFormat('HH:mm').format(_registrationDeadline!)
                          : '--:--',
                      style: TextStyle(
                        fontSize: 14,
                        color: _registrationDeadline != null
                            ? Colors.black87
                            : Colors.grey[500],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          const SizedBox(width: 4),
          IconButton(
            icon: Icon(Icons.close, size: 20, color: Colors.red[400]),
            onPressed: _registrationDeadline == null
                ? null
                : () {
                    setState(() {
                      _registrationDeadline = null;
                      _hasChanges = true;
                    });
                  },
            tooltip: 'Effacer la date butoir (revient à la valeur par défaut)',
            padding: EdgeInsets.zero,
            constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
          ),
        ],
      ),
    ]);
  }

  Future<void> _pickDeadlineDate() async {
    final initial =
        _registrationDeadline ?? _dateDebut.subtract(const Duration(hours: 24));
    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime.now().subtract(const Duration(days: 30)),
      lastDate: DateTime.now().add(const Duration(days: 365 * 2)),
    );
    if (picked != null) {
      final base = _registrationDeadline ?? initial;
      setState(() {
        _registrationDeadline = DateTime(
          picked.year,
          picked.month,
          picked.day,
          base.hour,
          base.minute,
        );
        _hasChanges = true;
      });
    }
  }

  Future<void> _pickDeadlineTime() async {
    if (_registrationDeadline == null) return;
    final picked = await showTimePicker(
      context: context,
      initialTime: TimeOfDay.fromDateTime(_registrationDeadline!),
    );
    if (picked != null) {
      setState(() {
        _registrationDeadline = DateTime(
          _registrationDeadline!.year,
          _registrationDeadline!.month,
          _registrationDeadline!.day,
          picked.hour,
          picked.minute,
        );
        _hasChanges = true;
      });
    }
  }

  /// Toggle "Prix à confirmer" — wanneer aan, blijft het tarief verborgen
  /// voor leden tot de organisator een definitief bedrag communiceert.
  Widget _buildPriceTbdSection() {
    return _buildSectionCard(children: [
      Row(
        children: [
          const Text('💰', style: TextStyle(fontSize: 18)),
          const SizedBox(width: 8),
          const Expanded(
            child: Text(
              'Prix à confirmer',
              style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
            ),
          ),
          Switch(
            value: _priceTbd,
            onChanged: (v) {
              setState(() {
                _priceTbd = v;
                _hasChanges = true;
              });
            },
            activeColor: AppColors.middenblauw,
          ),
        ],
      ),
      Padding(
        padding: const EdgeInsets.only(top: 4),
        child: Text(
          'Les inscriptions restent ouvertes. Le prix sera communiqué ultérieurement aux inscrits.',
          style: TextStyle(
            fontSize: 12,
            color: Colors.grey[600],
            fontStyle: FontStyle.italic,
          ),
        ),
      ),
    ]);
  }

  /// Toggle "Autoriser les invités externes" — laat leden via CalyMob
  /// gasten (familie / vrienden) toevoegen die in 1 QR code mee betaald
  /// worden. Werkt enkel wanneer minstens 1 tarief is gemarkeerd als
  /// 'Invité' (zie checkbox op de tarief-rijen).
  Widget _buildAllowGuestsSection() {
    return _buildSectionCard(children: [
      Row(
        children: [
          const Text('👥', style: TextStyle(fontSize: 18)),
          const SizedBox(width: 8),
          const Expanded(
            child: Text(
              'Autoriser les invités externes',
              style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600),
            ),
          ),
          Switch(
            value: _allowGuests,
            onChanged: (v) {
              setState(() {
                _allowGuests = v;
                _hasChanges = true;
              });
            },
            activeColor: AppColors.middenblauw,
          ),
        ],
      ),
      Padding(
        padding: const EdgeInsets.only(top: 4),
        child: Text(
          'Les membres pourront ajouter famille / amis depuis CalyMob et tout payer en un seul QR. Cochez « Invité » sur les tarifs ci-dessous qui s\'appliquent à eux.',
          style: TextStyle(
            fontSize: 12,
            color: Colors.grey[600],
            fontStyle: FontStyle.italic,
          ),
        ),
      ),
    ]);
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
    final dateText =
        date != null ? DateFormat('dd/MM/yyyy').format(date) : 'Sélectionner';
    final timeText = date != null ? DateFormat('HH:mm').format(date) : '--:--';

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
                Icon(Icons.access_time, size: 16, color: AppColors.middenblauw),
                const SizedBox(width: 8),
                Text(
                  timeText,
                  style: TextStyle(
                    fontSize: 14,
                    color:
                        date != null ? AppColors.donkerblauw : Colors.grey[400],
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
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
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
  bool isGuestTariff;
  int displayOrder;

  _EditableTariff({
    required this.id,
    required this.label,
    required this.category,
    required this.price,
    this.isDefault = false,
    this.isGuestTariff = false,
    this.displayOrder = 0,
  });

  factory _EditableTariff.fromTariff(Tariff t) {
    return _EditableTariff(
      id: t.id,
      label: t.label,
      category: t.category,
      price: t.price,
      isDefault: t.isDefault,
      isGuestTariff: t.isGuestTariff,
      displayOrder: t.displayOrder,
    );
  }
}

/// Classe helper pour les suppléments éditables (mutable). Spiegelt
/// _EditableTariff zodat de UI-flow (add / remove / edit / autosave)
/// uniform werkt voor beide collecties.
class _EditableSupplement {
  String id;
  String name;
  double price;
  int displayOrder;

  _EditableSupplement({
    required this.id,
    required this.name,
    required this.price,
    this.displayOrder = 0,
  });

  factory _EditableSupplement.fromSupplement(Supplement s) {
    return _EditableSupplement(
      id: s.id,
      name: s.name,
      price: s.price,
      displayOrder: s.displayOrder,
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
