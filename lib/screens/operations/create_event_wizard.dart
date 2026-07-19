import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import '../../config/app_colors.dart';
import '../../config/firebase_config.dart';
import '../../models/dive_location.dart';
import '../../models/tariff.dart';
import '../../providers/auth_provider.dart';
import '../../providers/member_provider.dart';
import '../../providers/activity_provider.dart';
import '../../services/dive_location_service.dart';
import '../../services/fiscal_year_service.dart';
import '../../services/operation_service.dart';
import '../../services/session_service.dart';
import '../../utils/member_name.dart';

/// Wizard de création d'événement en 2 étapes
/// Identique fonctionnellement à CreateEventWizard de CalyCompta
///
/// Étape 1/2 : Sélection du lieu de plongée
/// Étape 2/2 : Détails de l'événement
class CreateEventWizard extends StatefulWidget {
  /// Event category: 'plongee' ou 'sortie'
  final String eventCategory;

  const CreateEventWizard({
    Key? key,
    required this.eventCategory,
  }) : super(key: key);

  @override
  State<CreateEventWizard> createState() => _CreateEventWizardState();
}

class _CreateEventWizardState extends State<CreateEventWizard> {
  final String _clubId = FirebaseConfig.defaultClubId;
  final DiveLocationService _locationService = DiveLocationService();
  final OperationService _operationService = OperationService();

  // Wizard state
  int _currentStep = 1; // 1 = location, 2 = details
  bool _loadingLocations = false;
  List<DiveLocation> _locations = [];
  DiveLocation? _selectedLocation;
  String _searchQuery = '';

  // Form state (Étape 2)
  final _formKey = GlobalKey<FormState>();
  final _titreController = TextEditingController();
  final _descriptionController = TextEditingController();
  final _capaciteController = TextEditingController();
  final _budgetController = TextEditingController(text: '0.00');

  // Responsable picker state. On stocke id + nom ensemble pour que le lookup
  // du numéro de téléphone (via organisateur_id) reste cohérent avec le nom
  // affiché. Auparavant, un TextFormField libre permettait de saisir un nom
  // arbitraire, mais organisateur_id restait toujours userId -> mismatch.
  String? _organisateurId;
  String? _organisateurNom;
  List<_EncadrantOption> _encadrants = [];
  bool _loadingEncadrants = false;

  DateTime _dateDebut = DateTime(
    DateTime.now().year,
    DateTime.now().month,
    DateTime.now().day,
    14,
    0,
  );
  DateTime? _dateFin;
  String _statut = 'ouvert';
  List<_EditableTariff> _editableTariffs = [];
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    // Si plongée, commencer par la sélection du lieu (étape 1)
    // Si sortie, aller directement aux détails (étape 2 = manual)
    if (widget.eventCategory == 'sortie') {
      _currentStep = 2;
      _titreController.text = '';
    } else {
      _loadLocations();
    }

    // Pré-remplir l'organisateur avec l'utilisateur courant.
    // On écrit id + nom ensemble pour éviter le mismatch (ancien bug :
    // nom typé manuellement -> organisateur_id restait userId).
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final authProvider = context.read<AuthProvider>();
      final memberProvider = context.read<MemberProvider>();
      if (!mounted) return;
      setState(() {
        _organisateurId = authProvider.currentUser?.uid;
        _organisateurNom = memberProvider.displayName;
      });
      // Précharger la liste des encadrants pour que le picker s'ouvre vite.
      _loadEncadrants();
    });
  }

  @override
  void dispose() {
    _titreController.dispose();
    _descriptionController.dispose();
    _capaciteController.dispose();
    _budgetController.dispose();
    super.dispose();
  }

  // ============================================================
  // RESPONSABLE PICKER (encadrants)
  // ============================================================

  /// Charge la liste des encadrants du club pour le picker.
  /// Même logique que edit_event_screen.dart — on filtre sur `clubStatuten`
  /// contenant "encadrant"/"encadrants" (case-insensitive).
  Future<void> _loadEncadrants() async {
    if (_loadingEncadrants) return;
    setState(() => _loadingEncadrants = true);
    try {
      final snapshot = await FirebaseFirestore.instance
          .collection('clubs')
          .doc(_clubId)
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
      debugPrint('❌ CreateEventWizard: failed to load encadrants - $e');
    }
  }

  /// Ouvre un bottom-sheet picker ; si l'utilisateur choisit un encadrant,
  /// on réécrit id + nom ensemble.
  Future<void> _pickResponsable() async {
    if (_loadingEncadrants && _encadrants.isEmpty) {
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
      });
    }
  }

  /// Champ de sélection du responsable (bouton qui ouvre le picker).
  Widget _buildResponsableField() {
    final label = (_organisateurNom?.trim().isNotEmpty ?? false)
        ? _organisateurNom!.trim()
        : 'Choisir un responsable';
    final hasValue = (_organisateurId?.trim().isNotEmpty ?? false);

    return InkWell(
      onTap: _pickResponsable,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 14),
        decoration: BoxDecoration(
          color: Colors.grey[50],
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
                  color: hasValue ? AppColors.donkerblauw : Colors.grey[500],
                  fontWeight: hasValue ? FontWeight.w500 : FontWeight.normal,
                ),
                overflow: TextOverflow.ellipsis,
              ),
            ),
            Icon(
              _loadingEncadrants
                  ? Icons.hourglass_empty
                  : Icons.arrow_drop_down,
              color: Colors.grey[600],
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _loadLocations() async {
    setState(() => _loadingLocations = true);
    try {
      final locs = await _locationService.getAllLocations(_clubId);
      setState(() {
        _locations = locs;
        _loadingLocations = false;
      });
    } catch (e) {
      setState(() => _loadingLocations = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Erreur chargement des lieux: $e')),
        );
      }
    }
  }

  void _onLocationSelected(DiveLocation location) {
    setState(() {
      _selectedLocation = location;

      // Pré-remplir avec les données du lieu (identique à CalyCompta)
      _titreController.text = location.name;
      _descriptionController.text = location.description ?? '';
      // Convertir locatie-tarieven naar bewerkbare tarieven
      _editableTariffs =
          location.tariffs.map((t) => _EditableTariff.fromTariff(t)).toList();

      // Recalculer budget
      _recalculateBudget();

      // Passer à l'étape 2
      _currentStep = 2;
    });
  }

  void _onCreateManual() {
    // Passer directement à l'étape détails sans lieu sélectionné
    // L'utilisateur pourra remplir le titre et les détails manuellement
    setState(() {
      _selectedLocation = null;
      _titreController.text = '';
      _descriptionController.text = '';
      _editableTariffs = [];
      _currentStep = 2;
    });
  }

  void _recalculateBudget() {
    final capacity = int.tryParse(_capaciteController.text);
    // Converteer editeerbare tarieven naar Tariff objecten voor de berekening
    final tariffObjects = _editableTariffs
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
    _budgetController.text = budget.toStringAsFixed(2);
  }

  Future<void> _handleSubmit() async {
    if (!_formKey.currentState!.validate()) return;
    if (_titreController.text.trim().isEmpty) return;

    // Validation: date_fin doit être après date_debut
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
      final authProvider = context.read<AuthProvider>();
      final userId = authProvider.currentUser?.uid ?? '';
      final isDive =
          widget.eventCategory == 'plongee' || _selectedLocation != null;

      // Refresh session to prevent permission-denied on expired session
      await SessionService().touchActivity();

      // Lookup dynamique de l'année fiscale ouverte (mirror CalyCompta)
      // La règle Firestore `canModifyFiscalYearData` exige que le document
      // `fiscal_years/{id}` existe et ait `status == 'open'`. Hardcoder
      // `FY${year}` provoque permission-denied si l'ID diffère ou si l'année
      // n'est pas encore ouverte.
      final fiscalYearId =
          await FiscalYearService().getCurrentOpenFiscalYearId(_clubId);
      if (fiscalYearId == null) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text(
                'Aucune année fiscale ouverte. Contactez un administrateur pour ouvrir l\'année.',
              ),
              backgroundColor: AppColors.error,
              duration: Duration(seconds: 6),
            ),
          );
          setState(() => _saving = false);
        }
        return;
      }

      // Generate event number
      final eventNumber =
          await _operationService.generateEventNumber(_clubId, isDive);

      // Build tariffs data vanuit editeerbare tarieven
      final tariffsData = _editableTariffs
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

      final data = {
        'type': 'evenement',
        'titre': _titreController.text.trim(),
        'description': _descriptionController.text.trim().isNotEmpty
            ? _descriptionController.text.trim()
            : null,
        'montant_prevu': double.tryParse(_budgetController.text) ?? 0,
        'date_debut': Timestamp.fromDate(_dateDebut),
        if (_dateFin != null) 'date_fin': Timestamp.fromDate(_dateFin!),
        'statut': _statut,
        'event_category': isDive ? 'plongee' : 'sortie',
        'event_number': eventNumber,
        'lieu': _selectedLocation?.name ?? '',
        if (_selectedLocation != null) 'lieu_id': _selectedLocation!.id,
        if (_capaciteController.text.isNotEmpty)
          'capacite_max': int.tryParse(_capaciteController.text),
        // Écrire id + nom ensemble depuis le picker pour que le lookup du
        // numéro de téléphone (keyed sur organisateur_id) reste cohérent
        // avec le nom affiché. Fallback sur userId si le picker n'a pas
        // encore été initialisé (edge case très rare).
        'organisateur_nom': (_organisateurNom ?? '').trim(),
        'organisateur_id':
            (_organisateurId != null && _organisateurId!.isNotEmpty)
                ? _organisateurId
                : userId,
        'event_tariffs': tariffsData,
        'club_id': _clubId,
        'fiscal_year_id': fiscalYearId,
        // Source tag (keep 'manual' for consistency with CalyCompta).
        'created_by': 'manual',
        // Firebase UID of the original creator — used to authorize later
        // responsable changes. Distinct from created_by source tag above.
        'creator_user_id': userId,
      };

      await _operationService.createOperation(clubId: _clubId, data: data);

      // Refresh activity list
      if (mounted) {
        context.read<ActivityProvider>().refresh(_clubId);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Événement créé avec succès'),
            backgroundColor: AppColors.success,
          ),
        );
        Navigator.of(context).pop(); // Return to list
      }
    } on FirebaseException catch (e) {
      if (!mounted) return;
      final isPermission = e.code == 'permission-denied';
      final msg = isPermission
          ? 'Permission refusée. Vérifiez que l\'année fiscale est ouverte ou contactez un administrateur.'
          : 'Erreur Firestore (${e.code}) : ${e.message ?? e.code}';
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(msg),
          backgroundColor: AppColors.error,
          duration: const Duration(seconds: 6),
        ),
      );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Erreur lors de la création: $e'),
            backgroundColor: AppColors.error,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.backgroundGrey,
      appBar: AppBar(
        title: const Text(
          'Nouvel événement',
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
        ),
        backgroundColor: AppColors.donkerblauw,
        elevation: 0,
        iconTheme: const IconThemeData(color: Colors.white),
        leading: _currentStep == 2 &&
                widget.eventCategory == 'plongee' &&
                _selectedLocation != null
            ? IconButton(
                icon: const Icon(Icons.arrow_back),
                tooltip: 'Retour au choix du lieu',
                onPressed: () {
                  setState(() {
                    _currentStep = 1;
                    _selectedLocation = null;
                  });
                },
              )
            : IconButton(
                icon: const Icon(Icons.close),
                onPressed: () => Navigator.of(context).pop(),
              ),
      ),
      body: SafeArea(
        child: Column(
          children: [
            // Step indicator
            _buildStepIndicator(),
            // Content
            Expanded(
              child: _currentStep == 1
                  ? _buildLocationStep()
                  : _buildDetailsStep(),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildStepIndicator() {
    final isStep1 = _currentStep == 1;
    final showSteps = widget.eventCategory == 'plongee';

    if (!showSteps && widget.eventCategory == 'sortie') {
      // Sortie: no step indicator (direct to details)
      return const SizedBox(height: 8);
    }

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
      child: Row(
        children: [
          _buildStepDot(1, isStep1 || _currentStep == 2),
          Expanded(
            child: Container(
              height: 2,
              color:
                  _currentStep >= 2 ? AppColors.donkerblauw : Colors.grey[300],
            ),
          ),
          _buildStepDot(2, _currentStep == 2),
        ],
      ),
    );
  }

  Widget _buildStepDot(int step, bool active) {
    return Column(
      children: [
        Container(
          width: 28,
          height: 28,
          decoration: BoxDecoration(
            color: active ? AppColors.donkerblauw : Colors.grey[300],
            shape: BoxShape.circle,
          ),
          child: Center(
            child: Text(
              '$step',
              style: TextStyle(
                color: active ? Colors.white : Colors.grey[700],
                fontWeight: FontWeight.bold,
                fontSize: 14,
              ),
            ),
          ),
        ),
        const SizedBox(height: 4),
        Text(
          step == 1 ? 'Lieu' : 'Détails',
          style: TextStyle(
            color: active ? AppColors.donkerblauw : Colors.grey[600],
            fontSize: 11,
            fontWeight: active ? FontWeight.w600 : FontWeight.normal,
          ),
        ),
      ],
    );
  }

  // ============================================================
  // ÉTAPE 1 : Sélection du lieu
  // ============================================================

  Widget _buildLocationStep() {
    final filteredLocations = _locations.where((loc) {
      if (_searchQuery.isEmpty) return true;
      final q = _searchQuery.toLowerCase();
      return loc.name.toLowerCase().contains(q) ||
          loc.country.toLowerCase().contains(q);
    }).toList();

    return ListView(
      padding: const EdgeInsets.only(bottom: 24),
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(24, 8, 24, 4),
          child: Text(
            'Étape 1/2 : Sélection du lieu',
            style: TextStyle(
              fontSize: 13,
              color: Colors.grey[600],
              fontWeight: FontWeight.w500,
            ),
          ),
        ),
        const Padding(
          padding: EdgeInsets.fromLTRB(24, 0, 24, 6),
          child: Text(
            'Choisir un lieu de plongée',
            style: TextStyle(
              fontSize: 20,
              color: AppColors.donkerblauw,
              fontWeight: FontWeight.bold,
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Text(
            'Sélectionnez un lieu pour pré-remplir les tarifs et les informations de l\'événement.',
            style: TextStyle(
              fontSize: 13,
              color: Colors.grey[700],
            ),
          ),
        ),

        // "Créer manuellement" button
        Padding(
          padding: const EdgeInsets.fromLTRB(24, 16, 24, 8),
          child: _buildManualCreateButton(),
        ),

        // Search bar
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 8),
          child: _buildSearchBar(),
        ),

        if (_loadingLocations)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 48),
            child: Center(
              child: CircularProgressIndicator(color: AppColors.middenblauw),
            ),
          )
        else if (filteredLocations.isEmpty)
          _buildEmptyLocations()
        else
          Padding(
            padding: const EdgeInsets.fromLTRB(24, 0, 24, 0),
            child: Column(
              children: [
                for (final location in filteredLocations)
                  _buildLocationCard(location),
              ],
            ),
          ),
      ],
    );
  }

  Widget _buildManualCreateButton() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.grey[300]!),
        boxShadow: [
          BoxShadow(
            color: AppColors.donkerblauw.withOpacity(0.04),
            blurRadius: 4,
            offset: const Offset(0, 1),
          ),
        ],
      ),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final textScale = MediaQuery.textScalerOf(context).scale(1);
          final stacked = constraints.maxWidth < 420 || textScale > 1.35;

          final label = Text(
            'Événement hors plongée ou lieu non répertorié ?',
            style: TextStyle(
              fontSize: 13,
              color: Colors.grey[700],
            ),
          );

          final button = ElevatedButton(
            onPressed: _saving ? null : _onCreateManual,
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.middenblauw,
              foregroundColor: Colors.white,
              elevation: 0,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(10),
              ),
            ),
            child: const Text(
              'Créer manuellement',
              style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
            ),
          );

          if (stacked) {
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                label,
                const SizedBox(height: 12),
                button,
              ],
            );
          }

          return Row(
            children: [
              Expanded(child: label),
              const SizedBox(width: 12),
              Flexible(
                child: Align(
                  alignment: Alignment.centerRight,
                  child: button,
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _buildSearchBar() {
    return TextField(
      onChanged: (value) => setState(() => _searchQuery = value),
      style: const TextStyle(
        color: AppColors.donkerblauw,
        fontSize: 15,
      ),
      cursorColor: AppColors.middenblauw,
      decoration: InputDecoration(
        hintText: 'Rechercher un lieu…',
        hintStyle: TextStyle(color: Colors.grey[500]),
        prefixIcon: Icon(Icons.search, color: AppColors.middenblauw),
        suffixIcon: _searchQuery.isNotEmpty
            ? IconButton(
                icon: Icon(Icons.close, color: Colors.grey[500], size: 20),
                onPressed: () => setState(() => _searchQuery = ''),
                tooltip: 'Effacer',
              )
            : null,
        filled: true,
        fillColor: Colors.white,
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: Colors.grey[300]!),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.middenblauw, width: 2),
        ),
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      ),
    );
  }

  Widget _buildEmptyLocations() {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 48),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.location_off, size: 48, color: Colors.grey[400]),
          const SizedBox(height: 16),
          Text(
            _searchQuery.isNotEmpty
                ? 'Aucun lieu trouvé'
                : 'Aucun lieu configuré',
            style: TextStyle(color: Colors.grey[600], fontSize: 16),
          ),
          if (_searchQuery.isEmpty) ...[
            const SizedBox(height: 12),
            TextButton(
              onPressed: _loadLocations,
              child: const Text(
                'Rafraîchir',
                style: TextStyle(color: AppColors.middenblauw),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildLocationCard(DiveLocation location) {
    final isSelected = _selectedLocation?.id == location.id;

    return GestureDetector(
      onTap: () => _onLocationSelected(location),
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: isSelected ? AppColors.middenblauw : Colors.grey[200]!,
            width: isSelected ? 2 : 1,
          ),
          boxShadow: [
            BoxShadow(
              color: AppColors.donkerblauw.withOpacity(0.05),
              blurRadius: 6,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Name + country
                  Row(
                    children: [
                      Icon(Icons.location_on,
                          size: 18, color: AppColors.middenblauw),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          location.name,
                          style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                            color: AppColors.donkerblauw,
                          ),
                        ),
                      ),
                      Text(
                        location.country,
                        style: TextStyle(
                          fontSize: 12,
                          color: Colors.grey[500],
                        ),
                      ),
                    ],
                  ),
                  // Description
                  if (location.description != null &&
                      location.description!.isNotEmpty) ...[
                    const SizedBox(height: 6),
                    Text(
                      location.description!,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(fontSize: 13, color: Colors.grey[600]),
                    ),
                  ],
                  // Tariffs
                  if (location.tariffs.isNotEmpty) ...[
                    const SizedBox(height: 10),
                    Wrap(
                      spacing: 8,
                      runSpacing: 6,
                      children: location.tariffs.map((tariff) {
                        return Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 10, vertical: 4),
                          decoration: BoxDecoration(
                            color: AppColors.lichtblauw.withOpacity(0.15),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Text(
                                tariff.label,
                                style: TextStyle(
                                  fontSize: 12,
                                  color: AppColors.donkerblauw,
                                ),
                              ),
                              const SizedBox(width: 4),
                              Text(
                                '${tariff.price.toStringAsFixed(0)}€',
                                style: TextStyle(
                                  fontSize: 12,
                                  fontWeight: FontWeight.bold,
                                  color: AppColors.middenblauw,
                                ),
                              ),
                            ],
                          ),
                        );
                      }).toList(),
                    ),
                  ],
                ],
              ),
            ),
            if (isSelected) ...[
              const SizedBox(width: 8),
              Container(
                width: 28,
                height: 28,
                decoration: BoxDecoration(
                  color: AppColors.middenblauw,
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.check, color: Colors.white, size: 18),
              ),
            ],
          ],
        ),
      ),
    );
  }

  // ============================================================
  // ÉTAPE 2 : Détails de l'événement
  // ============================================================

  Widget _buildDetailsStep() {
    return Form(
      key: _formKey,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(24, 8, 24, 100),
        children: [
          // Step indicator text
          if (widget.eventCategory == 'plongee') ...[
            Text(
              'Étape 2/2 : Détails de l\'événement',
              style: TextStyle(
                fontSize: 13,
                color: Colors.grey[600],
                fontWeight: FontWeight.w500,
              ),
            ),
            const SizedBox(height: 16),
          ],

          // Selected location badge (read-only)
          if (_selectedLocation != null) _buildSelectedLocationBadge(),

          // Titre *
          _buildSectionCard(
            children: [
              _buildLabel('Titre de l\'événement',
                  required: true, icon: Icons.edit_note),
              const SizedBox(height: 8),
              TextFormField(
                controller: _titreController,
                decoration: _inputDecoration('Ex: Plongée Zélande Avril 2026'),
                validator: (value) => value == null || value.trim().isEmpty
                    ? 'Le titre est requis'
                    : null,
              ),
            ],
          ),
          const SizedBox(height: 16),

          // Description
          _buildSectionCard(
            children: [
              _buildLabel('Description', icon: Icons.description),
              const SizedBox(height: 8),
              TextFormField(
                controller: _descriptionController,
                decoration: _inputDecoration('Description de l\'événement...'),
                maxLines: 3,
              ),
            ],
          ),
          const SizedBox(height: 16),

          // Dates
          _buildSectionCard(
            children: [
              _buildLabel('Date et heure de début',
                  required: true, icon: Icons.calendar_today),
              const SizedBox(height: 8),
              _buildDateTimeRow(
                date: _dateDebut,
                onDateChanged: (date) => setState(() {
                  _dateDebut = DateTime(
                    date.year,
                    date.month,
                    date.day,
                    _dateDebut.hour,
                    _dateDebut.minute,
                  );
                }),
                onTimeChanged: (time) => setState(() {
                  _dateDebut = DateTime(
                    _dateDebut.year,
                    _dateDebut.month,
                    _dateDebut.day,
                    time.hour,
                    time.minute,
                  );
                }),
              ),
              const SizedBox(height: 16),
              _buildLabel('Date et heure de fin (optionnel)',
                  icon: Icons.event),
              const SizedBox(height: 8),
              _buildDateTimeRow(
                date: _dateFin,
                onDateChanged: (date) => setState(() {
                  _dateFin = DateTime(
                    date.year,
                    date.month,
                    date.day,
                    _dateFin?.hour ?? 18,
                    _dateFin?.minute ?? 0,
                  );
                }),
                onTimeChanged: (time) {
                  if (_dateFin != null) {
                    setState(() {
                      _dateFin = DateTime(
                        _dateFin!.year,
                        _dateFin!.month,
                        _dateFin!.day,
                        time.hour,
                        time.minute,
                      );
                    });
                  }
                },
                allowClear: true,
                onClear: () => setState(() => _dateFin = null),
              ),
            ],
          ),
          const SizedBox(height: 16),

          // Capacité & Budget
          _buildSectionCard(
            children: [
              Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _buildLabel('Capacité max', icon: Icons.group),
                        const SizedBox(height: 8),
                        TextFormField(
                          controller: _capaciteController,
                          decoration: _inputDecoration('Illimité'),
                          keyboardType: TextInputType.number,
                          onChanged: (_) => _recalculateBudget(),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _buildLabel('Budget prévisionnel', icon: Icons.euro),
                        const SizedBox(height: 8),
                        TextFormField(
                          controller: _budgetController,
                          decoration: _inputDecoration('0.00'),
                          keyboardType: const TextInputType.numberWithOptions(
                              decimal: true),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 16),

          // Responsable (organisateur) — picker encadrants
          _buildSectionCard(
            children: [
              _buildLabel('Responsable', icon: Icons.person),
              const SizedBox(height: 8),
              _buildResponsableField(),
            ],
          ),
          const SizedBox(height: 16),

          // Tarifs (éditables — pré-remplis depuis le lieu si applicable)
          _buildTariffsSection(),
          const SizedBox(height: 16),

          // Statut
          _buildSectionCard(
            children: [
              _buildLabel('Statut', icon: Icons.flag),
              const SizedBox(height: 8),
              _buildStatusDropdown(),
            ],
          ),
          const SizedBox(height: 24),

          // Submit button
          _buildSubmitButton(),
        ],
      ),
    );
  }

  Widget _buildSelectedLocationBadge() {
    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.middenblauw.withOpacity(0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: AppColors.middenblauw.withOpacity(0.3)),
      ),
      child: Row(
        children: [
          Icon(Icons.location_on, color: AppColors.middenblauw, size: 20),
          const SizedBox(width: 8),
          Text(
            'Lieu sélectionné :',
            style: TextStyle(
              fontSize: 13,
              color: AppColors.donkerblauw.withOpacity(0.7),
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              '${_selectedLocation!.name} (${_selectedLocation!.country})',
              style: TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.bold,
                color: AppColors.donkerblauw,
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ============================================================
  // TARIFF MANAGEMENT (identiek aan edit_event_screen)
  // ============================================================

  void _addTariff() {
    setState(() {
      _editableTariffs.add(_EditableTariff(
        id: 'tariff_${DateTime.now().millisecondsSinceEpoch}_${_editableTariffs.length}',
        label: '',
        category: 'membre',
        price: 0,
        isDefault: _editableTariffs.isEmpty,
        displayOrder: _editableTariffs.length,
      ));
    });
  }

  void _removeTariff(int index) {
    setState(() {
      _editableTariffs.removeAt(index);
      _recalculateBudget();
    });
  }

  void _updateTariffLabel(int index, String label) {
    _editableTariffs[index].label = label;
    _editableTariffs[index].category = _deriveCategoryFromLabel(label);
  }

  void _updateTariffPrice(int index, String priceStr) {
    _editableTariffs[index].price = double.tryParse(priceStr) ?? 0;
    _recalculateBudget();
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

  Widget _buildTariffsSection() {
    return _buildSectionCard(
      children: [
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
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),

        if (_editableTariffs.isEmpty)
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
        ...List.generate(_editableTariffs.length, (index) {
          return _buildTariffRow(index);
        }),

        if (_selectedLocation != null && _editableTariffs.isNotEmpty) ...[
          const SizedBox(height: 8),
          Text(
            'Tarifs pré-remplis depuis le lieu. Vous pouvez les modifier.',
            style: TextStyle(
              fontSize: 11,
              color: Colors.grey[500],
              fontStyle: FontStyle.italic,
            ),
          ),
        ],
      ],
    );
  }

  Widget _buildTariffRow(int index) {
    final tariff = _editableTariffs[index];

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
          onChanged: (value) {
            if (value != null) setState(() => _statut = value);
          },
        ),
      ),
    );
  }

  Widget _buildSubmitButton() {
    final canSubmit = !_saving && _titreController.text.trim().isNotEmpty;

    return SizedBox(
      width: double.infinity,
      height: 52,
      child: ElevatedButton(
        onPressed: canSubmit ? _handleSubmit : null,
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.middenblauw,
          foregroundColor: Colors.white,
          disabledBackgroundColor: AppColors.middenblauw.withOpacity(0.4),
          disabledForegroundColor: Colors.white.withOpacity(0.6),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
          elevation: 2,
        ),
        child: _saving
            ? const SizedBox(
                width: 24,
                height: 24,
                child: CircularProgressIndicator(
                  color: Colors.white,
                  strokeWidth: 2,
                ),
              )
            : const Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    'Créer l\'événement',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  SizedBox(width: 8),
                  Icon(Icons.chevron_right, size: 22),
                ],
              ),
      ),
    );
  }

  // ============================================================
  // DATE/TIME PICKER HELPERS
  // ============================================================

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
        // Date picker
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
        // Time picker
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
              color: date != null || !allowClear
                  ? Colors.grey[50]
                  : Colors.grey[100],
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: date != null || !allowClear
                    ? Colors.grey[300]!
                    : Colors.grey[200]!,
              ),
            ),
            child: Row(
              children: [
                Icon(
                  Icons.access_time,
                  size: 16,
                  color: date != null || !allowClear
                      ? AppColors.middenblauw
                      : Colors.grey[400],
                ),
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
        // Clear button (for optional dates)
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

  // ============================================================
  // UI HELPERS
  // ============================================================

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

/// Classe helper voor bewerkbare tarieven (mutable versie van Tariff)
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

/// Lightweight representation d'un membre qui peut être choisi comme
/// responsable. Id (= clé pour organisateur_id et donc pour le lookup
/// du téléphone) + label d'affichage.
class _EncadrantOption {
  final String id;
  final String displayName;

  const _EncadrantOption({required this.id, required this.displayName});
}
