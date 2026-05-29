import 'package:cloud_firestore/cloud_firestore.dart';

import '../../models/boutique/boutique_product.dart';

class BoutiqueService {
  final FirebaseFirestore _firestore;

  BoutiqueService({FirebaseFirestore? firestore})
      : _firestore = firestore ?? FirebaseFirestore.instance;

  Stream<List<BoutiqueProduct>> watchPublishedProducts(String clubId) {
    return _firestore
        .collection('clubs')
        .doc(clubId)
        .collection('products')
        .where('visibility', isEqualTo: 'published')
        .snapshots()
        .map((snapshot) {
      final products =
          snapshot.docs.map(BoutiqueProduct.fromFirestore).toList();
      products.sort((a, b) => a.name.toLowerCase().compareTo(
            b.name.toLowerCase(),
          ));
      return products;
    });
  }
}
