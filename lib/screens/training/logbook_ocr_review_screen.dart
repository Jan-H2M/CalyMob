import 'dart:typed_data';

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

  @override
  void initState() {
    super.initState();
    _rows = [...widget.draft.rows];
  }

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
                  itemBuilder: (_, i) => _ReviewCard(
                    row: _rows[i],
                    onChanged: (next) => _replaceRow(i, next),
                  ),
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

  const _ReviewCard({
    required this.row,
    required this.onChanged,
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
  }

  @override
  void dispose() {
    _date.dispose();
    _location.dispose();
    _depth.dispose();
    _duration.dispose();
    _buddies.dispose();
    _notes.dispose();
    super.dispose();
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
          _field('Lieu', _location, warning: row.locationName.needsReview),
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
          _field('Binômes', _buddies, hint: 'Nom; Nom'),
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
