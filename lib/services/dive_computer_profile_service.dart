import 'dart:convert';
import 'package:firebase_storage/firebase_storage.dart';

/// Reads the selected member's already-authorised profile object. It never
/// derives deco advice and returns only recorded profile channels.
class DiveComputerProfileService {
  final FirebaseStorage _storage;
  DiveComputerProfileService({FirebaseStorage? storage})
      : _storage = storage ?? FirebaseStorage.instance;
  Future<Map<String, dynamic>?> load(String path) async {
    final data = await _storage.ref(path).getData(8 * 1024 * 1024);
    if (data == null) return null;
    final decoded = jsonDecode(utf8.decode(data));
    return decoded is Map ? Map<String, dynamic>.from(decoded) : null;
  }
}
