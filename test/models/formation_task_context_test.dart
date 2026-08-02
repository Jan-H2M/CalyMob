import 'package:calymob/models/formation_task.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('parses the exact operation location snapshot', () {
    final context = FormationTaskContext.fromMap({
      'operation_id': 'operation',
      'operation_title': 'Sortie Zélande',
      'location_id': 'strijenham',
      'location_name': 'Strijenham',
      'location_country': 'NL',
      'location_is_sea': true,
      'location_zone': 'Zélande',
    });

    expect(context.operationTitle, 'Sortie Zélande');
    expect(context.locationName, 'Strijenham');
    expect(context.locationCountry, 'NL');
    expect(context.locationIsSea, isTrue);
    expect(context.locationZone, 'Zélande');
  });
}
