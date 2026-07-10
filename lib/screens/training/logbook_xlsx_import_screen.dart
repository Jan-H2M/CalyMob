import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../config/firebase_config.dart';
import '../../providers/auth_provider.dart';
import '../../providers/member_provider.dart';
import '../../services/logbook_xlsx_import_service.dart';
import '../../widgets/ocean/ocean_gradient_background.dart';

class LogbookXlsxImportScreen extends StatefulWidget {
  const LogbookXlsxImportScreen({super.key});

  @override
  State<LogbookXlsxImportScreen> createState() =>
      _LogbookXlsxImportScreenState();
}

class _LogbookXlsxImportScreenState extends State<LogbookXlsxImportScreen> {
  final LogbookXlsxImportService _service = LogbookXlsxImportService();
  LogbookXlsxParseResult? _result;
  String? _fileName;
  String? _error;
  bool _working = false;
  int _imported = 0;
  int _failed = 0;
  int _attemptTotal = 0;
  final Set<int> _importedRowNumbers = {};

  @override
  Widget build(BuildContext context) {
    final result = _result;
    final remainingCount = result?.rows
            .where((row) =>
                row.isValid && !_importedRowNumbers.contains(row.rowNumber))
            .length ??
        0;
    return Scaffold(
      body: OceanGradientBackground(
        creatures: CreatureSet.jellyfishAndBubbles,
        child: SafeArea(
          child: Column(
            children: [
              _header(),
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                  children: [
                    _instructions(),
                    const SizedBox(height: 14),
                    OutlinedButton.icon(
                      onPressed: _working ? null : _pickFile,
                      icon: const Icon(Icons.upload_file),
                      label: Text(
                        _fileName == null
                            ? 'Choisir un fichier .xlsx'
                            : 'Choisir un autre fichier',
                      ),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: Colors.white,
                        side: const BorderSide(color: Colors.white70),
                        minimumSize: const Size.fromHeight(48),
                      ),
                    ),
                    if (_fileName != null) ...[
                      const SizedBox(height: 8),
                      Text(
                        _fileName!,
                        textAlign: TextAlign.center,
                        style: const TextStyle(color: Colors.white70),
                      ),
                    ],
                    if (_error != null) ...[
                      const SizedBox(height: 12),
                      _messageCard(_error!, error: true),
                    ],
                    if (result != null) ...[
                      const SizedBox(height: 14),
                      _summary(result),
                      if (result.headerWarning != null) ...[
                        const SizedBox(height: 10),
                        _messageCard(result.headerWarning!),
                      ],
                      const SizedBox(height: 10),
                      ...result.rows.take(100).map(_rowCard),
                      if (result.rows.length > 100)
                        const Padding(
                          padding: EdgeInsets.all(8),
                          child: Text(
                            'Aperçu limité aux 100 premières lignes.',
                            textAlign: TextAlign.center,
                            style: TextStyle(color: Colors.white70),
                          ),
                        ),
                      const SizedBox(height: 10),
                      ElevatedButton.icon(
                        onPressed:
                            _working || remainingCount == 0 ? null : _import,
                        icon: _working
                            ? const SizedBox(
                                width: 18,
                                height: 18,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: Colors.white,
                                ),
                              )
                            : const Icon(Icons.download_done),
                        label: Text(_working
                            ? 'Import ${_imported + _failed} / $_attemptTotal'
                            : remainingCount == 0
                                ? 'Toutes les lignes sont importées'
                                : 'Importer $remainingCount plongée(s)'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFF16834B),
                          foregroundColor: Colors.white,
                          minimumSize: const Size.fromHeight(50),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _header() => Padding(
        padding: const EdgeInsets.fromLTRB(8, 12, 16, 12),
        child: Row(
          children: [
            IconButton(
              onPressed: _working ? null : () => Navigator.of(context).pop(),
              icon: const Icon(Icons.arrow_back, color: Colors.white),
            ),
            const Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Mon carnet',
                      style: TextStyle(color: Colors.white70, fontSize: 12)),
                  Text(
                    'Importer depuis Excel',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 20,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      );

  Widget _instructions() => Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(16),
        ),
        child: const Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Format Calypso',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
            SizedBox(height: 6),
            Text(
              'Le fichier doit contenir au minimum une colonne « Date ». '
              'Les colonnes « Lieu », « Profondeur max (m) » et « Durée (min) » '
              'sont reconnues automatiquement. Tu vérifies toujours les lignes '
              'avant de confirmer l’import.',
            ),
          ],
        ),
      );

  Widget _summary(LogbookXlsxParseResult result) => Row(
        children: [
          Expanded(
            child: _countCard(
              label: 'VALIDES',
              count: result.validCount,
              color: const Color(0xFF16834B),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: _countCard(
              label: 'ERREURS',
              count: result.invalidCount,
              color: const Color(0xFFE5484D),
            ),
          ),
        ],
      );

  Widget _countCard({
    required String label,
    required int count,
    required Color color,
  }) =>
      Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(14),
        ),
        child: Column(
          children: [
            Text(label,
                style: TextStyle(
                    color: color, fontSize: 11, fontWeight: FontWeight.bold)),
            Text('$count',
                style: TextStyle(
                    color: color, fontSize: 26, fontWeight: FontWeight.w900)),
          ],
        ),
      );

  Widget _rowCard(ParsedLogbookXlsxRow row) => Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: row.isValid ? Colors.white : const Color(0xFFFFE8E8),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(
              row.isValid ? Icons.check_circle : Icons.error,
              color: row.isValid
                  ? const Color(0xFF16834B)
                  : const Color(0xFFE5484D),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Ligne ${row.rowNumber} · ${row.locationName}',
                    style: const TextStyle(fontWeight: FontWeight.bold),
                  ),
                  Text(
                    row.date == null
                        ? 'Date invalide'
                        : '${row.date!.day.toString().padLeft(2, '0')}/'
                            '${row.date!.month.toString().padLeft(2, '0')}/'
                            '${row.date!.year}',
                  ),
                  if (row.errors.isNotEmpty)
                    Text(row.errors.join(' · '),
                        style: const TextStyle(color: Color(0xFFB42318))),
                  if (row.warnings.isNotEmpty)
                    Text(row.warnings.join(' · '),
                        style: const TextStyle(color: Color(0xFF9A6700))),
                ],
              ),
            ),
          ],
        ),
      );

  Widget _messageCard(String message, {bool error = false}) => Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: error ? const Color(0xFFFFE8E8) : const Color(0xFFFFF4CE),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Text(
          message,
          style: TextStyle(
            color: error ? const Color(0xFFB42318) : const Color(0xFF7A4A00),
          ),
        ),
      );

  Future<void> _pickFile() async {
    setState(() => _error = null);
    try {
      final picked = await FilePicker.platform.pickFiles(
        type: FileType.custom,
        allowedExtensions: const ['xlsx'],
        withData: true,
      );
      if (picked == null) return;
      final file = picked.files.single;
      final bytes = file.bytes;
      if (bytes == null) throw 'Le fichier n’a pas pu être lu.';
      final result = _service.parse(bytes);
      if (!mounted) return;
      setState(() {
        _fileName = file.name;
        _result = result;
        _importedRowNumbers.clear();
        _imported = 0;
        _failed = 0;
        _error = result.rows.isEmpty
            ? 'Le fichier ne contient aucune ligne de données.'
            : null;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _result = null;
        _error = 'Lecture impossible : $error';
      });
    }
  }

  Future<void> _import() async {
    final result = _result;
    final userId = context.read<AuthProvider>().currentUser?.uid;
    final member = context.read<MemberProvider>();
    if (result == null || userId == null) return;
    final memberName = '${member.prenom ?? ''} ${member.nom ?? ''}'.trim();
    final validRows = result.rows
        .where((row) =>
            row.isValid && !_importedRowNumbers.contains(row.rowNumber))
        .toList();
    setState(() {
      _working = true;
      _imported = 0;
      _failed = 0;
      _attemptTotal = validRows.length;
    });
    for (final row in validRows) {
      try {
        await _service.importRow(
          clubId: FirebaseConfig.defaultClubId,
          memberId: userId,
          memberName: memberName,
          row: row,
        );
        if (mounted) {
          setState(() {
            _imported++;
            _importedRowNumbers.add(row.rowNumber);
          });
        }
      } catch (_) {
        if (mounted) setState(() => _failed++);
      }
    }
    if (!mounted) return;
    setState(() => _working = false);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          'Import terminé : $_imported ajoutée(s)'
          '${_failed > 0 ? ', $_failed échec(s)' : ''}.',
        ),
      ),
    );
    final remaining = result.rows.any(
        (row) => row.isValid && !_importedRowNumbers.contains(row.rowNumber));
    if (_failed == 0 && !remaining) Navigator.of(context).pop(true);
  }
}
