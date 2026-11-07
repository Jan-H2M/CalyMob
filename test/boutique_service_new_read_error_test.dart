import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:calymob/services/boutique/boutique_operations_service.dart';
void main() {
 test('explains when the deployed service does not recognize a new read', () {
  final missing=FirebaseFunctionsException(code:'invalid-argument',message:'Demande Boutique invalide.');
  final denied=FirebaseFunctionsException(code:'permission-denied',message:'Accès refusé');
  expect(BoutiqueOperationsService.messageForNewRead(missing),'Cette rubrique nécessite une mise à jour du service Boutique.');
  expect(BoutiqueOperationsService.messageForNewRead(denied),'Accès refusé');
 });
}
