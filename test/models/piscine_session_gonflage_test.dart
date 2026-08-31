import 'package:calymob/config/piscine_slots.dart';
import 'package:calymob/models/piscine_session.dart';
import 'package:fake_cloud_firestore/fake_cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';

Map<String, dynamic> member(String id) => {'membre_id': id};

Future<PiscineSession> session(dynamic gonflage) async {
  final ref = FakeFirebaseFirestore().collection('sessions').doc('test');
  await ref.set({'gonflage': gonflage});
  return PiscineSession.fromFirestore(await ref.get());
}

void main() {
  test('canonical gonflage slots and availability labels match web planning',
      () {
    expect(GonflageSlots.all, ['19h45', '20h15', '22h30']);
    expect(getSlotsForRole('gonflage'), GonflageSlots.all);
    expect(getSlotLabel('gonflage', GonflageSlots.all.last), '22h30');
    expect(EncadrantSlots.displayName(EncadrantSlots.deuxiemeHeure), '21h15');
    expect(EncadrantSlots.timeForLevel('2*'), '21h15');
  });

  test('reads current assignments without losing the third slot', () async {
    final result = await session({
      '19h45': [member('first')],
      '20h15': [member('second')],
      '22h30': [member('third')],
    });
    expect(result.gonflage.keys, GonflageSlots.all);
    expect(result.gonflage['22h30']!.single.membreId, 'third');
    expect(result.toFirestore()['gonflage']['22h30'][0]['membre_id'], 'third');
  });

  for (final legacy in ['21h30', '21h15']) {
    test('maps legacy $legacy when current slot is absent', () async {
      final result = await session({
        legacy: [member('legacy')]
      });
      expect(result.gonflage['22h30']!.single.membreId, 'legacy');
      expect(result.gonflage.containsKey(legacy), isFalse);
    });
  }

  test('current assignments win over both legacy slots', () async {
    final result = await session({
      '22h30': [member('current')],
      '21h30': [member('old')],
      '21h15': [member('older')],
    });
    expect(result.gonflage['22h30']!.map((m) => m.membreId), ['current']);
  });

  test('empty current slot falls back to 21h30 before 21h15', () async {
    final result = await session({
      '22h30': [],
      '21h30': [member('old')],
      '21h15': [member('older')],
    });
    expect(result.gonflage['22h30']!.single.membreId, 'old');
  });

  test('empty current and 21h30 slots fall back to 21h15', () async {
    final result = await session({
      '22h30': [],
      '21h30': [],
      '21h15': [member('older')],
    });
    expect(result.gonflage['22h30']!.single.membreId, 'older');
  });

  test('legacy array remains assigned to the first slot', () async {
    final result = await session([member('array')]);
    expect(result.gonflage['19h45']!.single.membreId, 'array');
    expect(result.gonflage['22h30'], isEmpty);
  });

  test('null gonflage returns three empty canonical slots', () async {
    final result = await session(null);
    expect(result.gonflage.keys, ['19h45', '20h15', '22h30']);
    expect(result.gonflage.values.every((members) => members.isEmpty), isTrue);
  });
}
