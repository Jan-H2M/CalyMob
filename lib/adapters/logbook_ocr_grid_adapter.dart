import '../models/logbook_ocr_import.dart';

/// Read-only projection of an OCR proposal onto the canonical logbook grid.
///
/// The source row remains the single source of truth. Confidence, raw OCR text
/// and review flags travel with every projected value and are never rewritten
/// by this adapter.
class LogbookOcrGridAdapter {
  const LogbookOcrGridAdapter();

  List<LogbookOcrGridValue> fields(LogbookOcrSuggestedRow row) => [
        _value(
          'dive_number',
          'N°',
          row.diveNumber,
          row.diveNumber.value?.toString(),
        ),
        _value('date', 'Date', row.date, _date(row.date.value), required: true),
        _value('entry_time', 'Immersion', row.entryTime, row.entryTime.value),
        _value('exit_time', 'Sortie', row.exitTime, row.exitTime.value),
        _value(
          'location',
          'Lieu',
          row.locationName,
          row.locationName.value,
          required: true,
          wide: true,
        ),
        _value(
          'depth',
          'Profondeur',
          row.depthMaxMeters,
          row.depthMaxMeters.value == null
              ? null
              : '${_number(row.depthMaxMeters.value!)} m',
        ),
        _value(
          'duration',
          'Durée',
          row.durationMinutes,
          row.durationMinutes.value == null
              ? null
              : '${row.durationMinutes.value} min',
        ),
        _value(
          'buddy',
          'Binôme',
          row.buddies,
          (row.buddies.value ?? const []).join(', '),
          wide: true,
        ),
        _value('combi', 'Combinaison', row.combi, _combi(row.combi.value)),
        _value('tank', 'Bouteille', row.tank, _tank(row.tank.value)),
        _value(
          'lestage',
          'Lestage',
          row.lestageKg,
          row.lestageKg.value == null
              ? null
              : '${_number(row.lestageKg.value!)} kg',
        ),
        _toggle('exo', 'Formation', row.exo),
        _toggle('nitrox', 'Nitrox', row.nitrox),
        _toggle('deco', 'Déco', row.deco),
        _toggle('dp', 'DP', row.dp),
        _toggle('sf', 'SF', row.sf),
        _toggle('nuit', 'Nuit', row.night),
        _toggle('mer', 'Mer', row.sea),
        _value('notes', 'Notes', row.notes, row.notes.value, wide: true),
      ];

  LogbookOcrGridValue _value<T>(
    String id,
    String label,
    LogbookOcrField<T> source,
    String? value, {
    bool required = false,
    bool wide = false,
  }) =>
      LogbookOcrGridValue(
        id: id,
        label: label,
        value: value?.trim().isEmpty == true ? null : value,
        required: required,
        wide: wide,
        confidence: source.confidence,
        raw: source.raw,
        needsReview: source.needsReview,
      );

  LogbookOcrGridValue _toggle(
    String id,
    String label,
    LogbookOcrField<bool> source,
  ) =>
      LogbookOcrGridValue(
        id: id,
        label: label,
        selected: source.value == true,
        confidence: source.confidence,
        raw: source.raw,
        needsReview: source.needsReview,
      );

  static String? _date(DateTime? value) {
    if (value == null) return null;
    return '${value.day.toString().padLeft(2, '0')}/'
        '${value.month.toString().padLeft(2, '0')}/'
        '${value.year}';
  }

  static String _number(num value) =>
      value == value.roundToDouble() ? value.toInt().toString() : '$value';

  static String? _combi(Map<String, dynamic>? value) {
    if (value == null || value.isEmpty) return null;
    final label = (value['label'] as String?)?.trim();
    if (label?.isNotEmpty == true) return label;
    return value['type'] == 'etanche' ? 'Étanche' : 'Humide';
  }

  static String? _tank(Map<String, dynamic>? value) {
    if (value == null || value.isEmpty) return null;
    final label = (value['label'] as String?)?.trim();
    final volume = value['volume_l'];
    final pressure = value['pressure_bar'];
    final details = [
      if (volume is num) '${_number(volume)} L',
      if (pressure is num) '${_number(pressure)} bar',
    ].join(' · ');
    if (label?.isNotEmpty == true) {
      return details.isEmpty ? label : '$label · $details';
    }
    return details.isEmpty ? 'Bouteille' : details;
  }
}

class LogbookOcrGridValue {
  final String id;
  final String label;
  final String? value;
  final bool? selected;
  final bool required;
  final bool wide;
  final double confidence;
  final String? raw;
  final bool needsReview;

  const LogbookOcrGridValue({
    required this.id,
    required this.label,
    this.value,
    this.selected,
    this.required = false,
    this.wide = false,
    required this.confidence,
    this.raw,
    this.needsReview = false,
  });

  bool get isToggle => selected != null;
}
