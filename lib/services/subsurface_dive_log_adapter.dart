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
    final depths = _values(dive, 'depth', start);
    final temps = _values(dive, 'temperature', start);
    return DiveComputerImportPreview(
        vendor: 'subsurface',
        sourceHash: sha256.convert(bytes).toString(),
        startedAt: start,
        startedAtSource: source!,
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

  List<DiveProfilePoint> _values(
    XmlElement root,
    String name,
    DateTime start,
  ) {
    final result = <DiveProfilePoint>[];
    for (final sample in root.descendants.whereType<XmlElement>()) {
      if (sample.name.local.toLowerCase() != 'sample') continue;
      final offsetSeconds = double.tryParse(
                sample.getAttribute('time') ??
                    sample.getAttribute('seconds') ??
                    '',
              )
              ?.round() ??
          0;
      for (final valueElement in sample.descendants.whereType<XmlElement>()) {
        if (valueElement.name.local.toLowerCase() != name) continue;
        final value = double.tryParse(valueElement.innerText.trim());
        if (value == null) continue;
        // `sample time` is an offset in seconds from dive start.
        result.add(DiveProfilePoint(
          at: start.add(Duration(seconds: offsetSeconds)),
          value: value,
          unit: UnitProvenance.unknown,
        ));
      }
    }
    return result;
  }
  double? _min(List<DiveProfilePoint> x) =>
      x.isEmpty ? null : x.map((p) => p.value).reduce((a, b) => a < b ? a : b);
  double? _max(List<DiveProfilePoint> x) =>
      x.isEmpty ? null : x.map((p) => p.value).reduce((a, b) => a > b ? a : b);
}
