import 'dart:typed_data';
import '../models/dive_computer_import.dart';
import 'suunto_dive_log_adapter.dart';
import 'uddf_dive_log_adapter.dart';
import 'garmin_fit_dive_log_adapter.dart';
import 'subsurface_dive_log_adapter.dart';

/// Extension plus content sniffing prevents a renamed unrelated file from
/// reaching a vendor parser. Future adapters stay behind this same boundary.
class DiveLogImportRegistry {
  const DiveLogImportRegistry();
  static const supportedExtensions = [
    'json',
    'fit',
    'zip',
    'uddf',
    'xml',
    'ssrf'
  ];
  DiveComputerImportPreview parse(
      {required String filename, required Uint8List bytes}) {
    final lower = filename.toLowerCase();
    // Share sheets do not always preserve a useful extension. A recognised
    // signature is therefore an intentional fallback; each adapter still
    // validates the full vendor format before returning a preview.
    if ((lower.endsWith('.json') || _utf8Contains(bytes, '"DeviceLog"')) &&
        _utf8Contains(bytes, '"DeviceLog"'))
      return const SuuntoDiveLogAdapter().parse(bytes);
    if ((lower.endsWith('.fit') || _isFit(bytes)) && _isFit(bytes))
      return const GarminFitDiveLogAdapter().parse(bytes);
    if ((lower.endsWith('.zip') || _isZip(bytes)) && _isZip(bytes))
      return const GarminFitDiveLogAdapter().parse(bytes, zip: true);
    if ((lower.endsWith('.uddf') ||
            lower.endsWith('.xml') ||
            _utf8Contains(bytes, '<uddf')) &&
        _utf8Contains(bytes, '<uddf'))
      return const UddfDiveLogAdapter().parse(bytes);
    if ((lower.endsWith('.xml') ||
            lower.endsWith('.ssrf') ||
            _utf8Contains(bytes, '<dive')) &&
        _utf8Contains(bytes, '<dive'))
      return const SubsurfaceDiveLogAdapter().parse(bytes);
    throw const FormatException(
        'Format de journal non reconnu ou non pris en charge.');
  }

  bool _utf8Contains(Uint8List bytes, String needle) =>
      String.fromCharCodes(bytes.take(4096)).contains(needle);
  bool _isFit(Uint8List bytes) =>
      bytes.length > 12 &&
      bytes[8] == 46 &&
      bytes[9] == 70 &&
      bytes[10] == 73 &&
      bytes[11] == 84;
  bool _isZip(Uint8List bytes) =>
      bytes.length > 3 &&
      bytes[0] == 80 &&
      bytes[1] == 75 &&
      bytes[2] == 3 &&
      bytes[3] == 4;
}
