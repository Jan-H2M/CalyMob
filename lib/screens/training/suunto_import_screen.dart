import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import '../../models/dive_computer_import.dart';
import '../../services/suunto_dive_log_adapter.dart';
import '../../widgets/ocean/ocean_gradient_background.dart';

/// Files-based intake. The native iOS extension hands off into the same route
/// via an App Group inbox when the host app starts (see ios/ShareExtension).
class SuuntoImportScreen extends StatefulWidget {
  const SuuntoImportScreen({super.key});
  @override
  State<SuuntoImportScreen> createState() => _SuuntoImportScreenState();
}

class _SuuntoImportScreenState extends State<SuuntoImportScreen> {
  final _adapter = const SuuntoDiveLogAdapter();
  DiveComputerImportPreview? _preview;
  String? _error;
  String? _name;
  bool _working = false;

  Future<void> _pick() async {
    setState(() {
      _working = true;
      _error = null;
    });
    try {
      final picked = await FilePicker.platform.pickFiles(
        type: FileType.custom,
        allowedExtensions: const ['json'],
        withData: true,
      );
      final file = picked != null && picked.files.isNotEmpty
          ? picked.files.single
          : null;
      if (file == null) return;
      final bytes = file.bytes;
      if (bytes == null || bytes.isEmpty)
        throw const FormatException(
          'Le fichier JSON est vide ou inaccessible.',
        );
      if (bytes.length > 20 * 1024 * 1024)
        throw const FormatException('Le fichier dépasse la limite de 20 Mo.');
      final preview = _adapter.parse(bytes);
      if (!mounted) return;
      setState(() {
        _preview = preview;
        _name = file.name;
      });
    } catch (error) {
      if (mounted) setState(() => _error = 'Import Suunto impossible : $error');
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    body: OceanGradientBackground(
      child: SafeArea(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Row(
              children: [
                IconButton(
                  onPressed: () => Navigator.pop(context),
                  icon: const Icon(Icons.arrow_back, color: Colors.white),
                ),
                const Expanded(
                  child: Text(
                    'Importer un journal Suunto',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 22,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            const Text(
              'Choisissez un export .json depuis Fichiers. Les coordonnées, itinéraires, numéros de série et données personnelles ne sont pas importés.',
              style: TextStyle(color: Colors.white70),
            ),
            const SizedBox(height: 16),
            OutlinedButton.icon(
              onPressed: _working ? null : _pick,
              icon: const Icon(Icons.upload_file),
              label: Text(
                _name == null
                    ? 'Choisir un fichier Suunto .json'
                    : 'Choisir un autre fichier',
              ),
            ),
            if (_error != null)
              _card(
                Text(_error!, style: const TextStyle(color: Colors.redAccent)),
              ),
            if (_preview case final p?) _previewCard(p),
          ],
        ),
      ),
    ),
  );

  Widget _previewCard(DiveComputerImportPreview p) => _card(
    Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Aperçu avant enregistrement',
          style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18),
        ),
        const SizedBox(height: 10),
        Text('Début : ${p.startedAt.toIso8601String()}'),
        Text('Durée : ${p.durationSeconds}s'),
        Text(
          'Profondeur max : ${p.maxDepthMeters?.toStringAsFixed(1) ?? '—'} m (${p.depthUnit.name})',
        ),
        Text(
          'Température : ${p.minTemperatureCelsius?.toStringAsFixed(1) ?? '—'} – ${p.maxTemperatureCelsius?.toStringAsFixed(1) ?? '—'} °C (${p.temperatureUnit.name})',
        ),
        Text('Gaz : ${p.gasNumbers.isEmpty ? '—' : p.gasNumbers.join(', ')}'),
        Text(
          'Alertes/appareil : ${p.events.where((e) => e.category == 'Warning' || e.category == 'Alarm').length}',
        ),
        if (p.tanks.isNotEmpty) ...[
          const SizedBox(height: 8),
          ...p.tanks.map(
            (tank) => Text(
              'Gaz ${tank.gasNumber}: ${tank.startPressureBar?.toStringAsFixed(0) ?? '—'} → ${tank.endPressureBar?.toStringAsFixed(0) ?? '—'} bar (${tank.pressureUnit.name})',
            ),
          ),
        ],
        if (p.locationHint != null)
          const Padding(
            padding: EdgeInsets.only(top: 8),
            child: Text(
              'Une position est disponible uniquement pour suggérer un site; elle ne sera pas enregistrée.',
            ),
          ),
        if (p.warnings.isNotEmpty) ...[
          const SizedBox(height: 8),
          ...p.warnings.map(Text.new),
        ],
      ],
    ),
  );
  Widget _card(Widget child) => Container(
    margin: const EdgeInsets.only(top: 16),
    padding: const EdgeInsets.all(16),
    decoration: BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(14),
    ),
    child: child,
  );
}
