import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:calymob/services/subsurface_dive_log_adapter.dart';

void main() {
  test('parses synthetic Subsurface XML independently', () {
    const xml =
        '<divelog><dive date="2026-10-22T10:00:00+02:00" duration="1800" maxdepth="25"><sample time="60"><depth>3</depth><temperature>18</temperature></sample></dive></divelog>';
    final result = const SubsurfaceDiveLogAdapter().parse(utf8.encode(xml));
    expect(result.vendor, 'subsurface');
    expect(result.durationSeconds, 1800);
    expect(result.startedAtSource, contains('+02:00'));
    expect(result.profile.depth.single.at, result.startedAt.add(const Duration(seconds: 60)));
  });
}
