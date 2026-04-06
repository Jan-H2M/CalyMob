import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Ocean parameters — adjustable via settings
class OceanParams {
  double waveAmp;
  double waveSpeed;
  double caustics;
  double rays;
  double rayCount;
  int fishCount;
  int jellyfishCount;
  int bubbleCount;
  int mantaCount;
  bool useRealTime; // true = device clock, false = manual hour

  OceanParams({
    this.waveAmp = 0.045,
    this.waveSpeed = 0.7,
    this.caustics = 0.5,
    this.rays = 0.35,
    this.rayCount = 6,
    this.fishCount = 3,
    this.jellyfishCount = 2,
    this.bubbleCount = 12,
    this.mantaCount = 1,
    this.useRealTime = true,
  });

  /// Named presets
  static OceanParams calm() => OceanParams(
    waveAmp: 0.025, waveSpeed: 0.4, caustics: 0.3, rays: 0.2, rayCount: 4,
    fishCount: 2, jellyfishCount: 1, bubbleCount: 8, mantaCount: 0,
  );

  static OceanParams lively() => OceanParams(
    waveAmp: 0.06, waveSpeed: 0.9, caustics: 0.7, rays: 0.5, rayCount: 8,
    fishCount: 5, jellyfishCount: 3, bubbleCount: 20, mantaCount: 2,
  );

  static OceanParams night() => OceanParams(
    waveAmp: 0.03, waveSpeed: 0.5, caustics: 0.2, rays: 0.1, rayCount: 3,
    fishCount: 2, jellyfishCount: 2, bubbleCount: 6, mantaCount: 1,
  );

  /// Save to SharedPreferences
  Future<void> save() async {
    final p = await SharedPreferences.getInstance();
    p.setDouble('ocean_waveAmp', waveAmp);
    p.setDouble('ocean_waveSpeed', waveSpeed);
    p.setDouble('ocean_caustics', caustics);
    p.setDouble('ocean_rays', rays);
    p.setDouble('ocean_rayCount', rayCount);
    p.setInt('ocean_fishCount', fishCount);
    p.setInt('ocean_jellyfishCount', jellyfishCount);
    p.setInt('ocean_bubbleCount', bubbleCount);
    p.setInt('ocean_mantaCount', mantaCount);
    p.setBool('ocean_useRealTime', useRealTime);
  }

  /// Load from SharedPreferences
  static Future<OceanParams> load() async {
    final p = await SharedPreferences.getInstance();
    return OceanParams(
      waveAmp: p.getDouble('ocean_waveAmp') ?? 0.045,
      waveSpeed: p.getDouble('ocean_waveSpeed') ?? 0.7,
      caustics: p.getDouble('ocean_caustics') ?? 0.5,
      rays: p.getDouble('ocean_rays') ?? 0.35,
      rayCount: p.getDouble('ocean_rayCount') ?? 6,
      fishCount: p.getInt('ocean_fishCount') ?? 3,
      jellyfishCount: p.getInt('ocean_jellyfishCount') ?? 2,
      bubbleCount: p.getInt('ocean_bubbleCount') ?? 12,
      mantaCount: p.getInt('ocean_mantaCount') ?? 1,
      useRealTime: p.getBool('ocean_useRealTime') ?? true,
    );
  }
}

/// Day/night color interpolation — mirrors the HTML prototype tables
/// Raw float RGB values (0.0-1.0) for direct shader uniform use.
/// Avoids Color API version issues across Flutter versions.
class OceanTimeColors {
  final double skyTopR, skyTopG, skyTopB;
  final double skyBotR, skyBotG, skyBotB;
  final double waterSurfR, waterSurfG, waterSurfB;
  final double waterDeepR, waterDeepG, waterDeepB;
  final double sunX, sunY, sunSize, sunIntensity;
  final double nightFactor;

  OceanTimeColors({
    required this.skyTopR, required this.skyTopG, required this.skyTopB,
    required this.skyBotR, required this.skyBotG, required this.skyBotB,
    required this.waterSurfR, required this.waterSurfG, required this.waterSurfB,
    required this.waterDeepR, required this.waterDeepG, required this.waterDeepB,
    required this.sunX, required this.sunY, required this.sunSize,
    required this.sunIntensity, required this.nightFactor,
  });

  /// Interpolate colors for a given hour (0-24)
  /// Returns raw float RGB values (0.0-1.0) for direct shader use
  static OceanTimeColors forHour(double hour) {
    hour = hour % 24;

    final skyColors = _interpolateTable(_skyTable, hour);
    final waterColors = _interpolateTable(_waterTable, hour);
    final sunData = _interpolateTable(_sunTable, hour);

    // Night factor: 0 = full day, 1 = full night
    double night = 0;
    if (hour < 6) night = 1.0;
    else if (hour < 8) night = 1.0 - (hour - 6) / 2.0;
    else if (hour < 18) night = 0.0;
    else if (hour < 20) night = (hour - 18) / 2.0;
    else night = 1.0;

    return OceanTimeColors(
      skyTopR: skyColors[0], skyTopG: skyColors[1], skyTopB: skyColors[2],
      skyBotR: skyColors[3], skyBotG: skyColors[4], skyBotB: skyColors[5],
      waterSurfR: waterColors[0], waterSurfG: waterColors[1], waterSurfB: waterColors[2],
      waterDeepR: waterColors[3], waterDeepG: waterColors[4], waterDeepB: waterColors[5],
      sunX: sunData[0],
      sunY: sunData[1],
      sunSize: sunData[2],
      sunIntensity: sunData[3],
      nightFactor: night,
    );
  }

  // Sky table: [hour, topR, topG, topB, botR, botG, botB]
  static final List<List<double>> _skyTable = [
    [0,    0.02, 0.02, 0.08, 0.04, 0.04, 0.12],
    [6,    0.15, 0.15, 0.30, 0.85, 0.50, 0.35],
    [7.5,  0.35, 0.55, 0.85, 0.95, 0.80, 0.65],
    [10,   0.40, 0.65, 0.95, 0.72, 0.85, 0.95],
    [12,   0.35, 0.60, 0.92, 0.68, 0.82, 0.94],
    [16,   0.38, 0.62, 0.93, 0.70, 0.83, 0.94],
    [18,   0.20, 0.25, 0.55, 0.90, 0.55, 0.30],
    [19.5, 0.10, 0.10, 0.25, 0.50, 0.25, 0.20],
    [21,   0.03, 0.03, 0.10, 0.06, 0.06, 0.15],
    [24,   0.02, 0.02, 0.08, 0.04, 0.04, 0.12],
  ];

  // Water table: [hour, surfR,G,B, deepR,G,B]
  // IMPORTANT: water stays azure blue even at night — never goes too dark/murky
  static final List<List<double>> _waterTable = [
    [0,    0.10, 0.25, 0.50, 0.05, 0.12, 0.32],   // midnight — dark azure, not black
    [6.5,  0.35, 0.68, 0.84, 0.08, 0.20, 0.40],   // dawn
    [8,    0.40, 0.77, 0.89, 0.09, 0.22, 0.41],   // morning
    [12,   0.42, 0.80, 0.91, 0.09, 0.22, 0.41],   // midday #6BCBE8
    [17,   0.40, 0.76, 0.88, 0.08, 0.20, 0.40],   // afternoon
    [18.5, 0.30, 0.55, 0.72, 0.08, 0.18, 0.38],   // sunset — still blue, not grey
    [19.5, 0.20, 0.42, 0.62, 0.06, 0.15, 0.35],   // dusk — azure deepening
    [21,   0.12, 0.30, 0.55, 0.05, 0.12, 0.32],   // night — deep azure
    [24,   0.10, 0.25, 0.50, 0.05, 0.12, 0.32],   // midnight — matches hour 0
  ];

  // Sun/Moon position: [hour, x, y(0=bottom,1=top), size, intensity]
  // Moon follows same arc as sun: left low → center high → right low
  // IMPORTANT: waterLine = 0.56, so rise/set Y must be >= 0.58 to stay above water
  // Zenith Y = 0.88 = high in sky, Horizon Y = 0.58 = just above waterline
  static final List<List<double>> _sunTable = [
    // === MOON ===
    [0,    0.5, 0.88, 0.03, 0.25],    // midnight — center, ZENITH (high!)
    [2,    0.65, 0.82, 0.03, 0.22],   // descending right
    [3.5,  0.78, 0.74, 0.03, 0.2],    // lower right
    [5,    0.88, 0.62, 0.03, 0.15],   // moon setting — near horizon
    [5.5,  0.92, 0.58, 0.03, 0.08],   // moon almost gone — AT waterline
    // === DAWN ===
    [6,    0.08, 0.58, 0.03, 0.15],   // sun appears — AT waterline left
    [6.5,  0.10, 0.64, 0.03, 0.8],    // sunrise — climbing
    // === SUN ===
    [9,    0.25, 0.78, 0.035, 0.9],   // morning — rising high
    [12,   0.5, 0.88, 0.03, 1.0],     // midday — center, ZENITH (high!)
    [15,   0.72, 0.78, 0.035, 0.9],   // afternoon — still high
    [18,   0.88, 0.62, 0.035, 0.85],  // sunset — near horizon
    // === DUSK ===
    [18.5, 0.92, 0.58, 0.03, 0.3],    // sun almost gone — AT waterline
    [19,   0.08, 0.58, 0.03, 0.08],   // moon appears — AT waterline left
    // === MOON ===
    [19.5, 0.10, 0.64, 0.03, 0.18],   // moonrise — climbing
    [20.5, 0.20, 0.72, 0.03, 0.22],   // moon rising
    [22,   0.35, 0.82, 0.03, 0.25],   // moon climbing high
    [24,   0.5, 0.88, 0.03, 0.25],    // midnight — center, ZENITH (high!)
  ];

  /// Generic table interpolation
  static List<double> _interpolateTable(List<List<double>> table, double hour) {
    for (int i = 0; i < table.length - 1; i++) {
      if (hour >= table[i][0] && hour <= table[i + 1][0]) {
        final range = table[i + 1][0] - table[i][0];
        if (range == 0) return table[i].sublist(1);
        final t = (hour - table[i][0]) / range;
        // Smoothstep interpolation
        final st = t * t * (3.0 - 2.0 * t);
        final a = table[i].sublist(1);
        final b = table[i + 1].sublist(1);
        return List.generate(a.length, (j) => a[j] + (b[j] - a[j]) * st);
      }
    }
    return table.last.sublist(1);
  }
}
