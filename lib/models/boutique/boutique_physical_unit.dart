import 'boutique_unit_qr.dart';

class BoutiquePhysicalUnit {
  final Map<String, dynamic> data;
  BoutiquePhysicalUnit(Map<String, dynamic> value)
      : data = Map.unmodifiable(value);
  String get id => data['id'] as String;
  String get revision => data['revision'] as String;
  String get name => data['productName'] as String? ?? 'Article';
  String get variant => data['variantLabel'] as String? ?? '';
  String get location => data['location'] as String? ?? 'Lieu inconnu';
  String get finish => data['finish'] as String? ?? '';
  String get saleStatus => data['saleStatus'] as String? ?? '';
  String? get supplierBatchId => data['supplierBatchId'] as String?;
  String get supplierReference =>
      data['supplierOrderReference'] as String? ?? supplierBatchId ?? '';
  bool get inTransport => data['transportMissionId'] != null;
  String get customerName => data['customerName'] as String? ?? 'Stock club';
  bool get sold => saleStatus == 'sold';
  Map<String, dynamic> get selection => {'id': id, 'revision': revision};
  String get stage => switch (finish) {
        'unembroidered' => 'À contrôler',
        'to_jim' => 'Prévu pour Jim',
        'at_jim' => data['workshopReady'] == true
            ? 'Terminé chez Jim'
            : 'En cours chez Jim',
        'returned_embroidered' => 'Broderie terminée',
        'not_required_reviewed' => 'Sans broderie · contrôlé',
        _ => 'Préparation à vérifier',
      };
}

/// One physical place and one action per session; duplicate scans never add qty.
class BoutiqueScanSelection {
  final String clubId;
  final String location;
  final int maximum;
  final _units = <String, BoutiquePhysicalUnit>{};
  BoutiqueScanSelection(
      {required this.clubId, required this.location, this.maximum = 50});
  List<BoutiquePhysicalUnit> get units => List.unmodifiable(_units.values);
  bool contains(String id) => _units.containsKey(id);
  void remove(String id) => _units.remove(id);
  void add(BoutiquePhysicalUnit unit) {
    if (contains(unit.id)) {
      throw const FormatException('Cette pièce est déjà scannée.');
    }
    if (unit.sold) {
      throw const FormatException('Cette pièce a déjà été remise.');
    }
    if (unit.location != location) {
      throw FormatException(
          'Cette pièce est à ${unit.location}. Choisissez un lot à ce lieu.');
    }
    if (_units.length >= maximum) {
      throw FormatException('$maximum pièces maximum par lot.');
    }
    _units[unit.id] = unit;
  }

  String parse(String value) {
    final qr = BoutiqueUnitQr.parse(value.trim());
    if (qr == null) {
      throw const FormatException('Scannez le QR de la fiche article Calypso.');
    }
    if (qr.clubId != clubId) {
      throw const FormatException('Cette pièce appartient à un autre club.');
    }
    return qr.unitId;
  }
}
