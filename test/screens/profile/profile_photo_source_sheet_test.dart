import 'package:calymob/screens/profile/identite_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  Future<ProfilePhotoSource?> openSheet(
    WidgetTester tester, {
    required bool cameraAvailable,
  }) async {
    ProfilePhotoSource? result;
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) => ElevatedButton(
            onPressed: () async {
              result = await showModalBottomSheet<ProfilePhotoSource>(
                context: context,
                builder: (_) =>
                    ProfilePhotoSourceSheet(cameraAvailable: cameraAvailable),
              );
            },
            child: const Text('Open'),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();
    return result;
  }

  testWidgets('mobile offers camera and permissionless gallery paths', (
    tester,
  ) async {
    await openSheet(tester, cameraAvailable: true);

    expect(find.text('Prendre une photo'), findsOneWidget);
    expect(find.text('Choisir depuis la galerie'), findsOneWidget);
    expect(find.text('Annuler'), findsOneWidget);
  });

  testWidgets('web keeps gallery flow and hides unsupported face camera', (
    tester,
  ) async {
    await openSheet(tester, cameraAvailable: false);

    expect(find.text('Prendre une photo'), findsNothing);
    expect(find.text('Choisir depuis la galerie'), findsOneWidget);
  });

  testWidgets('gallery selection and cancellation return distinct results', (
    tester,
  ) async {
    ProfilePhotoSource? selected;
    await tester.pumpWidget(
      MaterialApp(
        home: Builder(
          builder: (context) => Column(
            children: [
              ElevatedButton(
                onPressed: () async {
                  selected = await showModalBottomSheet<ProfilePhotoSource>(
                    context: context,
                    builder: (_) =>
                        const ProfilePhotoSourceSheet(cameraAvailable: true),
                  );
                },
                child: const Text('Open'),
              ),
              TextButton(
                onPressed: () => selected = null,
                child: const Text('Reset'),
              ),
            ],
          ),
        ),
      ),
    );

    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Choisir depuis la galerie'));
    await tester.pumpAndSettle();
    expect(selected, ProfilePhotoSource.gallery);

    await tester.tap(find.text('Open'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Annuler'));
    await tester.pumpAndSettle();
    expect(selected, isNull);
  });
}
