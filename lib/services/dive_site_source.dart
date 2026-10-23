import 'dart:math' as math;
import '../models/dive_computer_import.dart';

class DiveSite {
  final String id;
  final String name;
  final double latitude;
  final double longitude;
  final double? distanceKm;
  const DiveSite({
    required this.id,
    required this.name,
    required this.latitude,
    required this.longitude,
    this.distanceKm,
  });
}

/// Decouples the import from the eventually chosen club dive-site collection.
abstract class DiveSiteSource {
  Future<List<DiveSite>> nearby(DiveLocationHint hint);
}

/// Reusable implementation for an in-memory/cached site list.
class CoordinateDiveSiteSource implements DiveSiteSource {
  final Future<List<DiveSite>> Function() loadSites;
  CoordinateDiveSiteSource(this.loadSites);
  @override
  Future<List<DiveSite>> nearby(DiveLocationHint hint) async {
    final sites = await loadSites();
    final nearby = sites
        .map(
          (site) => DiveSite(
            id: site.id,
            name: site.name,
            latitude: site.latitude,
            longitude: site.longitude,
            distanceKm: _distance(hint, site),
          ),
        )
        .toList();
    nearby.sort((a, b) => a.distanceKm!.compareTo(b.distanceKm!));
    return nearby;
  }

  double distanceKm(DiveLocationHint hint, DiveSite site) =>
      _distance(hint, site);
  double _distance(DiveLocationHint a, DiveSite b) {
    const earthKm = 6371.0;
    final lat1 = a.latitude * 0.017453292519943295;
    final lat2 = b.latitude * 0.017453292519943295;
    final dLat = lat2 - lat1;
    final dLon = (b.longitude - a.longitude) * 0.017453292519943295;
    final h =
        (dLat / 2) * (dLat / 2) +
        (dLon / 2) * (dLon / 2) * _cos(lat1) * _cos(lat2);
    return earthKm * 2 * _asinSqrt(h);
  }

  double _cos(double value) => _mathCos(value);
  double _asinSqrt(double value) => _mathAsin(_mathSqrt(value.clamp(0, 1)));
}

// Avoid exposing coordinates beyond this source boundary. dart:math aliases
// keep the adapter and UI free of geospatial implementation details.
double _mathCos(double value) => math.cos(value);
double _mathAsin(double value) => math.asin(value);
double _mathSqrt(double value) => math.sqrt(value);
