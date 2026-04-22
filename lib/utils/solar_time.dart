import 'dart:math';

/// Berekent zonsopgang/zonsondergang en remapt de huidige tijd
/// naar een "tabel-uur" zodat de ocean background-tabel (die uitgaat van
/// een symmetrische dag van 6→18) de werkelijke daglengte volgt.
///
/// Standaard locatie: Antwerpen (Calypso clublokaal). DST wordt automatisch
/// correct opgevangen via [DateTime.timeZoneOffset].
class SolarTime {
  // Calypso duikclub — Antwerpen
  static const double defaultLatitude = 51.21;
  static const double defaultLongitude = 4.40;

  /// Tabel-ankerpunten — moeten overeenkomen met _sunTable in ocean_config.dart
  static const double tableSunrise = 6.0;
  static const double tableSolarNoon = 12.0;
  static const double tableSunset = 18.5;

  /// Berekent zonsopgang en zonsondergang in lokale uren (0..24) voor
  /// de gegeven datum en locatie. Gebruikt de NOAA solar position formule.
  ///
  /// Returnt een record met `sunrise` en `sunset` in lokale uren (decimaal).
  static ({double sunrise, double sunset, double solarNoon}) computeSunTimes({
    required DateTime date,
    double latitude = defaultLatitude,
    double longitude = defaultLongitude,
  }) {
    // Day of year (1..366)
    final startOfYear = DateTime(date.year, 1, 1);
    final dayOfYear = date.difference(startOfYear).inDays + 1;

    // Fractional year in radians (Spencer 1971)
    final gamma = 2 * pi * (dayOfYear - 1) / 365.0;

    // Solar declination (radians)
    final decl = 0.006918
        - 0.399912 * cos(gamma)
        + 0.070257 * sin(gamma)
        - 0.006758 * cos(2 * gamma)
        + 0.000907 * sin(2 * gamma)
        - 0.002697 * cos(3 * gamma)
        + 0.00148 * sin(3 * gamma);

    // Equation of time (minuten)
    final eqTime = 229.18 * (
        0.000075
        + 0.001868 * cos(gamma)
        - 0.032077 * sin(gamma)
        - 0.014615 * cos(2 * gamma)
        - 0.040849 * sin(2 * gamma));

    final latRad = latitude * pi / 180.0;

    // Zenith voor zonsopgang/-ondergang met atmosferische refractie (90.833°)
    final zenith = 90.833 * pi / 180.0;
    final cosHA =
        (cos(zenith) - sin(latRad) * sin(decl)) / (cos(latRad) * cos(decl));

    // Solar noon in UTC-minuten vanaf middernacht UTC
    final solarNoonUTC = 720.0 - 4.0 * longitude - eqTime;

    final tzOffsetMinutes = date.timeZoneOffset.inMinutes;
    final solarNoonLocal = (solarNoonUTC + tzOffsetMinutes) / 60.0;

    // Pool-edge guards
    if (cosHA > 1) {
      // Polar night — geen zonsopgang
      return (sunrise: solarNoonLocal, sunset: solarNoonLocal, solarNoon: solarNoonLocal);
    }
    if (cosHA < -1) {
      // Midnight sun — zon komt nooit onder
      return (sunrise: 0.0, sunset: 24.0, solarNoon: solarNoonLocal);
    }

    // Hour angle (graden)
    final ha = acos(cosHA) * 180.0 / pi;

    final sunriseUTC = solarNoonUTC - 4.0 * ha;
    final sunsetUTC = solarNoonUTC + 4.0 * ha;

    final sunriseLocal = (sunriseUTC + tzOffsetMinutes) / 60.0;
    final sunsetLocal = (sunsetUTC + tzOffsetMinutes) / 60.0;

    return (
      sunrise: sunriseLocal,
      sunset: sunsetLocal,
      solarNoon: solarNoonLocal,
    );
  }

  /// Remapt de werkelijke lokale [realHour] (0..24) naar een tabel-uur
  /// zodat:
  ///   - werkelijke zonsopgang  → tabel-uur 6.0
  ///   - werkelijke solar noon  → tabel-uur 12.0
  ///   - werkelijke zonsondergang → tabel-uur 18.5
  /// Buiten daglicht wordt lineair geïnterpoleerd richting middernacht (0/24).
  static double remapToTableHour({
    required double realHour,
    required double sunrise,
    required double sunset,
    required double solarNoon,
  }) {
    // Clamp naar geldige range
    realHour = realHour.clamp(0.0, 24.0);

    if (realHour < sunrise) {
      // Nacht voor zonsopgang: [0..sunrise] → [0..tableSunrise]
      if (sunrise <= 0) return tableSunrise;
      return realHour / sunrise * tableSunrise;
    }
    if (realHour < solarNoon) {
      // Ochtend: [sunrise..solarNoon] → [tableSunrise..tableSolarNoon]
      final span = solarNoon - sunrise;
      if (span <= 0) return tableSolarNoon;
      return tableSunrise +
          (realHour - sunrise) / span * (tableSolarNoon - tableSunrise);
    }
    if (realHour < sunset) {
      // Namiddag: [solarNoon..sunset] → [tableSolarNoon..tableSunset]
      final span = sunset - solarNoon;
      if (span <= 0) return tableSunset;
      return tableSolarNoon +
          (realHour - solarNoon) / span * (tableSunset - tableSolarNoon);
    }
    // Nacht na zonsondergang: [sunset..24] → [tableSunset..24]
    final span = 24.0 - sunset;
    if (span <= 0) return tableSunset;
    return tableSunset + (realHour - sunset) / span * (24.0 - tableSunset);
  }

  /// Convenience: geeft het huidige tabel-uur (0..24) gebaseerd op de
  /// werkelijke lokale tijd en de zonsopgang/-ondergang voor vandaag.
  static double currentTableHour({
    DateTime? now,
    double latitude = defaultLatitude,
    double longitude = defaultLongitude,
  }) {
    final n = now ?? DateTime.now();
    final realHour = n.hour + n.minute / 60.0 + n.second / 3600.0;
    final times = computeSunTimes(
      date: n,
      latitude: latitude,
      longitude: longitude,
    );
    return remapToTableHour(
      realHour: realHour,
      sunrise: times.sunrise,
      sunset: times.sunset,
      solarNoon: times.solarNoon,
    );
  }
}
