import 'package:cloud_functions/cloud_functions.dart';

/// Public registration feedback must not expose a callable/JavaScript stack.
String eventRegistrationErrorMessage(Object error) {
  if (error is FirebaseFunctionsException) {
    final message = error.message ?? '';
    final normalized = message.replaceAll('’', "'");
    if (error.code == 'failed-precondition') {
      if (normalized.contains('Les inscriptions sont fermées')) {
        return 'Les inscriptions sont fermées pour cette activité. '
            'Contactez l’organisateur.';
      }
      if (normalized.contains("La date limite d'inscription est dépassée")) {
        return 'La date limite d’inscription est dépassée. '
            'Contactez l’organisateur.';
      }
      if (normalized.contains('invités ne sont pas autorisés')) {
        return 'Ces invités ne sont pas autorisés pour cette activité. '
            'Vérifiez votre sélection ou contactez l’organisateur.';
      }
    }
    if (error.code == 'resource-exhausted' &&
        normalized.contains('Événement complet')) {
      return 'Cette activité est complète. '
          'Consultez la liste d’attente si elle est proposée.';
    }
    if (error.code == 'already-exists') {
      return normalized.contains("sur la liste d'attente")
          ? 'Vous êtes déjà sur la liste d’attente.'
          : 'Une inscription existe déjà. Vérifiez vos inscriptions.';
    }
    if (error.code == 'not-found') {
      return 'Cette activité ou votre inscription n’est plus disponible. '
          'Actualisez la liste ou contactez l’organisateur.';
    }
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
