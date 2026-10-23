import 'dart:typed_data';
import 'package:flutter/services.dart';

/// iOS host bridge: returns the one-time App Group handoff and ensures the
/// host deletes it before Flutter sees it. Non-iOS platforms simply return null.
class SuuntoShareInbox {
  static const _channel = MethodChannel('calymob/suunto_share_inbox');
  Future<Uint8List?> consume() async {
    final value = await _channel.invokeMethod<dynamic>('consume');
    if (value is Uint8List) return value;
    if (value is ByteData) return value.buffer.asUint8List();
    return null;
  }
}
