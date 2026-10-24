import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'dart:typed_data';
import 'package:provider/provider.dart';
import '../../config/firebase_config.dart';
import '../../providers/auth_provider.dart';
import '../../providers/member_provider.dart';
import '../../models/dive_computer_import.dart';
import '../../services/suunto_share_inbox.dart';
import '../../services/dive_site_source.dart';
import '../../services/dive_computer_import_service.dart';
import '../../services/dive_log_import_registry.dart';
import '../../widgets/ocean/ocean_gradient_background.dart';

/// Files-based intake. The native iOS extension hands off into the same route
/// via an App Group inbox when provisioned, otherwise a 24-hour local-only
/// iOS pasteboard queue (see ios/ShareExtension).
class SuuntoImportScreen extends StatefulWidget {
  final DiveSiteSource? diveSiteSource;
  const SuuntoImportScreen({super.key, this.diveSiteSource});
  @override
  State<SuuntoImportScreen> createState() => _SuuntoImportScreenState();
}

class _SuuntoImportScreenState extends State<SuuntoImportScreen> {
  final _registry = const DiveLogImportRegistry();
  DiveComputerImportPreview? _preview;
  String? _error;
  String? _name;
  List<int>? _sourceBytes;
  SuuntoShareInboxItem? _pendingShare;
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
      final item = await SuuntoShareInbox().consume();
      if (item == null || !mounted) return;
      _pendingShare = item;
      await _parse(item.bytes, _filenameForShare(item));
      await SuuntoShareInbox().acknowledge(item.id);
      if (mounted) setState(() => _pendingShare = null);
    } catch (error) {
      if (mounted) setState(() => _error = 'Import impossible : $error');
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
        allowedExtensions: DiveLogImportRegistry.supportedExtensions,
        withData: true,
      );
      final file = picked != null && picked.files.isNotEmpty
          ? picked.files.single
          : null;
      if (file == null) return;
      final bytes = file.bytes;
      if (bytes == null || bytes.isEmpty)
        throw const FormatException(
          'Le fichier est vide ou inaccessible.',
        );
      if (bytes.length > 20 * 1024 * 1024)
        throw const FormatException('Le fichier dépasse la limite de 20 Mo.');
      await _parse(bytes, file.name);
    } catch (error) {
      if (mounted) setState(() => _error = 'Import impossible : $error');
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

  Future<void> _parse(List<int> bytes, String name) async {
    final preview = _registry.parse(bytes: Uint8List.fromList(bytes), filename: name);
    if (!mounted) return;
    final source = widget.diveSiteSource;
    final sites = source != null && preview.locationHint != null
        ? await source.nearby(preview.locationHint!)
        : const <DiveSite>[];
    if (!mounted) return;
    setState(() {
      _preview = preview;
      _name = name;
      _sourceBytes = bytes;
      _nearbySites = sites;
      _chosenSite = sites.isEmpty ? null : sites.first;
    });
  }

  String _filenameForShare(SuuntoShareInboxItem item) {
    if (item.filename.contains('.')) return item.filename;
    switch (item.uti) {
      case 'public.json':
        return '${item.filename}.json';
      case 'public.xml':
        return '${item.filename}.xml';
      case 'com.pkware.zip-archive':
        return '${item.filename}.zip';
      default:
        // FIT, UDDF and SSRF commonly arrive as public.data. Their bounded
        // signatures remain the registry fallback when a provider loses type.
        return item.filename;
    }
  }

  String _decimal(double? value) => value == null
      ? '—'
      : value.toStringAsFixed(1).replaceAll('.', ',');

  String _sourceWallClock(String source) {
    final match = RegExp(r'^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})')
        .firstMatch(source);
    return match == null
        ? source
        : '${match[3]}/${match[2]}/${match[1]} ${match[4]}:${match[5]}';
  }

  String _distanceLabel(double? km) {
    if (km == null) return '';
    return km < 1
        ? '${(km * 1000).round()} m'
        : '${km.toStringAsFixed(1).replaceAll('.', ',')} km';
  }

  @override
  void dispose() {
    _freeTextSite.dispose();
    super.dispose();
  }
  Future<void> _cancelOrClose() async { if (_pendingShare != null) await SuuntoShareInbox().discard(_pendingShare!.id); if (!mounted) return; if (Navigator.canPop(context)) { Navigator.pop(context, false); } else { setState(_reset); } }
  void _reset() { _preview=null; _error=null; _name=null; _sourceBytes=null; _pendingShare=null; _nearbySites=const []; _chosenSite=null; _freeTextSite.clear(); }

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
                      onPressed: _working ? null : _cancelOrClose,
                      icon: const Icon(Icons.arrow_back, color: Colors.white),
                    ),
                    TextButton(onPressed: _working ? null : _cancelOrClose, child: const Text('Annuler', style: TextStyle(color: Colors.white))),
                    const Expanded(
                      child: Text(
                        'Importer depuis une app de plongée',
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
                  'Choisissez un export depuis Fichiers. Les coordonnées, itinéraires, numéros de série et données personnelles ne sont pas importés.',
                  style: TextStyle(color: Colors.white70),
                ),
                const SizedBox(height: 16),
                OutlinedButton.icon(
                  onPressed: _working ? null : _pick,
                  icon: const Icon(Icons.upload_file),
                  label: Text(
                    _name == null
                        ? 'Choisir un fichier (.json, .fit, .uddf, .xml, .ssrf, .zip)'
                        : 'Choisir un autre fichier',
                  ),
                ),
                if (_preview case final p?) ...[_previewCard(p), _locationCard(p), _saveCard(p)],
                _card(const Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Formats et export par marque', style: TextStyle(fontWeight: FontWeight.w800)),
                    SizedBox(height: 6),
                    Text('Suunto (Suunto App)\nOuvrez la plongée → ••• → Partager / Exporter le journal (JSON) → choisissez CalyMob (ou fichier .json).\n\nGarmin (Garmin Dive / Connect)\nExportez l’activité en FIT (.fit) ou archive .zip, puis partagez-la vers CalyMob ou choisissez le fichier.\n\nShearwater (Shearwater Cloud)\nOuvrez la plongée → Exporter au format UDDF (.uddf / .xml) ou Subsurface, puis partagez vers CalyMob.\n\nMares / Scubapro / Aqualung / Cressi\nExportez la plongée depuis l’app du fabricant au format UDDF (.uddf / .xml) (ou via Subsurface), puis partagez vers CalyMob.\n\nSubsurface (Mobile / Desktop)\nExportez au format Subsurface XML (.ssrf / .xml) ou UDDF (.uddf) et partagez vers CalyMob.'),
                  ],
                )),
                if (_error != null)
                  _card(
                    Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(_error!, style: const TextStyle(color: Colors.redAccent)), if (_pendingShare != null) TextButton(onPressed: () async { final item = _pendingShare!; await SuuntoShareInbox().discard(item.id); if (mounted) setState(() { _pendingShare = null; _error = null; }); }, child: const Text('Ignorer ce fichier partagé'))]),
                  ),
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
            Text('Date : ${_sourceWallClock(p.startedAtSource)}'),
            Text('Durée : ${p.durationMinutes} min'),
            Text('Profondeur max : ${_decimal(p.maxDepthValue)} m'),
            if (p.minTemperatureValue != null || p.maxTemperatureValue != null)
              Text('Température : ${_decimal(p.minTemperatureValue)} – ${_decimal(p.maxTemperatureValue)} °C'),
            if (p.tanks.isNotEmpty) ...[
              const SizedBox(height: 8),
              ...p.tanks.map(
                (tank) => Text(
                  '${p.tanks.length == 1 ? 'Pression' : 'Bouteille ${tank.gasNumber}'} : ${tank.startPressureValue?.round() ?? '—'} → ${tank.endPressureValue?.round() ?? '—'} bar${tank.startPressureValue != null && tank.endPressureValue != null ? ' (${(tank.endPressureValue! - tank.startPressureValue!).round()} bar)' : ''}',
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
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: _nearbySites.map((site) => ChoiceChip(
                  selected: _chosenSite?.id == site.id,
                  onSelected: (selected) => setState(() => _chosenSite = selected ? site : null),
                  avatar: const Icon(Icons.location_pin, size: 16),
                  label: Text('${site.name} · ${_distanceLabel(site.distanceKm)}'),
                )).toList(),
              )
            else if (p.locationHint != null)
              const Text(
                'Aucune source de sites géolocalisés n’est configurée; vous pouvez saisir le site librement.',
              ),
            TextField(
              controller: _freeTextSite,
              onChanged: (_) => setState(() => _chosenSite = null),
              textInputAction: TextInputAction.done,
              onTapOutside: (_) => FocusScope.of(context).unfocus(),
              decoration: InputDecoration(
                labelText: 'Ou saisir un site librement',
                suffixIcon: _freeTextSite.text.isEmpty ? null : IconButton(icon: const Icon(Icons.clear), onPressed: () => setState(() => _freeTextSite.clear())),
              ),
            ),
          ],
        ),
      );
  Widget _saveCard(DiveComputerImportPreview preview) =>
      _card(Column(children: [
        const Text('Conservation : jusqu’à suppression de la plongée.'),
        const SizedBox(height: 12),
        ElevatedButton.icon(
            onPressed: _working ? null : () => _save(preview),
            icon: const Icon(Icons.save),
            label: const Text('Enregistrer comme nouvelle plongée')),
        Wrap(spacing: 8, children: [OutlinedButton.icon(onPressed: _working ? null : _pick, icon: const Icon(Icons.swap_horiz), label: const Text('Choisir un autre fichier')), TextButton.icon(onPressed: _working ? null : _cancelOrClose, icon: const Icon(Icons.close), label: const Text('Annuler'))]),
      ]));

  Future<void> _save(DiveComputerImportPreview preview) async {
    final user = context.read<AuthProvider>().currentUser;
    final bytes = _sourceBytes;
    final customSite = _freeTextSite.text.trim();
    if (user == null || bytes == null) return;
    final member = context.read<MemberProvider>();
    setState(() => _working = true);
    try {
      await DiveComputerImportService().saveAsNewEntry(
        clubId: FirebaseConfig.defaultClubId,
        memberId: user.uid,
        memberName: '${member.prenom ?? ''} ${member.nom ?? ''}'.trim(),
        preview: preview,
        originalBytes: Uint8List.fromList(bytes),
        locationId: _chosenSite?.id,
        locationName: _chosenSite?.name ?? (customSite.isEmpty ? null : customSite),
        country: _chosenSite?.country,
        isSea: _chosenSite?.isSea,
        zone: _chosenSite?.zone,
      );
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Nouvelle plongée enregistrée.')));
        Navigator.pop(context, true);
      }
    } on DuplicateDiveComputerImport {
      if (mounted)
        setState(() => _error =
            'Cette plongée semble déjà importée. Aucune plongée existante n’a été modifiée.');
    } catch (error) {
      if (mounted)
        setState(() => _error = 'Enregistrement impossible : $error');
    } finally {
      if (mounted) setState(() => _working = false);
    }
  }

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
