import 'package:cloud_functions/cloud_functions.dart';

/// Public registration feedback must not expose a callable/JavaScript stack.
String eventRegistrationErrorMessage(Object error) {
  if (error is FirebaseFunctionsException) {
    final message = error.message ?? '';
    if ((error.code == 'failed-precondition' ||
            error.code == 'invalid-argument') &&
        (message.contains('Aucun tarif membre') ||
            message.contains('Tarif de l’événement invalide') ||
            message.contains('Tarif invité'))) {
      return 'Les tarifs de cette activité doivent être corrigés. '
          'Contactez l’organisateur ; ne modifiez pas votre catégorie de membre.';
    }
    if (error.code == 'permission-denied' || error.code == 'unauthenticated') {
      return 'Votre accès ne permet pas de confirmer cette inscription. '
          'Vérifiez votre connexion ou contactez l’organisateur.';
    }
  }
  // A transport error can be ambiguous: never claim the registration failed
  // definitively or ask the member to create a second one blindly.
  return 'La confirmation de votre inscription n’a pas pu être affichée. '
      'Vérifiez vos inscriptions avant de réessayer ou contactez l’organisateur.';
}
