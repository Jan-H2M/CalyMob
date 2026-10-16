import 'dart:async';

import 'package:calymob/utils/retained_stream_loader.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('retains last value when a replacement stream stalls, then retries',
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
    loader.replaceFactory(() => controller.stream);
    await loader.start();
    await Future<void>.delayed(const Duration(milliseconds: 20));
    expect(loader.isStalled, isTrue);
    expect(loader.value, const ['first']);

    await controller.close();
    controller = StreamController<List<String>>();
    loader.replaceFactory(() => controller.stream);
    await loader.retry();
    controller.add(const ['second']);
    await Future<void>.delayed(Duration.zero);
    expect(loader.isStalled, isFalse);
    expect(loader.value, const ['second']);

    loader.dispose();
    await controller.close();
  });
}
