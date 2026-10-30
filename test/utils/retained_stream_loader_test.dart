import 'dart:async';

import 'package:calymob/utils/retained_stream_loader.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('retains last value when the same source stalls, then retries',
      () async {
    var controller = StreamController<List<String>>();
    final loader = RetainedStreamLoader<List<String>>(
      streamFactory: () => controller.stream,
      timeout: const Duration(milliseconds: 10),
    );

    await loader.start();
    controller.add(const ['first']);
    await Future<void>.delayed(Duration.zero);
    expect(loader.value, const ['first']);

    await controller.close();
    controller = StreamController<List<String>>();
    await loader.start();
    await Future<void>.delayed(const Duration(milliseconds: 20));
    expect(loader.isStalled, isTrue);
    expect(loader.value, const ['first']);

    await controller.close();
    controller = StreamController<List<String>>();
    await loader.retry();
    controller.add(const ['second']);
    await Future<void>.delayed(Duration.zero);
    expect(loader.isStalled, isFalse);
    expect(loader.value, const ['second']);

    loader.dispose();
    await controller.close();
  });

  test('a different source immediately discards the previous scope', () async {
    final restricted = StreamController<List<String>>();
    final current = StreamController<List<String>>();
    final loader = RetainedStreamLoader<List<String>>(
      streamFactory: () => restricted.stream,
    );
    await loader.start();
    restricted.add(const ['restricted team']);
    await Future<void>.delayed(Duration.zero);
    expect(loader.value, const ['restricted team']);

    loader.replaceFactory(() => current.stream);
    expect(loader.hasValue, isFalse);
    expect(loader.value, isNull);
    restricted.add(const ['late restricted team']);
    await Future<void>.delayed(Duration.zero);
    expect(loader.value, isNull,
        reason: 'events from the previous scope must not restore its rows');

    await loader.start();
    current.add(const ['current team']);
    await Future<void>.delayed(Duration.zero);
    expect(loader.value, const ['current team']);
    loader.dispose();
    await restricted.close();
    await current.close();
  });
}
