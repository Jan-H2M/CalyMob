import 'dart:typed_data';
import 'package:flutter/services.dart';

/// iOS host bridge: returns the one-time App Group handoff and ensures the
/// host deletes it before Flutter sees it. Non-iOS platforms simply return null.
class SuuntoShareInbox {
  static const _channel = MethodChannel('calymob/suunto_share_inbox');
  Future<SuuntoShareInboxItem?> consume() async {
    final value = await _channel.invokeMethod<dynamic>('consume');
    if (value is Map) return SuuntoShareInboxItem.fromMap(value);
    return null;
  }
  Future<bool> hasPending() async { try { return await _channel.invokeMethod<bool>('hasPending') ?? false; } on MissingPluginException { return false; } on PlatformException { return false; } }
  Future<void> acknowledge(String id) => _channel.invokeMethod<void>('ack', id);
  Future<void> discard(String id) => _channel.invokeMethod<void>('discard', id);
}

class SuuntoShareInboxItem {
  final String id;
  final String filename;
  final String uti;
  final Uint8List bytes;
  const SuuntoShareInboxItem({required this.id, required this.filename, required this.uti, required this.bytes});
  factory SuuntoShareInboxItem.fromMap(Map value) {
    final bytes = value['bytes'];
    if (value['id'] is! String || value['filename'] is! String || bytes is! Uint8List) {
      throw const FormatException('Transmission de fichier partagé invalide.');
    }
    return SuuntoShareInboxItem(id: value['id'] as String, filename: value['filename'] as String, uti: value['uti'] as String? ?? '', bytes: bytes);
  }
}
