import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import '../../models/dive_computer_import.dart';
import '../../services/suunto_dive_log_adapter.dart';
import '../../services/suunto_share_inbox.dart';
import '../../services/dive_site_source.dart';
import '../../widgets/ocean/ocean_gradient_background.dart';

/// Files-based intake. The native iOS extension hands off into the same route
/// via an App Group inbox when the host app starts (see ios/ShareExtension).
class SuuntoImportScreen extends StatefulWidget {
  final DiveSiteSource? diveSiteSource;
  const SuuntoImportScreen({super.key, this.diveSiteSource});
  @override
  State<SuuntoImportScreen> createState() => _SuuntoImportScreenState();
}

class _SuuntoImportScreenState extends State<SuuntoImportScreen> {
  final _adapter = const SuuntoDiveLogAdapter();
  DiveComputerImportPreview? _preview;
  String? _error;
  String? _name;
  List<DiveSite> _nearbySites = const [];
  DiveSite? _chosenSite;
  final _freeTextSite = TextEditingController();
  bool _working = false;

  @override
  void initState() {
    super.initState();
    _consumeShareInbox();
  }

  Future<void> _consumeShareInbox() async {
    try {
      final bytes = await SuuntoShareInbox().consume();
      if (bytes == null || !mounted) return;
      _parse(bytes, 'Suunto partagé.json');
    } catch (_) {
      // The regular Files picker remains available when no iOS handoff exists.
    }
  }

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
      await _parse(bytes, file.name);
    } catch (error) {
      if (mounted) setState(() => _error = 'Import Suunto impossible : $error');
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  Future<void> _parse(List<int> bytes, String name) async {
    final preview = _adapter.parse(bytes);
    if (!mounted) return;
    final source = widget.diveSiteSource;
    final sites = source != null && preview.locationHint != null
        ? await source.nearby(preview.locationHint!)
        : const <DiveSite>[];
    if (!mounted) return;
    setState(() {
      _preview = preview;
      _name = name;
      _nearbySites = sites;
      _chosenSite = null;
    });
  }

  @override
  void dispose() {
    _freeTextSite.dispose();
    super.dispose();
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
            if (_preview case final p?) ...[_previewCard(p), _locationCard(p)],
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
          'Profondeur max (valeur source) : ${p.maxDepthValue?.toStringAsFixed(1) ?? '—'} (${p.depthUnit.name})',
        ),
        Text(
          'Température (valeurs source) : ${p.minTemperatureValue?.toStringAsFixed(1) ?? '—'} – ${p.maxTemperatureValue?.toStringAsFixed(1) ?? '—'} (${p.temperatureUnit.name})',
        ),
        Text('Gaz : ${p.gasNumbers.isEmpty ? '—' : p.gasNumbers.join(', ')}'),
        Text(
          'Alertes/appareil : ${p.events.where((e) => e.category == 'Warning' || e.category == 'Alarm').length}',
        ),
        if (p.tanks.isNotEmpty) ...[
          const SizedBox(height: 8),
          ...p.tanks.map(
            (tank) => Text(
              'Gaz ${tank.gasNumber}: ${tank.startPressureValue?.toStringAsFixed(0) ?? '—'} → ${tank.endPressureValue?.toStringAsFixed(0) ?? '—'} (pression source, ${tank.pressureUnit.name})',
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
  Widget _locationCard(DiveComputerImportPreview p) => _card(
    Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'Site de plongée',
          style: TextStyle(fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 6),
        if (p.locationHint != null && _nearbySites.isNotEmpty)
          DropdownButtonFormField<DiveSite>(
            value: _chosenSite,
            isExpanded: true,
            decoration: const InputDecoration(
              labelText: 'Sites proches (position non enregistrée)',
            ),
            items: _nearbySites
                .map(
                  (site) => DropdownMenuItem(
                    value: site,
                    child: Text(
                      '${site.name}${site.distanceKm == null ? '' : ' · ${site.distanceKm!.toStringAsFixed(1)} km'}',
                    ),
                  ),
                )
                .toList(),
            onChanged: (site) => setState(() => _chosenSite = site),
          )
        else if (p.locationHint != null)
          const Text(
            'Aucune source de sites géolocalisés n’est configurée; vous pouvez saisir le site librement.',
          ),
        TextField(
          controller: _freeTextSite,
          decoration: const InputDecoration(
            labelText: 'Ou saisir un site librement',
          ),
        ),
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
