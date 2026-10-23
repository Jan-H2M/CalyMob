import 'dart:convert';
import 'package:crypto/crypto.dart';
import 'package:xml/xml.dart';
import '../models/dive_computer_import.dart';

/// Independent XML reader: no GPL Subsurface code or libdivecomputer linkage.
class SubsurfaceDiveLogAdapter {
  const SubsurfaceDiveLogAdapter();
  DiveComputerImportPreview parse(List<int> bytes) {
    final text = utf8.decode(bytes);
    if (!text.contains('<'))
      throw const FormatException(
          'Le .ssrf binaire n’est pas pris en charge; exportez Subsurface en XML.');
    final doc = XmlDocument.parse(text);
    final dive = doc.descendants.whereType<XmlElement>().firstWhere(
        (e) => e.name.local.toLowerCase() == 'dive',
        orElse: () =>
            throw const FormatException('Aucune plongée Subsurface trouvée.'));
    final source = dive.getAttribute('date') ?? dive.getAttribute('when');
    final start = source == null ? null : DateTime.tryParse(source);
    final duration =
        double.tryParse(dive.getAttribute('duration') ?? '')?.round() ?? 0;
    if (start == null || duration < 1)
      throw const FormatException('Date ou durée Subsurface invalide.');
    final depths = _values(dive, 'depth');
    final temps = _values(dive, 'temperature');
    return DiveComputerImportPreview(
        vendor: 'subsurface',
        sourceHash: sha256.convert(bytes).toString(),
        startedAt: start,
        startedAtSource: source,
        durationSeconds: duration,
        maxDepthValue: double.tryParse(dive.getAttribute('maxdepth') ?? '') ??
            _max(depths),
        depthUnit: UnitProvenance.unknown,
        minTemperatureValue: _min(temps),
        maxTemperatureValue: _max(temps),
        temperatureUnit: UnitProvenance.unknown,
        tanks: const [],
        gasNumbers: const [],
        events: const [],
        locationHint: null,
        profile: DiveComputerProfile(
            depth: depths,
            temperature: temps,
            pressureByGas: const {},
            events: const []),
        warnings: const []);
  }

  List<DiveProfilePoint> _values(XmlElement root, String name) => [
        for (final e in root.descendants.whereType<XmlElement>())
          if (e.name.local.toLowerCase() == name)
            if (double.tryParse(e.innerText.trim()) case final value?)
              DiveProfilePoint(
                  at: DateTime.fromMillisecondsSinceEpoch(0),
                  value: value,
                  unit: UnitProvenance.unknown)
      ];
  double? _min(List<DiveProfilePoint> x) =>
      x.isEmpty ? null : x.map((p) => p.value).reduce((a, b) => a < b ? a : b);
  double? _max(List<DiveProfilePoint> x) =>
      x.isEmpty ? null : x.map((p) => p.value).reduce((a, b) => a > b ? a : b);
}
