import 'dart:typed_data';

import 'package:calymob/services/suunto_share_inbox.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const channel = MethodChannel('calymob/suunto_share_inbox');

  tearDown(() => TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
      .setMockMethodCallHandler(channel, null));

  test('keeps share metadata and acknowledges only after the caller chooses',
      () async {
    final calls = <MethodCall>[];
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (call) async {
      calls.add(call);
      if (call.method == 'consume') {
        return <String, dynamic>{
          'id': 'inbox-1',
          'filename': 'shared-dive',
          'uti': 'public.json',
          'bytes': Uint8List.fromList([1, 2, 3]),
        };
      }
      return null;
    });

    final inbox = SuuntoShareInbox();
    final item = await inbox.consume();
    expect(item!.filename, 'shared-dive');
    expect(item.uti, 'public.json');
    expect(item.bytes, [1, 2, 3]);
    expect(calls, hasLength(1));

    await inbox.acknowledge(item.id);
    expect(calls.last.method, 'ack');
    expect(calls.last.arguments, 'inbox-1');
  });

  test('rejects malformed handoff data without acknowledging it', () async {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(channel, (call) async => <String, dynamic>{
              'id': 'inbox-1',
              'filename': 'broken.json',
              'uti': 'public.json',
            });

    expect(SuuntoShareInbox().consume(), throwsFormatException);
  });
}
