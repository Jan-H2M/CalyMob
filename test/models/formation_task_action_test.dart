import 'package:calymob/models/formation_task.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('FormationTaskAction.fromValue', () {
    test('parses the canonical map shape', () {
      final action = FormationTaskAction.fromValue({
        'key': 'confirm',
        'label': 'Valider',
        'target_screen': 'monitor_validation',
      });

      expect(action.key, 'confirm');
      expect(action.label, 'Valider');
      expect(action.targetScreen, 'monitor_validation');
    });

    test('keeps a legacy string action from breaking the task stream', () {
      final action = FormationTaskAction.fromValue('accept');
      expect(action.key, 'accept');
      expect(action.label, 'accept');
    });
  });
}
