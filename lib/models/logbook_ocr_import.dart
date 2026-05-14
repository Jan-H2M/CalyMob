/// OCR/AI import draft for paper logbooks.
///
/// These models represent proposals only. They are deliberately separate from
/// StudentLogbookEntry because every extracted field can be uncertain and must
/// pass through a review step before it is written to the real carnet.

class LogbookOcrField<T> {
  final T? value;
  final double confidence;
  final String? raw;
  final bool needsReview;

  const LogbookOcrField({
    this.value,
    required this.confidence,
    this.raw,
    this.needsReview = false,
  });

  LogbookOcrField<T> copyWith({
    T? value,
    double? confidence,
    String? raw,
    bool? needsReview,
  }) {
    return LogbookOcrField<T>(
      value: value ?? this.value,
      confidence: confidence ?? this.confidence,
      raw: raw ?? this.raw,
      needsReview: needsReview ?? this.needsReview,
    );
  }
}

class LogbookOcrSuggestedRow {
  final String rowId;
  final bool selected;
  final double confidence;
  final List<String> warnings;
  final LogbookOcrField<int> diveNumber;
  final LogbookOcrField<DateTime> date;
  final LogbookOcrField<String> dateRaw;
  final LogbookOcrField<String> entryTime;
  final LogbookOcrField<String> exitTime;
  final LogbookOcrField<String> locationName;
  final LogbookOcrField<String> country;
  final LogbookOcrField<double> depthMaxMeters;
  final LogbookOcrField<int> durationMinutes;
  final LogbookOcrField<bool> deco;
  final LogbookOcrField<bool> night;
  final LogbookOcrField<bool> sea;
  final LogbookOcrField<List<String>> buddies;
  final LogbookOcrField<String> notes;

  const LogbookOcrSuggestedRow({
    required this.rowId,
    this.selected = true,
    required this.confidence,
    this.warnings = const [],
    this.diveNumber = const LogbookOcrField<int>(confidence: 0),
    this.date = const LogbookOcrField<DateTime>(confidence: 0),
    this.dateRaw = const LogbookOcrField<String>(confidence: 0),
    this.entryTime = const LogbookOcrField<String>(confidence: 0),
    this.exitTime = const LogbookOcrField<String>(confidence: 0),
    this.locationName = const LogbookOcrField<String>(confidence: 0),
    this.country = const LogbookOcrField<String>(confidence: 0),
    this.depthMaxMeters = const LogbookOcrField<double>(confidence: 0),
    this.durationMinutes = const LogbookOcrField<int>(confidence: 0),
    this.deco = const LogbookOcrField<bool>(confidence: 0),
    this.night = const LogbookOcrField<bool>(confidence: 0),
    this.sea = const LogbookOcrField<bool>(confidence: 0),
    this.buddies = const LogbookOcrField<List<String>>(confidence: 0),
    this.notes = const LogbookOcrField<String>(confidence: 0),
  });

  bool get hasBlockingIssues =>
      date.value == null ||
      (locationName.value == null || locationName.value!.trim().isEmpty);

  bool get needsReview =>
      hasBlockingIssues ||
      confidence < 0.85 ||
      warnings.isNotEmpty ||
      date.needsReview ||
      locationName.needsReview ||
      depthMaxMeters.needsReview ||
      durationMinutes.needsReview ||
      buddies.needsReview ||
      notes.needsReview;

  LogbookOcrSuggestedRow copyWith({
    bool? selected,
    double? confidence,
    List<String>? warnings,
    LogbookOcrField<int>? diveNumber,
    LogbookOcrField<DateTime>? date,
    LogbookOcrField<String>? dateRaw,
    LogbookOcrField<String>? entryTime,
    LogbookOcrField<String>? exitTime,
    LogbookOcrField<String>? locationName,
    LogbookOcrField<String>? country,
    LogbookOcrField<double>? depthMaxMeters,
    LogbookOcrField<int>? durationMinutes,
    LogbookOcrField<bool>? deco,
    LogbookOcrField<bool>? night,
    LogbookOcrField<bool>? sea,
    LogbookOcrField<List<String>>? buddies,
    LogbookOcrField<String>? notes,
  }) {
    return LogbookOcrSuggestedRow(
      rowId: rowId,
      selected: selected ?? this.selected,
      confidence: confidence ?? this.confidence,
      warnings: warnings ?? this.warnings,
      diveNumber: diveNumber ?? this.diveNumber,
      date: date ?? this.date,
      dateRaw: dateRaw ?? this.dateRaw,
      entryTime: entryTime ?? this.entryTime,
      exitTime: exitTime ?? this.exitTime,
      locationName: locationName ?? this.locationName,
      country: country ?? this.country,
      depthMaxMeters: depthMaxMeters ?? this.depthMaxMeters,
      durationMinutes: durationMinutes ?? this.durationMinutes,
      deco: deco ?? this.deco,
      night: night ?? this.night,
      sea: sea ?? this.sea,
      buddies: buddies ?? this.buddies,
      notes: notes ?? this.notes,
    );
  }
}

class LogbookOcrImportDraft {
  final String importJobId;
  final String detectedFormat;
  final String language;
  final double overallConfidence;
  final List<String> warnings;
  final List<LogbookOcrSuggestedRow> rows;

  const LogbookOcrImportDraft({
    required this.importJobId,
    required this.detectedFormat,
    required this.language,
    required this.overallConfidence,
    this.warnings = const [],
    required this.rows,
  });
}
