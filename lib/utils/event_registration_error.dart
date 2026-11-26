import 'package:cloud_functions/cloud_functions.dart';

enum EventRegistrationAction { register, joinWaitlist, addGuest }

/// Public registration feedback must not expose a callable/JavaScript stack.
String eventRegistrationErrorMessage(
  Object error, {
  EventRegistrationAction action = EventRegistrationAction.register,
}) {
  const closed =
      'Les inscriptions sont fermées pour cette activité. Contactez l’organisateur.';
  const alreadyWaitlisted = 'Vous êtes déjà sur la liste d’attente.';
  const alreadyRegistered =
      'Une inscription existe déjà. Vérifiez vos inscriptions.';
  if (error is FirebaseFunctionsException) {
    final message = error.message ?? '';
    final normalized = message.replaceAll('’', "'");
    if (error.code == 'failed-precondition') {
      if (normalized.contains('Les inscriptions sont fermées')) {
        return closed;
      }
      if (normalized.contains("La date limite d'inscription est dépassée")) {
        return 'La date limite d’inscription est dépassée. '
            'Contactez l’organisateur.';
      }
      if (normalized.contains('invités ne sont pas autorisés')) {
        return 'Ces invités ne sont pas autorisés pour cette activité. '
            'Vérifiez votre sélection ou contactez l’organisateur.';
      }
      if (normalized.contains("La liste d'attente n'est pas disponible")) {
        return 'La liste d’attente n’est plus disponible pour cette activité. '
            'Actualisez l’événement ou contactez l’organisateur.';
      }
    }
    if (error.code == 'resource-exhausted' &&
        normalized.contains('Événement complet')) {
      return 'Cette activité est complète. '
          'Consultez la liste d’attente si elle est proposée.';
    }
    if (error.code == 'already-exists') {
      return normalized.contains("sur la liste d'attente")
          ? alreadyWaitlisted
          : alreadyRegistered;
    }
    if (error.code == 'not-found') {
      return 'Cette activité ou votre inscription n’est plus disponible. '
          'Actualisez la liste ou contactez l’organisateur.';
    }
    if ((error.code == 'failed-precondition' ||
            error.code == 'invalid-argument') &&
        (normalized.contains('Aucun tarif membre') ||
            normalized.contains("Tarif de l'événement invalide") ||
            normalized.contains('Tarif invité') ||
            normalized.contains("Montant d'inscription invalide"))) {
      return 'Les tarifs de cette activité doivent être corrigés. '
          'Contactez l’organisateur.';
    }
    if (error.code == 'permission-denied' || error.code == 'unauthenticated') {
      return 'Votre accès ne permet pas de confirmer cette inscription. '
          'Vérifiez votre connexion ou contactez l’organisateur.';
    }
  }
  if (action == EventRegistrationAction.joinWaitlist && error is Exception) {
    switch (error.toString()) {
      case 'Exception: Les inscriptions sont fermées pour cet événement':
        return closed;
      case 'Exception: Vous êtes déjà sur la liste d’attente':
        return alreadyWaitlisted;
      case 'Exception: Vous êtes déjà inscrit à cet événement':
        return alreadyRegistered;
    }
  }
  // A transport error can leave the status of the request unknown.
  return switch (action) {
    EventRegistrationAction.register =>
      'La confirmation de votre inscription n’a pas pu être affichée. '
          'Vérifiez vos inscriptions avant de réessayer ou contactez l’organisateur.',
    EventRegistrationAction.joinWaitlist =>
      'La confirmation de votre demande de mise en liste d’attente n’a pas pu être affichée. '
          'Vérifiez votre inscription avant de réessayer.',
    EventRegistrationAction.addGuest =>
      'La confirmation de l’ajout de l’invité n’a pas pu être affichée. '
          'Vérifiez vos invités avant de réessayer.',
  };
}
