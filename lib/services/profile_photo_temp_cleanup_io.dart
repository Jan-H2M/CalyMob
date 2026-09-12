import 'dart:io';

Future<void> deleteProfilePhotoTemporaryPath(String path) async {
  final file = File(path);
  if (await file.exists()) await file.delete();
}
