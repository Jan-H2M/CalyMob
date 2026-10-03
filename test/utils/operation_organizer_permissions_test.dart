import 'package:calymob/utils/operation_organizer_permissions.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('validators can open the organizer handover editor', () {
    expect(
      canOpenOperationEditor(
        appRole: 'validateur',
        isOriginalCreator: false,
        isCurrentOrganizer: false,
      ),
      isTrue,
    );
  });

  test('ordinary unrelated members cannot open the editor', () {
    expect(
      canOpenOperationEditor(
        appRole: 'user',
        isOriginalCreator: false,
        isCurrentOrganizer: false,
      ),
      isFalse,
    );
  });

  test('current organizer and original creator retain edit access', () {
    expect(
      canOpenOperationEditor(
        appRole: 'user',
        isOriginalCreator: true,
        isCurrentOrganizer: false,
      ),
      isTrue,
    );
    expect(
      canOpenOperationEditor(
        appRole: 'member',
        isOriginalCreator: false,
        isCurrentOrganizer: true,
      ),
      isTrue,
    );
  });
}
