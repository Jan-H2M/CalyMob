import 'package:calymob/models/event_card_appearance.dart';
import 'package:calymob/models/activity_item.dart';
import 'package:calymob/models/operation.dart';
import 'package:calymob/models/piscine_session.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  final path = 'clubs/synthetic/operations/party/attachments/card_test.gif';
  Map<String, dynamic> image() => {
        'storagePath': path,
        'url':
            'https://firebasestorage.googleapis.com/v0/b/calycompta.firebasestorage.app/o/${Uri.encodeComponent(path)}?alt=media',
        'contentType': 'image/gif',
        'size': 43,
        'name': 'party.gif'
      };
  test('old events and unknown future styles retain original appearance', () {
    expect(EventCardAppearance.fromMap(null), isNull);
    final unknown =
        EventCardAppearance.fromMap({'color': 'bad', 'theme': 'future'});
    expect(unknown!.accent, isNull);
    expect(unknown.hasArtwork, isFalse);
  });
  test('manual colors and themes survive serialization', () {
    for (final theme in ['none', 'christmas', 'sinterklaas', 'disco']) {
      final appearance =
          EventCardAppearance.fromMap({'color': '#aabbcc', 'theme': theme});
      expect(appearance!.accent, const Color(0xffaabbcc));
      expect(EventCardAppearance.fromMap(appearance.toMap())!.theme, theme);
    }
  });
  test(
      'custom GIF is accepted for its own event only, with no external image URL',
      () {
    final appearance =
        EventCardAppearance.fromMap({'theme': 'custom', 'image': image()});
    expect(appearance!.image, isNotNull);
    expect(appearance.image!.isGif, isTrue);
    expect(appearance.forTarget('synthetic', 'operations', 'party').hasArtwork,
        isTrue);
    expect(appearance.forTarget('synthetic', 'operations', 'other').hasArtwork,
        isFalse);
    expect(
        EventCardImage.fromMap(
            {...image(), 'url': 'https://example.com/tracker.gif'}),
        isNull);
    expect(EventCardImage.fromMap({...image(), 'size': 5242881}), isNull);
  });
  test(
      'Firestore operation and pool readers carry styling without changing roster or status',
      () async {
    final db = FakeFirebaseFirestore(),
        style = {'color': '#166534', 'theme': 'christmas', 'image': null};
    final op = db.collection('operations').doc('party');
    await op.set({'card_appearance': style, 'statut': 'ouvert'});
    final operation = Operation.fromFirestore(await op.get());
    expect(ActivityItem.fromOperation(operation).cardAppearance!.theme,
        'christmas');
    expect(operation.statut, 'ouvert');
    final ref = db.collection('piscine_sessions').doc('party');
    await ref.set({
      'card_appearance': style,
      'gonflage': {
        '22h30': [
          {
            'membre_id': 'synthetic',
            'membre_nom': 'Test',
            'membre_prenom': 'Test'
          }
        ]
      }
    });
    final pool = PiscineSession.fromFirestore(await ref.get());
    expect(ActivityItem.fromPiscineSession(pool).cardAppearance!.theme,
        'christmas');
    expect(pool.copyWith(lieu: 'Synthetic').cardAppearance!.theme, 'christmas');
    expect(pool.toFirestore()['card_appearance'], style);
    expect(pool.gonflage['22h30']!.single.membreId, 'synthetic');
  });
}
