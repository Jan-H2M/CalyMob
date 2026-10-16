/// Permanent contract shared with Calypso's received-piece A4 labels.
class BoutiqueUnitQr {
  static const kind = 'btq-unit-v1';
  static const path = '/stock/boutique/physical-stock';
  static final _id = RegExp(r'^[A-Za-z0-9_-]{1,128}$');
  final String clubId;
  final String unitId;
  const BoutiqueUnitQr({required this.clubId, required this.unitId});

  static BoutiqueUnitQr? parse(String value) {
    final uri = Uri.tryParse(value);
    if (uri == null ||
        uri.scheme != 'https' ||
        uri.host != 'caly.club' ||
        uri.port != 443 ||
        uri.path != path ||
        uri.userInfo.isNotEmpty ||
        uri.fragment.isNotEmpty) {
      return null;
    }
    final query = uri.queryParametersAll;
    if (['qr', 'club', 'unit'].any((key) => query[key]?.length != 1) ||
        query['qr']!.single != kind) {
      return null;
    }
    final club = query['club']!.single, unit = query['unit']!.single;
    if (!_id.hasMatch(club) || !_id.hasMatch(unit)) return null;
    return BoutiqueUnitQr(clubId: club, unitId: unit);
  }

  String get url {
    if (!_id.hasMatch(clubId) || !_id.hasMatch(unitId)) {
      throw const FormatException('Identité de pièce invalide.');
    }
    return Uri.https(
            'caly.club', path, {'qr': kind, 'club': clubId, 'unit': unitId})
        .toString();
  }

  /// Existing club member QR cards encode only the member document ID.
  static String? memberId(String value) => _id.hasMatch(value) ? value : null;
}
