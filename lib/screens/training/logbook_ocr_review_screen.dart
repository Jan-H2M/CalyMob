import 'dart:typed_data';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../config/app_colors.dart';
import '../../config/firebase_config.dart';
import '../../models/logbook_ocr_import.dart';
import '../../providers/auth_provider.dart';
import '../../providers/member_provider.dart';
import '../../services/logbook_ocr_import_service.dart';
import '../../widgets/ocean/ocean_gradient_background.dart';

class LogbookOcrReviewScreen extends StatefulWidget {
  final LogbookOcrImportDraft draft;
  final Uint8List imageBytes;

  const LogbookOcrReviewScreen({
    super.key,
    required this.draft,
    required this.imageBytes,
  });

  @override
  State<LogbookOcrReviewScreen> createState() => _LogbookOcrReviewScreenState();
}

class _LogbookOcrReviewScreenState extends State<LogbookOcrReviewScreen> {
  final LogbookOcrImportService _service = LogbookOcrImportService();
  late List<LogbookOcrSuggestedRow> _rows;
  bool _importing = false;

  /// Suggestion catalogs loaded once on screen-init so the review cards
  /// don't have to re-query Firestore per row. Both fall back to empty
  /// lists if the user is offline or the collections are empty.
  List<String> _locationSuggestions = const [];
  List<String> _buddySuggestions = const [];

  @override
  void initState() {
    super.initState();
    _rows = [...widget.draft.rows];
    _loadSuggestions();
    _detectDuplicates();
  }

  Future<void> _detectDuplicates() async {
    final auth = context.read<AuthProvider>();
    final userId = auth.currentUser?.uid;
    if (userId == null) return;
    try {
      final dups = await _service.detectDuplicates(
        clubId: FirebaseConfig.defaultClubId,
        memberId: userId,
        rows: _rows,
      );
      if (!mounted || dups.isEmpty) return;
      setState(() {
        _rows = [
          for (final r in _rows)
            if (dups.containsKey(r.rowId))
              r.copyWith(
                selected: false,
                existingEntryId: dups[r.rowId]!.entryId,
                existingEntryLabel: dups[r.rowId]!.label,
              )
            else
              r,
        ];
      });
    } catch (e) {
      debugPrint('[OcrReview] duplicate detection failed: $e');
    }
  }

  Future<void> _loadSuggestions() async {
    final db = FirebaseFirestore.instance;
    final clubId = FirebaseConfig.defaultClubId;
    final auth = context.read<AuthProvider>();
    final userId = auth.currentUser?.uid;
    try {
      // 1. Personal history — frequency from the user's own logbook entries.
      // Most-used items surface first so the typeahead matches what the
      // diver actually writes about in practice (not just whatever the
      // club catalog happens to contain).
      final locFreq = <String, int>{};
      final buddyFreq = <String, int>{};
      if (userId != null) {
        final ownEntries = await db
            .collection('clubs').doc(clubId)
            .collection('student_logbook_entries')
            .where('member_id', isEqualTo: userId)
            .get();
        for (final d in ownEntries.docs) {
          final v = d.data();
          final loc = (v['location_name'] ?? '').toString().trim();
          if (loc.isNotEmpty) {
            locFreq[loc] = (locFreq[loc] ?? 0) + 1;
          }
          final binomes = v['binomes'] as List?;
          if (binomes != null) {
            for (final b in binomes) {
              if (b is Map) {
                final name = (b['displayName'] ?? b['name'] ?? '').toString().trim();
                if (name.isNotEmpty) buddyFreq[name] = (buddyFreq[name] ?? 0) + 1;
              }
            }
          } else {
            final buddies = v['buddies'] as List?;
            if (buddies != null) {
              for (final b in buddies) {
                String name = '';
                if (b is String) name = b.trim();
                else if (b is Map) {
                  name = (b['name'] ?? b['displayName'] ?? '').toString().trim();
                }
                if (name.isNotEmpty) buddyFreq[name] = (buddyFreq[name] ?? 0) + 1;
              }
            }
          }
        }
      }

      // 2. Club catalog — dive_locations + all members (for completeness).
      final locSnap = await db
          .collection('clubs').doc(clubId)
          .collection('dive_locations').limit(300).get();
      final clubLocs = <String>{};
      for (final d in locSnap.docs) {
        final v = d.data();
        final n = (v['name'] ?? v['nom'] ?? '').toString().trim();
        if (n.isNotEmpty) clubLocs.add(n);
      }
      final memSnap = await db
          .collection('clubs').doc(clubId)
          .collection('members').limit(500).get();
      final clubMembers = <String>{};
      for (final d in memSnap.docs) {
        final v = d.data();
        final p = (v['prenom'] ?? '').toString().trim();
        final n = (v['nom'] ?? '').toString().trim();
        final display = '$p $n'.trim();
        if (display.isNotEmpty) clubMembers.add(display);
      }

      // 3. Merge: personal history (sorted by frequency desc) first, then
      // club entries the user hasn't logged yet (alphabetical).
      final favLocs = locFreq.entries.toList()
        ..sort((a, b) => b.value.compareTo(a.value));
      final orderedLocs = <String>[
        for (final e in favLocs) e.key,
        for (final n in (clubLocs.toList()..sort()))
          if (!locFreq.containsKey(n)) n,
      ];

      final favBuddies = buddyFreq.entries.toList()
        ..sort((a, b) => b.value.compareTo(a.value));
      final orderedBuddies = <String>[
        for (final e in favBuddies) e.key,
        for (final n in (clubMembers.toList()..sort()))
          if (!buddyFreq.containsKey(n)) n,
      ];

      if (!mounted) return;
      setState(() {
        _locationSuggestions = orderedLocs;
        _buddySuggestions = orderedBuddies;
        _personalLocations = locFreq.keys.toSet();
        _personalBuddies = buddyFreq.keys.toSet();
      });
    } catch (e) {
      // Best-effort — typeahead just won't suggest anything.
      debugPrint('[OcrReview] suggestion lookup failed: $e');
    }
  }

  /// Sets used by the option renderer to draw a small star icon next to
  /// items the diver has already logged at least once before.
  Set<String> _personalLocations = const {};
  Set<String> _personalBuddies = const {};

  Future<void> _importSelected() async {
    if (_importing) return;
    final selectedRows =
        _rows.where((r) => r.selected && !r.hasBlockingIssues).toList();
    if (selectedRows.isEmpty) return;

    setState(() => _importing = true);
    try {
      final auth = context.read<AuthProvider>();
      final memberProvider = context.read<MemberProvider>();
      final userId = auth.currentUser?.uid;
      if (userId == null) throw 'Session non identifiée';
      final memberName =
          '${memberProvider.prenom ?? ''} ${memberProvider.nom ?? ''}'.trim();

      final ids = await _service.importRows(
        clubId: FirebaseConfig.defaultClubId,
        memberId: userId,
        memberName: memberName,
        importJobId: widget.draft.importJobId,
        rows: selectedRows,
      );

      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('${ids.length} plongée(s) importée(s) ✓')),
      );
      Navigator.of(context).pop();
      Navigator.of(context).pop();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Import impossible: $e')),
      );
    } finally {
      if (mounted) setState(() => _importing = false);
    }
  }

  void _replaceRow(int index, LogbookOcrSuggestedRow row) {
    setState(() => _rows[index] = row);
  }

  @override
  Widget build(BuildContext context) {
    final selectedCount = _rows.where((r) => r.selected).length;
    final blockingCount =
        _rows.where((r) => r.selected && r.hasBlockingIssues).length;
    final readyCount =
        _rows.where((r) => r.selected && !r.hasBlockingIssues).length;

    return Scaffold(
      body: OceanGradientBackground(
        creatures: CreatureSet.jellyfishAndBubbles,
        child: SafeArea(
          child: Column(
            children: [
              _header(blockingCount),
              _summary(),
              Expanded(
                child: ListView.separated(
                  padding: const EdgeInsets.fromLTRB(16, 10, 16, 120),
                  itemCount: _rows.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 10),
                  itemBuilder: (_, i) {
                    // Locations from the other rows in this OCR batch.
                    // Vacation-trip detection — same scan usually means same
                    // region, so we offer the neighbours' picks as preferred
                    // suggestions before falling back to the full catalog.
                    final batch = <String>[];
                    final seen = <String>{};
                    for (var j = 0; j < _rows.length; j++) {
                      if (j == i) continue;
                      final loc = _rows[j].locationName.value?.trim();
                      if (loc == null || loc.isEmpty) continue;
                      if (seen.add(loc.toLowerCase())) batch.add(loc);
                    }
                    return _ReviewCard(
                      row: _rows[i],
                      onChanged: (next) => _replaceRow(i, next),
                      locationSuggestions: _locationSuggestions,
                      buddySuggestions: _buddySuggestions,
                      personalLocations: _personalLocations,
                      personalBuddies: _personalBuddies,
                      batchLocations: batch,
                    );
                  },
                ),
              ),
              _bottomBar(
                selectedCount: selectedCount,
                readyCount: readyCount,
                blockingCount: blockingCount,
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _header(int blockingCount) {
    final reviewCount = _rows.where((r) => r.needsReview).length;
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 4, 16, 6),
      child: Row(
        children: [
          IconButton(
            icon: const Icon(Icons.arrow_back, color: Colors.white),
            onPressed: _importing ? null : () => Navigator.pop(context),
          ),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'Importer depuis photo',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 21,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                Text(
                  '${_rows.length} plongées trouvées · '
                  '$reviewCount à vérifier'
                  '${blockingCount > 0 ? ' · $blockingCount bloquée(s)' : ''}',
                  style: const TextStyle(color: Colors.white70, fontSize: 12),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _summary() {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.14),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: Colors.white.withValues(alpha: 0.20)),
        ),
        child: Row(
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(10),
              child: Image.memory(
                widget.imageBytes,
                width: 56,
                height: 72,
                fit: BoxFit.cover,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Format: ${widget.draft.detectedFormat}',
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Confiance globale: '
                    '${(widget.draft.overallConfidence * 100).round()}%',
                    style: const TextStyle(color: Colors.white70),
                  ),
                  if (widget.draft.warnings.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Text(
                      widget.draft.warnings.first,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: Colors.white70,
                        fontSize: 12,
                        fontStyle: FontStyle.italic,
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _bottomBar({
    required int selectedCount,
    required int readyCount,
    required int blockingCount,
  }) {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 18),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            AppColors.donkerblauw.withValues(alpha: 0),
            AppColors.donkerblauw.withValues(alpha: 0.56),
          ],
        ),
      ),
      child: SizedBox(
        width: double.infinity,
        child: ElevatedButton.icon(
          onPressed: readyCount == 0 || _importing ? null : _importSelected,
          icon: _importing
              ? const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: Colors.white,
                  ),
                )
              : const Icon(Icons.cloud_upload_outlined),
          label: Text(
            blockingCount > 0
                ? 'Importer $readyCount · $blockingCount à corriger'
                : 'Importer $selectedCount plongée(s)',
          ),
          style: ElevatedButton.styleFrom(
            backgroundColor: AppColors.middenblauw,
            foregroundColor: Colors.white,
            padding: const EdgeInsets.symmetric(vertical: 15),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(14),
            ),
          ),
        ),
      ),
    );
  }
}

class _ReviewCard extends StatefulWidget {
  final LogbookOcrSuggestedRow row;
  final ValueChanged<LogbookOcrSuggestedRow> onChanged;
  final List<String> locationSuggestions;
  final List<String> buddySuggestions;
  final Set<String> personalLocations;
  final Set<String> personalBuddies;
  /// Locations from other rows in this same OCR batch — likely the same
  /// trip / region. Surfaced at the top of the typeahead with a 🏖️ icon
  /// even when the query is still empty, so a Krk dive feels at home.
  final List<String> batchLocations;

  const _ReviewCard({
    required this.row,
    required this.onChanged,
    this.locationSuggestions = const [],
    this.buddySuggestions = const [],
    this.personalLocations = const {},
    this.personalBuddies = const {},
    this.batchLocations = const [],
  });

  @override
  State<_ReviewCard> createState() => _ReviewCardState();
}

class _ReviewCardState extends State<_ReviewCard> {
  late final TextEditingController _date;
  late final TextEditingController _location;
  late final TextEditingController _depth;
  late final TextEditingController _duration;
  late final TextEditingController _buddies;
  late final TextEditingController _notes;
  late final TextEditingController _lestage;

  // Persistent focus nodes so each rebuild (triggered by setState in the
  // parent after every keystroke via _emit) doesn't reset focus and bump
  // the cursor away to the next field.
  final FocusNode _locationFocus = FocusNode();
  final FocusNode _buddiesFocus = FocusNode();

  @override
  void initState() {
    super.initState();
    _date = TextEditingController(text: _formatDate(widget.row.date.value));
    _location =
        TextEditingController(text: widget.row.locationName.value ?? '');
    _depth = TextEditingController(
      text: widget.row.depthMaxMeters.value?.toStringAsFixed(0) ?? '',
    );
    _duration = TextEditingController(
      text: widget.row.durationMinutes.value?.toString() ?? '',
    );
    _buddies = TextEditingController(
      text: (widget.row.buddies.value ?? const []).join('; '),
    );
    _notes = TextEditingController(text: widget.row.notes.value ?? '');
    _lestage = TextEditingController(
      text: widget.row.lestageKg.value != null
          ? widget.row.lestageKg.value!.toStringAsFixed(0)
          : '',
    );
  }

  @override
  void dispose() {
    _date.dispose();
    _location.dispose();
    _depth.dispose();
    _duration.dispose();
    _buddies.dispose();
    _notes.dispose();
    _lestage.dispose();
    _locationFocus.dispose();
    _buddiesFocus.dispose();
    super.dispose();
  }

  void _toggleCounter(String key) {
    final r = widget.row;
    LogbookOcrField<bool> flip(LogbookOcrField<bool> f) => f.copyWith(
          value: !(f.value ?? false),
          needsReview: false,
        );
    LogbookOcrSuggestedRow next;
    switch (key) {
      case 'exo':
        next = r.copyWith(exo: flip(r.exo));
        break;
      case 'nitrox':
        next = r.copyWith(nitrox: flip(r.nitrox));
        break;
      case 'deco':
        next = r.copyWith(deco: flip(r.deco));
        break;
      case 'dp':
        next = r.copyWith(dp: flip(r.dp));
        break;
      case 'sf':
        next = r.copyWith(sf: flip(r.sf));
        break;
      case 'nuit':
        next = r.copyWith(night: flip(r.night));
        break;
      case 'mer':
        next = r.copyWith(sea: flip(r.sea));
        break;
      default:
        return;
    }
    widget.onChanged(next);
  }

  void _setCombi(Map<String, dynamic>? combi) {
    widget.onChanged(widget.row.copyWith(
      combi: LogbookOcrField<Map<String, dynamic>>(
        value: combi,
        confidence: widget.row.combi.confidence,
        raw: widget.row.combi.raw,
        needsReview: false,
      ),
    ));
  }

  void _setTank(Map<String, dynamic>? tank) {
    widget.onChanged(widget.row.copyWith(
      tank: LogbookOcrField<Map<String, dynamic>>(
        value: tank,
        confidence: widget.row.tank.confidence,
        raw: widget.row.tank.raw,
        needsReview: false,
      ),
    ));
  }

  void _emit() {
    final parsedDate = _parseDate(_date.text);
    final buddies = _buddies.text
        .split(RegExp(r'[;,]'))
        .map((s) => s.trim())
        .where((s) => s.isNotEmpty)
        .toList();

    widget.onChanged(
      widget.row.copyWith(
        date: LogbookOcrField<DateTime>(
          value: parsedDate,
          confidence: widget.row.date.confidence,
          raw: widget.row.date.raw,
          needsReview: parsedDate == null,
        ),
        locationName: LogbookOcrField<String>(
          value: _location.text.trim().isEmpty ? null : _location.text.trim(),
          confidence: widget.row.locationName.confidence,
          raw: widget.row.locationName.raw,
          needsReview: _location.text.trim().isEmpty,
        ),
        depthMaxMeters: LogbookOcrField<double>(
          value: double.tryParse(_depth.text.replaceAll(',', '.')),
          confidence: widget.row.depthMaxMeters.confidence,
          raw: widget.row.depthMaxMeters.raw,
          needsReview: false,
        ),
        durationMinutes: LogbookOcrField<int>(
          value: int.tryParse(_duration.text),
          confidence: widget.row.durationMinutes.confidence,
          raw: widget.row.durationMinutes.raw,
          needsReview: false,
        ),
        buddies: LogbookOcrField<List<String>>(
          value: buddies,
          confidence: widget.row.buddies.confidence,
          raw: widget.row.buddies.raw,
          needsReview: false,
        ),
        notes: LogbookOcrField<String>(
          value: _notes.text.trim().isEmpty ? null : _notes.text.trim(),
          confidence: widget.row.notes.confidence,
          raw: widget.row.notes.raw,
          needsReview: false,
        ),
        lestageKg: LogbookOcrField<double>(
          value: double.tryParse(_lestage.text.replaceAll(',', '.')),
          confidence: widget.row.lestageKg.confidence,
          raw: widget.row.lestageKg.raw,
          needsReview: false,
        ),
      ),
    );
  }

  DateTime? _parseDate(String value) {
    final parts = value.trim().split('/');
    if (parts.length != 3) return null;
    final day = int.tryParse(parts[0]);
    final month = int.tryParse(parts[1]);
    final year = int.tryParse(parts[2]);
    if (day == null || month == null || year == null) return null;
    return DateTime(year, month, day);
  }

  String _formatDate(DateTime? value) {
    if (value == null) return '';
    return '${value.day.toString().padLeft(2, '0')}/'
        '${value.month.toString().padLeft(2, '0')}/'
        '${value.year}';
  }

  @override
  Widget build(BuildContext context) {
    final row = widget.row;
    final badgeColor = row.hasBlockingIssues
        ? Colors.red.shade600
        : row.needsReview
            ? Colors.orange.shade700
            : Colors.green.shade700;
    final badgeText = row.hasBlockingIssues
        ? 'À corriger'
        : row.needsReview
            ? 'À vérifier'
            : 'Prête';

    return Container(
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.96),
        borderRadius: BorderRadius.circular(14),
      ),
      child: ExpansionTile(
        initiallyExpanded: row.needsReview,
        tilePadding: const EdgeInsets.fromLTRB(10, 4, 12, 4),
        childrenPadding: const EdgeInsets.fromLTRB(14, 0, 14, 14),
        leading: Checkbox(
          value: row.selected,
          onChanged: (v) => widget.onChanged(row.copyWith(selected: v)),
        ),
        title: Text(
          'N°${row.diveNumber.value ?? '—'} · '
          '${_formatDate(row.date.value).isEmpty ? row.dateRaw.value ?? 'date ?' : _formatDate(row.date.value)}',
          style: const TextStyle(fontWeight: FontWeight.w800),
        ),
        subtitle: Text(
          '${row.locationName.value ?? 'Lieu ?'} · '
          '${row.depthMaxMeters.value?.toStringAsFixed(0) ?? '?'} m · '
          '${row.durationMinutes.value?.toString() ?? '?'} min',
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
        ),
        trailing: Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          decoration: BoxDecoration(
            color: badgeColor.withValues(alpha: 0.12),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Text(
            badgeText,
            style: TextStyle(
              color: badgeColor,
              fontSize: 11,
              fontWeight: FontWeight.w800,
            ),
          ),
        ),
        children: [
          if (row.warnings.isNotEmpty) _warning(row.warnings.join(' · ')),
          _field('Date', _date, hint: 'JJ/MM/AAAA'),
          _autocompleteField(
            label: 'Lieu',
            controller: _location,
            suggestions: widget.locationSuggestions,
            warning: row.locationName.needsReview,
            hint: 'Tape pour rechercher dans le catalogue',
          ),
          Row(
            children: [
              Expanded(
                child: _field('Profondeur', _depth, suffix: 'm'),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _field('Durée', _duration, suffix: 'min'),
              ),
            ],
          ),
          _buddyAutocompleteField(),
          const SizedBox(height: 12),
          _countersRow(),
          const SizedBox(height: 12),
          _equipmentRow(),
          _field('Notes', _notes, maxLines: 2),
          const SizedBox(height: 4),
          Align(
            alignment: Alignment.centerRight,
            child: TextButton.icon(
              onPressed: _emit,
              icon: const Icon(Icons.check, size: 17),
              label: const Text('Appliquer les corrections'),
            ),
          ),
        ],
      ),
    );
  }

  Widget _countersRow() {
    final r = widget.row;
    final state = <String, bool>{
      'exo': r.exo.value == true,
      'nitrox': r.nitrox.value == true,
      'deco': r.deco.value == true,
      'dp': r.dp.value == true,
      'sf': r.sf.value == true,
      'nuit': r.night.value == true,
      'mer': r.sea.value == true,
    };
    // Same labels + tooltips as the manual entry form for consistency.
    const labels = <String, String>{
      'exo': 'Form.',
      'nitrox': 'Nitrox',
      'deco': 'Déco',
      'dp': 'DP',
      'sf': 'SF',
      'nuit': 'Nuit',
      'mer': 'Mer',
    };
    const tips = <String, String>{
      'exo':
          "Plongée d'exercice / formation (oefening LIFRAS, examen, opleiding).",
      'nitrox': 'Mélange nitrox (≥ 22 % O₂) au lieu d\'air.',
      'deco': 'Plongée avec paliers de décompression obligatoires.',
      'dp': 'Tu étais directeur de palanquée.',
      'sf': 'Tu étais serre-file de la palanquée.',
      'nuit': 'Plongée de nuit (immersion après le coucher du soleil).',
      'mer': 'Plongée en mer / eau salée.',
    };
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'COMPTEURS',
          style: TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w800,
            color: Colors.grey.shade600,
            letterSpacing: 0.6,
          ),
        ),
        const SizedBox(height: 6),
        Wrap(
          spacing: 6,
          runSpacing: 6,
          children: [
            for (final key in state.keys)
              Tooltip(
                message: tips[key]!,
                waitDuration: const Duration(milliseconds: 250),
                child: ChoiceChip(
                  label: Text(labels[key]!),
                  selected: state[key]!,
                  onSelected: (_) => _toggleCounter(key),
                  visualDensity: VisualDensity.compact,
                  selectedColor: AppColors.middenblauw,
                  labelStyle: TextStyle(
                    color: state[key]! ? Colors.white : Colors.grey.shade800,
                    fontWeight: FontWeight.w600,
                    fontSize: 12.5,
                  ),
                ),
              ),
          ],
        ),
      ],
    );
  }

  Widget _equipmentRow() {
    final r = widget.row;
    final combi = r.combi.value;
    final tank = r.tank.value;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'ÉQUIPEMENT',
          style: TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w800,
            color: Colors.grey.shade600,
            letterSpacing: 0.6,
          ),
        ),
        const SizedBox(height: 6),
        // Compact 1-line summaries that open a bottom-sheet on tap. Keeps the
        // review card readable while still letting the user pick from their
        // personal `Mes combinaisons` / `Mes bouteilles` catalogues.
        InkWell(
          onTap: () => _openCombiSheet(),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(
              color: Colors.grey.shade50,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: Colors.grey.shade300),
            ),
            child: Row(
              children: [
                Icon(Icons.checkroom_outlined,
                    size: 18, color: Colors.grey.shade600),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    combi == null || combi.isEmpty
                        ? 'Combinaison — toucher pour choisir'
                        : _combiLabel(combi),
                    style: TextStyle(
                      fontSize: 13,
                      color: combi == null || combi.isEmpty
                          ? Colors.grey.shade500
                          : Colors.grey.shade900,
                      fontStyle: combi == null || combi.isEmpty
                          ? FontStyle.italic
                          : FontStyle.normal,
                    ),
                  ),
                ),
                if (combi != null && combi.isNotEmpty)
                  IconButton(
                    icon: const Icon(Icons.close, size: 16),
                    visualDensity: VisualDensity.compact,
                    onPressed: () => _setCombi(null),
                  ),
                const Icon(Icons.expand_more, size: 18),
              ],
            ),
          ),
        ),
        const SizedBox(height: 6),
        InkWell(
          onTap: () => _openTankSheet(),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(
              color: Colors.grey.shade50,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: Colors.grey.shade300),
            ),
            child: Row(
              children: [
                Icon(Icons.propane_tank_outlined,
                    size: 18, color: Colors.grey.shade600),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    tank == null || tank.isEmpty
                        ? 'Bouteille — toucher pour choisir'
                        : _tankLabel(tank),
                    style: TextStyle(
                      fontSize: 13,
                      color: tank == null || tank.isEmpty
                          ? Colors.grey.shade500
                          : Colors.grey.shade900,
                      fontStyle: tank == null || tank.isEmpty
                          ? FontStyle.italic
                          : FontStyle.normal,
                    ),
                  ),
                ),
                if (tank != null && tank.isNotEmpty)
                  IconButton(
                    icon: const Icon(Icons.close, size: 16),
                    visualDensity: VisualDensity.compact,
                    onPressed: () => _setTank(null),
                  ),
                const Icon(Icons.expand_more, size: 18),
              ],
            ),
          ),
        ),
        const SizedBox(height: 6),
        TextField(
          controller: _lestage,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          onChanged: (_) => _emit(),
          onSubmitted: (_) => _emit(),
          decoration: InputDecoration(
            labelText: 'Lestage',
            hintText: 'ex. 6',
            suffixText: 'kg',
            filled: true,
            fillColor: Colors.grey.shade50,
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(10),
            ),
            isDense: true,
          ),
        ),
      ],
    );
  }

  String _combiLabel(Map<String, dynamic> m) {
    final label = (m['label'] as String?)?.trim();
    if (label != null && label.isNotEmpty) return label;
    final parts = <String>[
      m['type'] == 'etanche' ? 'Étanche' : 'Humide',
    ];
    final th = m['thickness_mm'];
    if (m['type'] == 'humide' && th is num) parts.add('${th.toInt()} mm');
    final brand = (m['brand'] as String?)?.trim();
    if (brand != null && brand.isNotEmpty) parts.add(brand);
    return parts.join(' · ');
  }

  String _tankLabel(Map<String, dynamic> m) {
    final label = (m['label'] as String?)?.trim();
    final v = m['volume_l'];
    final p = m['pressure_bar'];
    final base = (v is num && p is num) ? '${v.toInt()} L · ${p.toInt()} bar' : '';
    if (label != null && label.isNotEmpty) {
      return base.isEmpty ? label : '$label · $base';
    }
    return base.isEmpty ? 'Bouteille' : base;
  }

  Future<List<Map<String, dynamic>>> _loadMemberCatalog(String field) async {
    final auth = context.read<AuthProvider>();
    final userId = auth.currentUser?.uid;
    if (userId == null) return const [];
    try {
      final snap = await FirebaseFirestore.instance
          .collection('clubs').doc(FirebaseConfig.defaultClubId)
          .collection('members').doc(userId).get();
      final data = snap.data() ?? {};
      final raw = data[field] as List? ?? const [];
      return raw
          .whereType<Map>()
          .map((m) => Map<String, dynamic>.from(m))
          .toList();
    } catch (e) {
      debugPrint('[OcrReview] $field lookup failed: $e');
      return const [];
    }
  }

  Future<void> _openCombiSheet() async {
    final items = await _loadMemberCatalog('dive_combis');
    if (!mounted) return;
    final picked = await showModalBottomSheet<Map<String, dynamic>?>(
      context: context,
      builder: (ctx) => _PickerSheet(
        title: 'Choisir une combinaison',
        items: items,
        labelBuilder: _combiLabel,
        emptyText: 'Ajoute des combinaisons dans Mon Profil → Mes combinaisons.',
      ),
    );
    if (picked != null) _setCombi(picked);
  }

  Future<void> _openTankSheet() async {
    final items = await _loadMemberCatalog('dive_tanks');
    if (!mounted) return;
    final picked = await showModalBottomSheet<Map<String, dynamic>?>(
      context: context,
      builder: (ctx) => _PickerSheet(
        title: 'Choisir une bouteille',
        items: items,
        labelBuilder: _tankLabel,
        emptyText: 'Ajoute des bouteilles dans Mon Profil → Mes bouteilles.',
      ),
    );
    if (picked != null) _setTank(picked);
  }

  Widget _field(
    String label,
    TextEditingController controller, {
    String? hint,
    String? suffix,
    bool warning = false,
    int maxLines = 1,
  }) {
    return Padding(
      padding: const EdgeInsets.only(top: 10),
      child: TextField(
        controller: controller,
        maxLines: maxLines,
        onChanged: (_) => _emit(),
        onSubmitted: (_) => _emit(),
        decoration: InputDecoration(
          labelText: label,
          hintText: hint,
          suffixText: suffix,
          filled: true,
          fillColor: warning ? Colors.orange.shade50 : Colors.grey.shade50,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10),
          ),
          isDense: true,
        ),
      ),
    );
  }

  /// Single-value autocomplete (used for "Lieu"). Filters case-insensitive
  /// substring match against the suggestion list. Falls back to plain text
  /// entry when the catalog is empty / user types something off-list.
  Widget _autocompleteField({
    required String label,
    required TextEditingController controller,
    required List<String> suggestions,
    String? hint,
    bool warning = false,
  }) {
    return Padding(
      padding: const EdgeInsets.only(top: 10),
      child: RawAutocomplete<String>(
        textEditingController: controller,
        focusNode: _locationFocus,
        optionsBuilder: (textEditingValue) {
          final q = textEditingValue.text.trim().toLowerCase();
          final batch = widget.batchLocations;
          // Empty query: surface neighbour-row picks first (vacation trip
          // bias) so the user can tap-fill without typing.
          if (q.isEmpty) {
            if (batch.isEmpty) return const Iterable<String>.empty();
            return batch.take(8);
          }
          // With a query: prepend matching batch picks, then full catalog
          // matches that aren't already in batch.
          final lcBatch = batch.map((s) => s.toLowerCase()).toSet();
          final batchMatches =
              batch.where((s) => s.toLowerCase().contains(q));
          final catalogMatches = suggestions.where((s) =>
              s.toLowerCase().contains(q) &&
              !lcBatch.contains(s.toLowerCase()));
          return <String>[...batchMatches, ...catalogMatches].take(8);
        },
        fieldViewBuilder: (context, ctrl, focus, onSubmit) {
          return TextField(
            controller: ctrl,
            focusNode: focus,
            onChanged: (_) => _emit(),
            onSubmitted: (_) {
              onSubmit();
              _emit();
            },
            decoration: InputDecoration(
              labelText: label,
              hintText: hint,
              filled: true,
              fillColor: warning ? Colors.orange.shade50 : Colors.grey.shade50,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(10),
              ),
              isDense: true,
              suffixIcon: suggestions.isEmpty
                  ? null
                  : Icon(Icons.search,
                      size: 18, color: Colors.grey.shade500),
            ),
          );
        },
        optionsViewBuilder: (context, onSelected, options) {
          return Align(
            alignment: Alignment.topLeft,
            child: Material(
              elevation: 4,
              borderRadius: BorderRadius.circular(10),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxHeight: 240, maxWidth: 360),
                child: ListView.builder(
                  padding: EdgeInsets.zero,
                  shrinkWrap: true,
                  itemCount: options.length,
                  itemBuilder: (_, i) {
                    final opt = options.elementAt(i);
                    final isPersonal = widget.personalLocations.contains(opt);
                    final isBatch =
                        widget.batchLocations.any((b) => b == opt);
                    return ListTile(
                      dense: true,
                      leading: isBatch
                          ? const Text('🏖️',
                              style: TextStyle(fontSize: 14))
                          : isPersonal
                              ? Icon(Icons.star,
                                  size: 14, color: Colors.amber.shade700)
                              : null,
                      horizontalTitleGap:
                          isBatch || isPersonal ? 4 : null,
                      title: Text(opt, style: const TextStyle(fontSize: 13.5)),
                      subtitle: isBatch
                          ? Text(
                              'autre plongée du même séjour',
                              style: TextStyle(
                                fontSize: 11,
                                color: Colors.cyan.shade700,
                              ),
                            )
                          : null,
                      onTap: () {
                        onSelected(opt);
                        _emit();
                      },
                    );
                  },
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  /// Multi-value autocomplete for the "Binômes" field. Values are separated
  /// by `;` — typing suggests against the LAST segment and tapping a
  /// suggestion replaces just that segment + appends a `; ` so the user
  /// can chain.
  Widget _buddyAutocompleteField() {
    return Padding(
      padding: const EdgeInsets.only(top: 10),
      child: RawAutocomplete<String>(
        textEditingController: _buddies,
        focusNode: _buddiesFocus,
        optionsBuilder: (textEditingValue) {
          final text = textEditingValue.text;
          final lastSep = text.lastIndexOf(RegExp(r'[;,]'));
          final fragment = (lastSep == -1
                  ? text
                  : text.substring(lastSep + 1))
              .trim()
              .toLowerCase();
          if (fragment.isEmpty) return const Iterable<String>.empty();
          return widget.buddySuggestions
              .where((s) => s.toLowerCase().contains(fragment))
              .take(8);
        },
        onSelected: (selection) {
          final text = _buddies.text;
          final lastSep = text.lastIndexOf(RegExp(r'[;,]'));
          final prefix = lastSep == -1 ? '' : '${text.substring(0, lastSep + 1)} ';
          final next = '$prefix$selection; ';
          _buddies.value = TextEditingValue(
            text: next,
            selection: TextSelection.collapsed(offset: next.length),
          );
          _emit();
        },
        fieldViewBuilder: (context, ctrl, focus, onSubmit) {
          return TextField(
            controller: ctrl,
            focusNode: focus,
            onChanged: (_) => _emit(),
            onSubmitted: (_) {
              onSubmit();
              _emit();
            },
            decoration: InputDecoration(
              labelText: 'Binômes',
              hintText: 'Tape un nom; un autre…',
              filled: true,
              fillColor: Colors.grey.shade50,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(10),
              ),
              isDense: true,
              suffixIcon: widget.buddySuggestions.isEmpty
                  ? null
                  : Icon(Icons.group_outlined,
                      size: 18, color: Colors.grey.shade500),
            ),
          );
        },
        optionsViewBuilder: (context, onSelected, options) {
          return Align(
            alignment: Alignment.topLeft,
            child: Material(
              elevation: 4,
              borderRadius: BorderRadius.circular(10),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxHeight: 240, maxWidth: 360),
                child: ListView.builder(
                  padding: EdgeInsets.zero,
                  shrinkWrap: true,
                  itemCount: options.length,
                  itemBuilder: (_, i) {
                    final opt = options.elementAt(i);
                    final isPersonal = widget.personalBuddies.contains(opt);
                    return ListTile(
                      dense: true,
                      leading: isPersonal
                          ? Icon(Icons.star,
                              size: 14, color: Colors.amber.shade700)
                          : const Icon(Icons.person_outline, size: 16),
                      horizontalTitleGap: 4,
                      title: Text(opt, style: const TextStyle(fontSize: 13.5)),
                      onTap: () => onSelected(opt),
                    );
                  },
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _warning(String text) {
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 4),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: Colors.orange.shade50,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: Colors.orange.shade200),
      ),
      child: Text(
        text,
        style: TextStyle(
          color: Colors.orange.shade900,
          fontSize: 12.5,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}

/// Bottom-sheet picker for the member's personal combinaisons / bouteilles
/// catalogue. Returns the chosen map (or null on cancel).
class _PickerSheet extends StatelessWidget {
  final String title;
  final List<Map<String, dynamic>> items;
  final String Function(Map<String, dynamic>) labelBuilder;
  final String emptyText;

  const _PickerSheet({
    required this.title,
    required this.items,
    required this.labelBuilder,
    required this.emptyText,
  });

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              height: 4,
              width: 36,
              margin: const EdgeInsets.only(bottom: 12),
              decoration: BoxDecoration(
                color: Colors.grey.shade300,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            Text(
              title,
              style: const TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 8),
            if (items.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 18),
                child: Text(
                  emptyText,
                  style: TextStyle(
                    color: Colors.grey.shade600,
                    fontSize: 13,
                    fontStyle: FontStyle.italic,
                  ),
                ),
              )
            else
              Flexible(
                child: ListView.separated(
                  shrinkWrap: true,
                  itemCount: items.length,
                  separatorBuilder: (_, __) =>
                      Divider(height: 1, color: Colors.grey.shade200),
                  itemBuilder: (_, i) {
                    final item = items[i];
                    return ListTile(
                      title: Text(
                        labelBuilder(item),
                        style: const TextStyle(fontSize: 14),
                      ),
                      onTap: () => Navigator.of(context).pop(item),
                    );
                  },
                ),
              ),
            const SizedBox(height: 8),
            Align(
              alignment: Alignment.centerRight,
              child: TextButton(
                onPressed: () => Navigator.of(context).pop(),
                child: const Text('Annuler'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
