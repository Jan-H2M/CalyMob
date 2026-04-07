import 'package:flutter/material.dart';
import '../config/app_colors.dart';
import '../models/member_observation.dart';
import '../services/member_observation_service.dart';

/// Bottom sheet voor het toevoegen van observaties per lid.
/// Drie modi: LIFRAS exercice, Thème de session, Libre (tekst).
/// contextType bepaalt het type context: 'piscine' (zwembad) of 'plongee' (duiken)
class ObservationBottomSheet extends StatefulWidget {
  final String clubId;
  final String memberId;
  final String memberName;
  final String memberNiveau;
  final String sessionId;
  final String sessionTitle;
  final DateTime sessionDate;
  final String observerId;
  final String observerName;
  final String? defaultThemeTitle;
  final List<String>? suggestedExerciceCodes;
  final String contextType;  // 'piscine' or 'plongee'

  const ObservationBottomSheet({
    super.key,
    required this.clubId,
    required this.memberId,
    required this.memberName,
    required this.memberNiveau,
    required this.sessionId,
    required this.sessionTitle,
    required this.sessionDate,
    required this.observerId,
    required this.observerName,
    this.defaultThemeTitle,
    this.suggestedExerciceCodes,
    this.contextType = 'piscine',
  });

  @override
  State<ObservationBottomSheet> createState() => _ObservationBottomSheetState();
}

enum _ObsMode { lifras, theme, libre }

class _ObservationBottomSheetState extends State<ObservationBottomSheet> {
  final MemberObservationService _service = MemberObservationService();
  _ObsMode _mode = _ObsMode.lifras;
  bool _saving = false;

  // Velden
  final _noteController = TextEditingController();
  String? _selectedResult; // 'acquis' | 'en_progres' | 'a_revoir'
  String _selectedCategory = 'general';

  // LIFRAS mode
  String _exerciceCode = '';
  String _exerciceDescription = '';

  // Theme mode
  String _themeTitle = '';

  // Opgeslagen observaties in deze sessie
  final List<MemberObservation> _savedObs = [];
  @override
  void initState() {
    super.initState();
    _themeTitle = widget.defaultThemeTitle ?? '';
    if (_themeTitle.isNotEmpty) _mode = _ObsMode.theme;
  }

  @override
  void dispose() {
    _noteController.dispose();
    super.dispose();
  }

  Future<void> _saveObservation() async {
    if (_saving) return;
    setState(() => _saving = true);

    try {
      String category;
      String? exCode, exDesc, thId, thTitle;

      switch (_mode) {
        case _ObsMode.lifras:
          category = 'exercice_lifras';
          exCode = _exerciceCode;
          exDesc = _exerciceDescription;
          break;
        case _ObsMode.theme:
          category = 'theme_session';
          thTitle = _themeTitle;
          break;
        case _ObsMode.libre:
          category = _selectedCategory;
          break;
      }
      final observation = MemberObservation(
        id: '',
        memberId: widget.memberId,
        memberName: widget.memberName,
        memberNiveau: widget.memberNiveau,
        contextType: widget.contextType,
        contextId: widget.sessionId,
        contextDate: widget.sessionDate,
        contextTitle: widget.sessionTitle,
        category: category,
        exerciceCode: exCode,
        exerciceDescription: exDesc,
        themeId: thId,
        themeTitle: thTitle,
        result: _selectedResult,
        note: _noteController.text.trim(),
        observerId: widget.observerId,
        observerName: widget.observerName,
        createdAt: DateTime.now(),
      );

      final docId = await _service.addObservation(widget.clubId, observation);
      setState(() {
        _savedObs.add(MemberObservation(
          id: docId,
          memberId: observation.memberId,
          memberName: observation.memberName,
          memberNiveau: observation.memberNiveau,          contextType: observation.contextType,
          contextId: observation.contextId,
          contextDate: observation.contextDate,
          contextTitle: observation.contextTitle,
          category: observation.category,
          exerciceCode: observation.exerciceCode,
          exerciceDescription: observation.exerciceDescription,
          themeId: observation.themeId,
          themeTitle: observation.themeTitle,
          result: observation.result,
          note: observation.note,
          observerId: observation.observerId,
          observerName: observation.observerName,
          createdAt: observation.createdAt,
        ));
        // Reset pour prochaine observation
        _noteController.clear();
        _selectedResult = null;
        _exerciceCode = '';
        _exerciceDescription = '';
      });

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Observation enregistrée'),
            duration: Duration(seconds: 1),
          ),
        );
      }
    } catch (e) {      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Erreur: $e'), backgroundColor: Colors.red),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return DraggableScrollableSheet(
      initialChildSize: 0.85,
      maxChildSize: 0.95,
      minChildSize: 0.5,
      builder: (context, scrollController) {
        return Container(
          decoration: const BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
          ),
          child: Column(
            children: [
              // Handle bar
              Container(
                margin: const EdgeInsets.only(top: 8),
                width: 40, height: 4,
                decoration: BoxDecoration(
                  color: Colors.grey.shade300,
                  borderRadius: BorderRadius.circular(2),                ),
              ),
              // Header
              Padding(
                padding: const EdgeInsets.all(16),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        widget.memberName,
                        style: const TextStyle(
                          fontSize: 18, fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                    TextButton(
                      onPressed: () => Navigator.pop(context),
                      child: const Text('Fermer'),
                    ),
                  ],
                ),
              ),
              // Mode tabs
              _buildModeTabs(),
              const Divider(height: 1),
              // Content
              Expanded(
                child: SingleChildScrollView(
                  controller: scrollController,
                  padding: const EdgeInsets.all(16),
                  child: _buildModeContent(),
                ),
              ),              // Saved observations list
              if (_savedObs.isNotEmpty)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  color: Colors.green.shade50,
                  child: Row(
                    children: [
                      Icon(Icons.check_circle, color: Colors.green.shade600, size: 18),
                      const SizedBox(width: 8),
                      Text(
                        '${_savedObs.length} observation${_savedObs.length > 1 ? 's' : ''} enregistrée${_savedObs.length > 1 ? 's' : ''}',
                        style: TextStyle(color: Colors.green.shade800, fontWeight: FontWeight.w500),
                      ),
                    ],
                  ),
                ),
              // Save button
              SafeArea(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: _saving ? null : _saveObservation,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.primary,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 14),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),                        ),
                      ),
                      child: _saving
                          ? const SizedBox(
                              height: 20, width: 20,
                              child: CircularProgressIndicator(
                                strokeWidth: 2, color: Colors.white,
                              ),
                            )
                          : const Text('Enregistrer', style: TextStyle(fontSize: 16)),
                    ),
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildModeTabs() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Row(
        children: [
          _modeTab('🎯 LIFRAS', _ObsMode.lifras),
          const SizedBox(width: 8),
          _modeTab('📘 Thème', _ObsMode.theme),
          const SizedBox(width: 8),
          _modeTab('✍ Libre', _ObsMode.libre),        ],
      ),
    );
  }

  Widget _modeTab(String label, _ObsMode mode) {
    final selected = _mode == mode;
    return Expanded(
      child: GestureDetector(
        onTap: () => setState(() => _mode = mode),
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 10),
          decoration: BoxDecoration(
            color: selected ? AppColors.primary : Colors.grey.shade100,
            borderRadius: BorderRadius.circular(10),
          ),
          child: Text(
            label,
            textAlign: TextAlign.center,
            style: TextStyle(
              color: selected ? Colors.white : Colors.grey.shade700,
              fontWeight: selected ? FontWeight.w600 : FontWeight.normal,
              fontSize: 13,
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildModeContent() {    switch (_mode) {
      case _ObsMode.lifras:
        return _buildLifrasContent();
      case _ObsMode.theme:
        return _buildThemeContent();
      case _ObsMode.libre:
        return _buildLibreContent();
    }
  }

  // ─── LIFRAS Mode ────────────────────────────────────────────────

  Widget _buildLifrasContent() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('Code exercice LIFRAS',
            style: TextStyle(fontWeight: FontWeight.w600)),
        const SizedBox(height: 8),
        TextField(
          decoration: InputDecoration(
            hintText: 'ex: P2.CO',
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
            contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          ),
          onChanged: (v) => _exerciceCode = v,
        ),
        const SizedBox(height: 12),
        const Text('Description', style: TextStyle(fontWeight: FontWeight.w600)),
        const SizedBox(height: 8),        TextField(
          decoration: InputDecoration(
            hintText: 'ex: Épreuve du combiné',
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
            contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          ),
          onChanged: (v) => _exerciceDescription = v,
        ),
        const SizedBox(height: 16),
        _buildResultSelector(),
        const SizedBox(height: 16),
        _buildNoteField(),
      ],
    );
  }

  // ─── Theme Mode ─────────────────────────────────────────────────

  Widget _buildThemeContent() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('Thème de la session',
            style: TextStyle(fontWeight: FontWeight.w600)),
        const SizedBox(height: 8),
        TextField(
          controller: TextEditingController(text: _themeTitle),
          decoration: InputDecoration(
            hintText: 'Thème du jour',
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),            contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          ),
          onChanged: (v) => _themeTitle = v,
        ),
        const SizedBox(height: 16),
        _buildResultSelector(),
        const SizedBox(height: 16),
        _buildNoteField(),
      ],
    );
  }

  // ─── Libre Mode ─────────────────────────────────────────────────

  Widget _buildLibreContent() {
    final categories = [
      ('technique', 'Technique'),
      ('securite', 'Sécurité'),
      ('attitude', 'Attitude'),
      ('general', 'Général'),
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('Catégorie', style: TextStyle(fontWeight: FontWeight.w600)),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8, runSpacing: 8,
          children: categories.map((cat) {
            final selected = _selectedCategory == cat.$1;            return ChoiceChip(
              label: Text(cat.$2),
              selected: selected,
              selectedColor: AppColors.primary.withOpacity(0.2),
              onSelected: (_) => setState(() => _selectedCategory = cat.$1),
            );
          }).toList(),
        ),
        const SizedBox(height: 16),
        _buildNoteField(),
      ],
    );
  }

  // ─── Shared widgets ─────────────────────────────────────────────

  Widget _buildResultSelector() {
    final results = [
      ('acquis', 'Acquis', Colors.green),
      ('en_progres', 'En progrès', Colors.orange),
      ('a_revoir', 'À revoir', Colors.red),
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('Résultat', style: TextStyle(fontWeight: FontWeight.w600)),
        const SizedBox(height: 8),
        Row(
          children: results.map((r) {
            final selected = _selectedResult == r.$1;            return Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 4),
                child: GestureDetector(
                  onTap: () => setState(() =>
                      _selectedResult = selected ? null : r.$1),
                  child: Container(
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    decoration: BoxDecoration(
                      color: selected ? r.$3.withOpacity(0.15) : Colors.grey.shade100,
                      border: Border.all(
                        color: selected ? r.$3 : Colors.grey.shade300,
                        width: selected ? 2 : 1,
                      ),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Text(
                      r.$2,
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        color: selected ? r.$3.shade700 : Colors.grey.shade600,
                        fontWeight: selected ? FontWeight.w600 : FontWeight.normal,
                        fontSize: 13,
                      ),
                    ),
                  ),
                ),
              ),
            );
          }).toList(),        ),
      ],
    );
  }

  Widget _buildNoteField() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('Note (optionnel)', style: TextStyle(fontWeight: FontWeight.w600)),
        const SizedBox(height: 8),
        TextField(
          controller: _noteController,
          maxLines: 3,
          decoration: InputDecoration(
            hintText: 'Remarques, observations...',
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
            contentPadding: const EdgeInsets.all(12),
          ),
        ),
      ],
    );
  }
}