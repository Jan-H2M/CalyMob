import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:calymob/services/uddf_dive_log_adapter.dart';

void main() {
  test('parses a minimal synthetic UDDF dialect', () {
    const xml =
        '<uddf><dive><datetime>2026-10-22T10:00:00+02:00</datetime><duration>1800</duration><maxdepth>24.5</maxdepth><sample><depth>2</depth><temperature>18</temperature></sample></dive></uddf>';
    final result = const UddfDiveLogAdapter().parse(utf8.encode(xml));
    expect(result.vendor, 'uddf');
    expect(result.durationSeconds, 1800);
    expect(result.maxDepthMeters, 24.5);
    expect(result.depthUnit, UnitProvenance.unknown);
  });
}
