/// Shared depth coercion for imported and manually entered logbook records.
/// Unknown/invalid is not measured zero. Pool sessions are not natural dives.
double? parseDiveDepth(dynamic value) {
  final depth = value is num
      ? value.toDouble()
      : value is String
          ? double.tryParse(value.trim().replaceAll(',', '.'))
          : null;
  return depth != null && depth.isFinite && depth >= 0 ? depth : null;
}

const diveDepthLabels = [
  '0–5',
  '5–10',
  '10–15',
  '15–20',
  '20–25',
  '25–30',
  '30–35',
  '35–40',
  '40+',
];

class DiveDepthDistribution {
  final List<int> buckets;
  final Map<int, int> atLeast;
  final int unknown;
  final int total;
  int get known => total - unknown;
  const DiveDepthDistribution(
      {required this.buckets,
      required this.atLeast,
      required this.unknown,
      required this.total});

  factory DiveDepthDistribution.fromEntries(
      Iterable<Map<String, dynamic>> entries) {
    final buckets = List<int>.filled(diveDepthLabels.length, 0);
    final thresholds = {20: 0, 30: 0, 40: 0};
    var unknown = 0;
    var total = 0;
    for (final entry in entries) {
      if (entry['source'] == 'piscine') continue;
      total++;
      final depth = parseDiveDepth(entry['depth_max_meters']);
      if (depth == null) {
        unknown++;
        continue;
      }
      buckets[(depth / 5).floor().clamp(0, buckets.length - 1)]++;
      for (final threshold in thresholds.keys) {
        if (depth >= threshold) {
          thresholds[threshold] = thresholds[threshold]! + 1;
        }
      }
    }
    return DiveDepthDistribution(
        buckets: buckets, atLeast: thresholds, unknown: unknown, total: total);
  }
}
