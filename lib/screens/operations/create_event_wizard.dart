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
import '../../services/operation_service.dart';

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
  final _organisateurController = TextEditingController();

  DateTime _dateDebut = DateTime(
    DateTime.now().year, DateTime.now().month, DateTime.now().day, 14, 0,
  );
  DateTime? _dateFin;
  String _statut = 'brouillon';
  List<Tariff> _eventTariffs = [];
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

    // Pré-remplir l'organisateur
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final memberProvider = context.read<MemberProvider>();
      _organisateurController.text = memberProvider.displayName;
    });
  }

  @override
  void dispose() {
    _titreController.dispose();
    _descriptionController.dispose();
    _capaciteController.dispose();
    _budgetController.dispose();
    _organisateurController.dispose();
    super.dispose();
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
      _eventTariffs = location.tariffs;

      // Recalculer budget
      _recalculateBudget();

      // Passer à l'étape 2
      _currentStep = 2;
    });
  }

  void _onCreateManual() {
    // Identique à CalyCompta: "Créer manuellement"
    // Crée un événement directement avec category='sortie'
    _createManualEvent();
  }

  Future<void> _createManualEvent() async {
    setState(() => _saving = true);

    try {
      final authProvider = context.read<AuthProvider>();
      final memberProvider = context.read<MemberProvider>();
      final userId = authProvider.currentUser?.uid ?? '';

      // Generate event_number (sortie = non-dive)
      final eventNumber = await _operationService.generateEventNumber(_clubId, false);

      final data = {
        'type': 'evenement',
        'titre': 'Nouvel événement',
        'description': '',
        'montant_prevu': 0,
        'montant_reel': 0,
        'date_debut': Timestamp.fromDate(_dateDebut),
        'statut': 'ouvert',
        'event_category': 'sortie',
        'event_number': eventNumber,
        'lieu': '',
        'organisateur_nom': memberProvider.displayName,
        'organisateur_id': userId,
        'event_tariffs': [],
        'club_id': _clubId,
        'created_by': 'manual',
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

  void _recalculateBudget() {
    final capacity = int.tryParse(_capaciteController.text);
    final budget = OperationService.computeBudgetPrevu(_eventTariffs, capacity);
    _budgetController.text = budget.toStringAsFixed(2);
  }

  Future<void> _handleSubmit() async {
    if (!_formKey.currentState!.validate()) return;
    if (_titreController.text.trim().isEmpty) return;

    setState(() => _saving = true);

    try {
      final authProvider = context.read<AuthProvider>();
      final userId = authProvider.currentUser?.uid ?? '';
      final isDive = widget.eventCategory == 'plongee' || _selectedLocation != null;

      // Generate event number
      final eventNumber = await _operationService.generateEventNumber(_clubId, isDive);

      // Build tariffs data
      final tariffsData = OperationService.copyTariffsFromLocation(_eventTariffs);

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
        'organisateur_nom': _organisateurController.text.trim(),
        'organisateur_id': userId,
        'event_tariffs': tariffsData,
        'club_id': _clubId,
        'created_by': 'manual',
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
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        title: const Text(
          'Nouvel événement',
          style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
        ),
        backgroundColor: Colors.transparent,
        elevation: 0,
        iconTheme: const IconThemeData(color: Colors.white),
        actions: [
          if (_currentStep == 2 && widget.eventCategory == 'plongee' && _selectedLocation != null)
            IconButton(
              icon: const Icon(Icons.arrow_back),
              tooltip: 'Retour',
              onPressed: () {
                setState(() {
                  _currentStep = 1;
                  _selectedLocation = null;
                });
              },
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
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
      child: Row(
        children: [
          _buildStepDot(1, isStep1 || _currentStep == 2),
          Expanded(
            child: Container(
              height: 2,
              color: _currentStep >= 2
                  ? Colors.white
                  : Colors.white.withOpacity(0.3),
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
            color: active ? Colors.white : Colors.white.withOpacity(0.3),
            shape: BoxShape.circle,
          ),
          child: Center(
            child: Text(
              '$step',
              style: TextStyle(
                color: active ? AppColors.donkerblauw : Colors.white,
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
            color: active ? Colors.white : Colors.white.withOpacity(0.5),
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

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Header text
        Padding(
          padding: const EdgeInsets.fromLTRB(24, 8, 24, 4),
          child: Text(
            'Étape 1/2 : Sélection du lieu',
            style: TextStyle(
              fontSize: 14,
              color: Colors.white.withOpacity(0.8),
              fontWeight: FontWeight.w500,
            ),
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(24, 0, 24, 8),
          child: Text(
            'Choisir un lieu de plongée',
            style: const TextStyle(
              fontSize: 18,
              color: Colors.white,
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
              color: Colors.white.withOpacity(0.7),
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

        // Location list
        Expanded(
          child: _loadingLocations
              ? const Center(
                  child: CircularProgressIndicator(color: Colors.white),
                )
              : filteredLocations.isEmpty
                  ? _buildEmptyLocations()
                  : ListView.builder(
                      padding: const EdgeInsets.fromLTRB(24, 0, 24, 24),
                      itemCount: filteredLocations.length,
                      itemBuilder: (context, index) {
                        return _buildLocationCard(filteredLocations[index]);
                      },
                    ),
        ),
      ],
    );
  }

  Widget _buildManualCreateButton() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.1),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.white.withOpacity(0.2)),
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(
              'Événement hors plongée ou lieu non répertorié ?',
              style: TextStyle(
                fontSize: 13,
                color: Colors.white.withOpacity(0.8),
              ),
            ),
          ),
          const SizedBox(width: 12),
          ElevatedButton(
            onPressed: _saving ? null : _onCreateManual,
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.white,
              foregroundColor: AppColors.middenblauw,
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
          ),
        ],
      ),
    );
  }

  Widget _buildSearchBar() {
    return TextField(
      onChanged: (value) => setState(() => _searchQuery = value),
      style: const TextStyle(color: Colors.white),
      decoration: InputDecoration(
        hintText: 'Rechercher un lieu...',
        hintStyle: TextStyle(color: Colors.white.withOpacity(0.5)),
        prefixIcon: Icon(Icons.search, color: Colors.white.withOpacity(0.7)),
        filled: true,
        fillColor: Colors.white.withOpacity(0.15),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide.none,
        ),
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      ),
    );
  }

  Widget _buildEmptyLocations() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.location_off, size: 48, color: Colors.white.withOpacity(0.5)),
          const SizedBox(height: 16),
          Text(
            _searchQuery.isNotEmpty ? 'Aucun lieu trouvé' : 'Aucun lieu configuré',
            style: TextStyle(color: Colors.white.withOpacity(0.7), fontSize: 16),
          ),
          if (_searchQuery.isEmpty) ...[
            const SizedBox(height: 12),
            TextButton(
              onPressed: _loadLocations,
              child: Text(
                'Rafraîchir',
                style: TextStyle(color: Colors.white.withOpacity(0.9)),
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
            color: isSelected ? AppColors.middenblauw : Colors.transparent,
            width: 2,
          ),
          boxShadow: [
            BoxShadow(
              color: AppColors.donkerblauw.withOpacity(0.1),
              blurRadius: 8,
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
                      Icon(Icons.location_on, size: 18, color: AppColors.middenblauw),
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
                  if (location.description != null && location.description!.isNotEmpty) ...[
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
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
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
                fontSize: 14,
                color: Colors.white.withOpacity(0.8),
                fontWeight: FontWeight.w500,
              ),
            ),
            const SizedBox(height: 16),
          ],

          // Selected location badge (read-only)
          if (_selectedLocation != null)
            _buildSelectedLocationBadge(),

          // Titre *
          _buildSectionCard(
            children: [
              _buildLabel('Titre de l\'événement', required: true, icon: Icons.edit_note),
              const SizedBox(height: 8),
              TextFormField(
                controller: _titreController,
                decoration: _inputDecoration('Ex: Plongée Zélande Avril 2026'),
                validator: (value) =>
                    value == null || value.trim().isEmpty ? 'Le titre est requis' : null,
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
              _buildLabel('Date et heure de début', required: true, icon: Icons.calendar_today),
              const SizedBox(height: 8),
              _buildDateTimeRow(
                date: _dateDebut,
                onDateChanged: (date) => setState(() {
                  _dateDebut = DateTime(
                    date.year, date.month, date.day,
                    _dateDebut.hour, _dateDebut.minute,
                  );
                }),
                onTimeChanged: (time) => setState(() {
                  _dateDebut = DateTime(
                    _dateDebut.year, _dateDebut.month, _dateDebut.day,
                    time.hour, time.minute,
                  );
                }),
              ),
              const SizedBox(height: 16),
              _buildLabel('Date et heure de fin (optionnel)', icon: Icons.event),
              const SizedBox(height: 8),
              _buildDateTimeRow(
                date: _dateFin,
                onDateChanged: (date) => setState(() {
                  _dateFin = DateTime(
                    date.year, date.month, date.day,
                    _dateFin?.hour ?? 18, _dateFin?.minute ?? 0,
                  );
                }),
                onTimeChanged: (time) {
                  if (_dateFin != null) {
                    setState(() {
                      _dateFin = DateTime(
                        _dateFin!.year, _dateFin!.month, _dateFin!.day,
                        time.hour, time.minute,
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
                          keyboardType: const TextInputType.numberWithOptions(decimal: true),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 16),

          // Organisateur
          _buildSectionCard(
            children: [
              _buildLabel('Organisateur', icon: Icons.person),
              const SizedBox(height: 8),
              TextFormField(
                controller: _organisateurController,
                decoration: _inputDecoration('Nom de l\'organisateur'),
              ),
            ],
          ),
          const SizedBox(height: 16),

          // Tarifs (read-only preview)
          if (_eventTariffs.isNotEmpty)
            _buildTariffsPreview(),

          if (_eventTariffs.isNotEmpty)
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

  Widget _buildTariffsPreview() {
    return _buildSectionCard(
      children: [
        _buildLabel('Tarifs pour cet événement', icon: Icons.receipt_long),
        const SizedBox(height: 10),
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: AppColors.lichtblauw.withOpacity(0.1),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: AppColors.lichtblauw.withOpacity(0.2)),
          ),
          child: Column(
            children: [
              ..._eventTariffs.map((tariff) {
                return Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        tariff.label,
                        style: TextStyle(
                          fontSize: 14,
                          color: AppColors.donkerblauw,
                        ),
                      ),
                      Text(
                        '${tariff.price.toStringAsFixed(2)} €',
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.bold,
                          color: AppColors.middenblauw,
                        ),
                      ),
                    ],
                  ),
                );
              }),
              const SizedBox(height: 8),
              Text(
                'Ces tarifs ont été copiés depuis le lieu. Vous pourrez les modifier après la création.',
                style: TextStyle(
                  fontSize: 11,
                  color: Colors.grey[500],
                  fontStyle: FontStyle.italic,
                ),
              ),
            ],
          ),
        ),
      ],
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
    final dateText = date != null
        ? DateFormat('dd/MM/yyyy').format(date)
        : 'Sélectionner';
    final timeText = date != null
        ? DateFormat('HH:mm').format(date)
        : '--:--';

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
                  Icon(Icons.calendar_today, size: 16, color: AppColors.middenblauw),
                  const SizedBox(width: 8),
                  Text(
                    dateText,
                    style: TextStyle(
                      fontSize: 14,
                      color: date != null ? AppColors.donkerblauw : Colors.grey[400],
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
                    color: date != null
                        ? AppColors.donkerblauw
                        : Colors.grey[400],
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
