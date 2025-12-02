import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../config/firebase_config.dart';
import '../../models/exercice_lifras.dart';
import '../../providers/auth_provider.dart';
import '../../services/exercice_valide_service.dart';
import '../../services/lifras_service.dart';
import '../../services/member_service.dart';
import '../../utils/date_formatter.dart';

/// Écran pour valider un exercice pour un membre
class ValidateExerciseScreen extends StatefulWidget {
  final String memberId;
  final String memberName;
  final ExerciceLIFRAS? preselectedExercise;

  const ValidateExerciseScreen({
    super.key,
    required this.memberId,
    required this.memberName,
    this.preselectedExercise,
  });

  @override
  State<ValidateExerciseScreen> createState() => _ValidateExerciseScreenState();
}

class _ValidateExerciseScreenState extends State<ValidateExerciseScreen> {
  final _formKey = GlobalKey<FormState>();
  final LifrasService _lifrasService = LifrasService();
  final MemberService _memberService = MemberService();
  final ExerciceValideService _exerciceValideService = ExerciceValideService();
  final String _clubId = FirebaseConfig.defaultClubId;

  final _moniteurController = TextEditingController();
  final _lieuController = TextEditingController();
  final _notesController = TextEditingController();

  List<ExerciceLIFRAS> _allExercices = [];
  List<Map<String, dynamic>> _monitors = [];
  ExerciceLIFRAS? _selectedExercice;
  DateTime _selectedDate = DateTime.now();
  String? _selectedMoniteurId;
  NiveauLIFRAS? _filterNiveau;

  bool _isLoading = true;
  bool _isSubmitting = false;
  String _searchQuery = '';

  @override
  void initState() {
    super.initState();
    _selectedExercice = widget.preselectedExercise;
    _loadData();
  }

  @override
  void dispose() {
    _moniteurController.dispose();
    _lieuController.dispose();
    _notesController.dispose();
    super.dispose();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);

    try {
      // Load all exercises
      _allExercices = await _lifrasService.getAllExercices(_clubId);

      // Load monitors for autocomplete
      _monitors = await _memberService.getMonitors(_clubId);

      // Pre-fill current user as monitor if they are a monitor
      final authProvider = context.read<AuthProvider>();
      final currentUserId = authProvider.currentUser?.uid;
      if (currentUserId != null) {
        final currentMonitor = _monitors.firstWhere(
          (m) => m['id'] == currentUserId,
          orElse: () => {},
        );
        if (currentMonitor.isNotEmpty) {
          _moniteurController.text = currentMonitor['displayName'] as String;
          _selectedMoniteurId = currentMonitor['id'] as String;
        }
      }
    } catch (e) {
      debugPrint('Erreur chargement données: $e');
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  List<ExerciceLIFRAS> get _filteredExercices {
    var exercises = _allExercices;

    // Filter by niveau
    if (_filterNiveau != null) {
      exercises = exercises.where((e) => e.niveau == _filterNiveau).toList();
    }

    // Filter by search query
    if (_searchQuery.isNotEmpty) {
      final query = _searchQuery.toLowerCase();
      exercises = exercises.where((e) {
        return e.code.toLowerCase().contains(query) ||
            e.description.toLowerCase().contains(query) ||
            (e.specialite?.toLowerCase().contains(query) ?? false);
      }).toList();
    }

    return exercises;
  }

  Future<void> _selectDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _selectedDate,
      firstDate: DateTime(2020),
      lastDate: DateTime.now(),
      locale: const Locale('fr', 'FR'),
      builder: (context, child) {
        return Theme(
          data: Theme.of(context).copyWith(
            colorScheme: const ColorScheme.light(
              primary: Colors.teal,
              onPrimary: Colors.white,
            ),
          ),
          child: child!,
        );
      },
    );

    if (picked != null) {
      setState(() => _selectedDate = picked);
    }
  }

  Future<void> _handleSubmit() async {
    if (!_formKey.currentState!.validate()) return;

    if (_selectedExercice == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Veuillez sélectionner un exercice'),
          backgroundColor: Colors.orange,
        ),
      );
      return;
    }

    if (_moniteurController.text.trim().isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Veuillez entrer le nom du moniteur'),
          backgroundColor: Colors.orange,
        ),
      );
      return;
    }

    setState(() => _isSubmitting = true);

    try {
      final authProvider = context.read<AuthProvider>();
      final createdBy = authProvider.currentUser?.uid ?? '';

      await _exerciceValideService.validateExercise(
        clubId: _clubId,
        memberId: widget.memberId,
        exercice: _selectedExercice!,
        dateValidation: _selectedDate,
        moniteurNom: _moniteurController.text.trim(),
        createdBy: createdBy,
        moniteurId: _selectedMoniteurId,
        lieu: _lieuController.text.trim().isNotEmpty ? _lieuController.text.trim() : null,
        notes: _notesController.text.trim().isNotEmpty ? _notesController.text.trim() : null,
      );

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Exercice "${_selectedExercice!.code}" validé'),
            backgroundColor: Colors.green,
          ),
        );
        Navigator.pop(context, true);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Erreur: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isSubmitting = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Valider un exercice', style: TextStyle(color: Colors.white)),
            Text(
              widget.memberName,
              style: const TextStyle(fontSize: 14, color: Colors.white70),
            ),
          ],
        ),
        backgroundColor: Colors.teal,
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : Form(
              key: _formKey,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  // Exercise selection
                  _buildExerciseSelection(),

                  const SizedBox(height: 24),

                  // Date selection
                  InkWell(
                    onTap: _selectDate,
                    child: InputDecorator(
                      decoration: const InputDecoration(
                        labelText: 'Date de validation',
                        prefixIcon: Icon(Icons.calendar_today, color: Colors.teal),
                        border: OutlineInputBorder(),
                      ),
                      child: Text(
                        DateFormatter.formatMedium(_selectedDate),
                        style: const TextStyle(fontSize: 16),
                      ),
                    ),
                  ),

                  const SizedBox(height: 16),

                  // Monitor name with autocomplete
                  Autocomplete<Map<String, dynamic>>(
                    optionsBuilder: (textEditingValue) {
                      if (textEditingValue.text.isEmpty) {
                        return _monitors;
                      }
                      final query = textEditingValue.text.toLowerCase();
                      return _monitors.where((m) =>
                          (m['displayName'] as String).toLowerCase().contains(query));
                    },
                    displayStringForOption: (m) => m['displayName'] as String,
                    fieldViewBuilder: (context, controller, focusNode, onSubmitted) {
                      // Sync with our controller
                      controller.text = _moniteurController.text;
                      controller.addListener(() {
                        _moniteurController.text = controller.text;
                        // Clear selection if text changed manually
                        if (_selectedMoniteurId != null) {
                          final selectedName = _monitors
                              .firstWhere((m) => m['id'] == _selectedMoniteurId,
                                  orElse: () => {})['displayName'];
                          if (controller.text != selectedName) {
                            _selectedMoniteurId = null;
                          }
                        }
                      });

                      return TextFormField(
                        controller: controller,
                        focusNode: focusNode,
                        decoration: const InputDecoration(
                          labelText: 'Moniteur',
                          prefixIcon: Icon(Icons.person, color: Colors.teal),
                          border: OutlineInputBorder(),
                          helperText: 'Sélectionnez ou tapez un nom',
                        ),
                        validator: (value) {
                          if (value == null || value.trim().isEmpty) {
                            return 'Le nom du moniteur est requis';
                          }
                          return null;
                        },
                      );
                    },
                    onSelected: (monitor) {
                      _moniteurController.text = monitor['displayName'] as String;
                      _selectedMoniteurId = monitor['id'] as String;
                    },
                  ),

                  const SizedBox(height: 16),

                  // Location (optional)
                  TextFormField(
                    controller: _lieuController,
                    decoration: const InputDecoration(
                      labelText: 'Lieu (optionnel)',
                      prefixIcon: Icon(Icons.location_on, color: Colors.teal),
                      border: OutlineInputBorder(),
                      hintText: 'Ex: Piscine, Vodelée, Carrière...',
                    ),
                  ),

                  const SizedBox(height: 16),

                  // Notes (optional)
                  TextFormField(
                    controller: _notesController,
                    maxLines: 3,
                    decoration: const InputDecoration(
                      labelText: 'Notes (optionnel)',
                      prefixIcon: Icon(Icons.notes, color: Colors.teal),
                      border: OutlineInputBorder(),
                      hintText: 'Commentaires ou observations...',
                    ),
                  ),

                  const SizedBox(height: 32),

                  // Submit button
                  SizedBox(
                    height: 50,
                    child: ElevatedButton(
                      onPressed: _isSubmitting ? null : _handleSubmit,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.teal,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                      ),
                      child: _isSubmitting
                          ? const SizedBox(
                              width: 24,
                              height: 24,
                              child: CircularProgressIndicator(
                                color: Colors.white,
                                strokeWidth: 2,
                              ),
                            )
                          : const Text(
                              'Valider l\'exercice',
                              style: TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.bold,
                                color: Colors.white,
                              ),
                            ),
                    ),
                  ),
                ],
              ),
            ),
    );
  }

  Widget _buildExerciseSelection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Exercice à valider',
          style: TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.bold,
          ),
        ),
        const SizedBox(height: 8),

        // Selected exercise display
        if (_selectedExercice != null)
          Card(
            color: Colors.teal[50],
            child: ListTile(
              leading: Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: _getNiveauColor(_selectedExercice!.niveau),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Center(
                  child: Text(
                    _selectedExercice!.niveau.code,
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.bold,
                      fontSize: 12,
                    ),
                  ),
                ),
              ),
              title: Text(
                _selectedExercice!.code,
                style: const TextStyle(fontWeight: FontWeight.bold),
              ),
              subtitle: Text(_selectedExercice!.description),
              trailing: IconButton(
                icon: const Icon(Icons.close),
                onPressed: () => setState(() => _selectedExercice = null),
              ),
            ),
          )
        else
          OutlinedButton.icon(
            onPressed: _showExerciseSelector,
            icon: const Icon(Icons.add),
            label: const Text('Sélectionner un exercice'),
            style: OutlinedButton.styleFrom(
              minimumSize: const Size(double.infinity, 50),
              foregroundColor: Colors.teal,
              side: const BorderSide(color: Colors.teal),
            ),
          ),
      ],
    );
  }

  void _showExerciseSelector() {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (context) => StatefulBuilder(
        builder: (context, setModalState) => DraggableScrollableSheet(
          initialChildSize: 0.9,
          minChildSize: 0.5,
          maxChildSize: 0.95,
          expand: false,
          builder: (context, scrollController) => Column(
            children: [
              // Handle
              Container(
                margin: const EdgeInsets.symmetric(vertical: 12),
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: Colors.grey[300],
                  borderRadius: BorderRadius.circular(2),
                ),
              ),

              // Title
              const Padding(
                padding: EdgeInsets.symmetric(horizontal: 16),
                child: Text(
                  'Sélectionner un exercice',
                  style: TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),

              // Search bar
              Padding(
                padding: const EdgeInsets.all(16),
                child: TextField(
                  decoration: InputDecoration(
                    hintText: 'Rechercher...',
                    prefixIcon: const Icon(Icons.search),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                    contentPadding: const EdgeInsets.symmetric(horizontal: 16),
                  ),
                  onChanged: (value) {
                    setModalState(() => _searchQuery = value);
                  },
                ),
              ),

              // Filter chips
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Row(
                  children: [
                    FilterChip(
                      label: const Text('Tous'),
                      selected: _filterNiveau == null,
                      onSelected: (_) => setModalState(() => _filterNiveau = null),
                      selectedColor: Colors.teal[100],
                    ),
                    const SizedBox(width: 8),
                    ...NiveauLIFRAS.values.map((niveau) => Padding(
                          padding: const EdgeInsets.only(right: 8),
                          child: FilterChip(
                            label: Text(niveau.code),
                            selected: _filterNiveau == niveau,
                            onSelected: (_) => setModalState(() => _filterNiveau = niveau),
                            selectedColor: _getNiveauColor(niveau).withOpacity(0.3),
                          ),
                        )),
                  ],
                ),
              ),

              const SizedBox(height: 8),

              // Exercise list
              Expanded(
                child: ListView.builder(
                  controller: scrollController,
                  padding: const EdgeInsets.all(8),
                  itemCount: _filteredExercices.length,
                  itemBuilder: (context, index) {
                    final exercise = _filteredExercices[index];
                    return Card(
                      child: ListTile(
                        leading: Container(
                          width: 40,
                          height: 40,
                          decoration: BoxDecoration(
                            color: _getNiveauColor(exercise.niveau),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Center(
                            child: Text(
                              exercise.niveau.code,
                              style: const TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.bold,
                                fontSize: 12,
                              ),
                            ),
                          ),
                        ),
                        title: Text(
                          exercise.code,
                          style: const TextStyle(fontWeight: FontWeight.bold),
                        ),
                        subtitle: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(exercise.description),
                            if (exercise.specialite != null)
                              Text(
                                exercise.specialite!,
                                style: TextStyle(
                                  fontSize: 12,
                                  color: Colors.teal[700],
                                  fontStyle: FontStyle.italic,
                                ),
                              ),
                          ],
                        ),
                        onTap: () {
                          setState(() => _selectedExercice = exercise);
                          Navigator.pop(context);
                        },
                      ),
                    );
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Color _getNiveauColor(NiveauLIFRAS niveau) {
    switch (niveau) {
      case NiveauLIFRAS.tn:
        return Colors.teal;
      case NiveauLIFRAS.nb:
        return Colors.grey;
      case NiveauLIFRAS.p2:
        return Colors.blue;
      case NiveauLIFRAS.p3:
        return Colors.green;
      case NiveauLIFRAS.p4:
        return Colors.orange;
      case NiveauLIFRAS.am:
        return Colors.purple;
      case NiveauLIFRAS.mc:
        return Colors.red;
      case NiveauLIFRAS.mf:
        return Colors.red.shade800;
      case NiveauLIFRAS.mn:
        return Colors.brown.shade800;
    }
  }
}
