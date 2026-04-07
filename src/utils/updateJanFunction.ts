import { db } from '../lib/firebase';
import { collection, query, where, getDocs, updateDoc } from 'firebase/firestore';
import { logger } from '@/utils/logger';

export async function updateJanToEncadrant() {
  try {
    const membresRef = collection(db, 'clubs', 'janCalyclub', 'membres');
    const q = query(
      membresRef,
      where('prenom', '==', 'Jan'),
      where('nom', '==', 'Andriessens')
    );

    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      logger.debug('❌ Membre Jan Andriessens non trouvé');
      return false;
    }

    for (const doc of snapshot.docs) {
      const member = doc.data();
      logger.debug('📋 Membre trouvé:', member.prenom, member.nom);
      logger.debug('Fonction actuelle:', member.fonction_defaut || 'NON DÉFINIE');

      await updateDoc(doc.ref, {
        fonction_defaut: 'encadrant'
      });

      logger.debug('✅ Fonction mise à jour: encadrant');
    }

    return true;
  } catch (error) {
    logger.error('❌ Erreur lors de la mise à jour:', error);
    return false;
  }
}

// Fonction pour exécuter la mise à jour
// Appeler depuis la console du navigateur : updateJanFunction()
if (typeof window !== 'undefined') {
  (window as any).updateJanFunction = updateJanToEncadrant;
}
