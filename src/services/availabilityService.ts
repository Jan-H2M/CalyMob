import { db } from '@/lib/firebase';
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  Timestamp
} from 'firebase/firestore';
import { Availability, AvailabilityByDate, AvailabilitySummary, SessionAssignment, AvailabilityDetail } from '@/types';
import { getFirstName, getLastName } from '@/utils/fieldMapper';
import { Membre } from '@/types';

/**
 * Service de gestion des disponibilités pour les séances piscine
 */
export class AvailabilityService {
  /**
   * Récupérer les disponibilités pour un mois donné
   */
  static async getAvailabilitiesForMonth(
    clubId: string,
    year: number,
    month: number
  ): Promise<Availability[]> {
    const availabilitiesRef = collection(db, 'clubs', clubId, 'availabilities');

    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 1);

    const q = query(
      availabilitiesRef,
      where('date', '>=', Timestamp.fromDate(startOfMonth)),
      where('date', '<', Timestamp.fromDate(endOfMonth)),
      orderBy('date', 'asc')
    );

    const snapshot = await getDocs(q);

    return snapshot.docs.map(doc => this.docToAvailability(doc));
  }

  /**
   * Récupérer les disponibilités pour une date spécifique
   */
  static async getAvailabilitiesForDate(
    clubId: string,
    date: Date
  ): Promise<Availability[]> {
    const availabilitiesRef = collection(db, 'clubs', clubId, 'availabilities');

    const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const endOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);

    const q = query(
      availabilitiesRef,
      where('date', '>=', Timestamp.fromDate(startOfDay)),
      where('date', '<', Timestamp.fromDate(endOfDay))
    );

    const snapshot = await getDocs(q);

    return snapshot.docs.map(doc => this.docToAvailability(doc));
  }

  /**
   * Parse un document Firestore en Availability — rétrocompatible avec time_slots
   */
  private static docToAvailability(doc: any): Availability {
    const data = doc.data();
    return {
      id: doc.id,
      membre_id: data.membre_id,
      membre_nom: data.membre_nom,
      membre_prenom: data.membre_prenom,
      date: data.date?.toDate() || new Date(),
      role: data.role,
      available: data.available,
      time_slots: Array.isArray(data.time_slots) ? data.time_slots : undefined,
      created_at: data.created_at?.toDate() || new Date(),
      updated_at: data.updated_at?.toDate() || new Date()
    } as Availability;
  }

  /**
   * Récupérer les membres avec un rôle spécifique (accueil, encadrant, ou gonflage)
   * Supporte toutes les variations: enkelvoud/meervoud, lowercase/capitalized
   */
  static async getMembersWithRole(
    clubId: string,
    role: 'accueil' | 'encadrant' | 'gonflage' | 'theorie'
  ): Promise<Membre[]> {
    // Théorie: alle encadrants kunnen théorie geven
    if (role === 'theorie') {
      return this.getMembersWithRole(clubId, 'encadrant');
    }
    const membersRef = collection(db, 'clubs', clubId, 'members');

    // Toutes mogelijke variaties van de rol
    // Note: Firestore array-contains is case-sensitive
    const roleVariations = [
      role,                                                    // 'encadrant' / 'accueil'
      role.charAt(0).toUpperCase() + role.slice(1),           // 'Encadrant' / 'Accueil'
      role + 's',                                              // 'encadrants' / 'accueils'
      role.charAt(0).toUpperCase() + role.slice(1) + 's',     // 'Encadrants' / 'Accueils'
    ];

    const seenIds = new Set<string>();
    const members: Membre[] = [];

    for (const roleVariation of roleVariations) {
      const q = query(
        membersRef,
        where('clubStatuten', 'array-contains', roleVariation)
      );

      const snapshot = await getDocs(q);

      for (const doc of snapshot.docs) {
        // Éviter les doublons
        if (!seenIds.has(doc.id)) {
          seenIds.add(doc.id);
          const data = doc.data();
          members.push({
            id: doc.id,
            ...data
          } as Membre);
        }
      }
    }

    return members;
  }

  /**
   * Obtenir tous les mardis d'un mois
   */
  static getTuesdaysOfMonth(year: number, month: number): Date[] {
    const tuesdays: Date[] = [];
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0); // Dernier jour du mois

    // Trouver le premier mardi
    let current = new Date(firstDay);
    while (current.getDay() !== 2) { // 2 = mardi
      current.setDate(current.getDate() + 1);
    }

    // Ajouter tous les mardis du mois
    while (current <= lastDay) {
      tuesdays.push(new Date(current));
      current.setDate(current.getDate() + 7);
    }

    return tuesdays;
  }

  /**
   * Créer un résumé des disponibilités pour un mois
   * Combine les disponibilités avec les membres ayant les rôles
   */
  static async getAvailabilitySummary(
    clubId: string,
    year: number,
    month: number
  ): Promise<AvailabilitySummary> {
    // Récupérer les données en parallèle
    const [availabilities, accueilMembers, encadrantMembers, gonflageMembers, theorieMembers] = await Promise.all([
      this.getAvailabilitiesForMonth(clubId, year, month),
      this.getMembersWithRole(clubId, 'accueil'),
      this.getMembersWithRole(clubId, 'encadrant'),
      this.getMembersWithRole(clubId, 'gonflage'),
      this.getMembersWithRole(clubId, 'theorie')
    ]);

    const tuesdays = this.getTuesdaysOfMonth(year, month);

    const availabilitiesByDate: AvailabilityByDate[] = tuesdays.map(tuesday => {
      const tuesdayStr = tuesday.toISOString().split('T')[0];

      // Filtrer les disponibilités pour cette date
      const dateAvailabilities = availabilities.filter(a => {
        const availDate = a.date.toISOString().split('T')[0];
        return availDate === tuesdayStr;
      });

      // Fonction pour créer un SessionAssignment à partir d'un Membre
      const toAssignment = (member: Membre): SessionAssignment => ({
        membre_id: member.id,
        membre_nom: getLastName(member) || '',
        membre_prenom: getFirstName(member) || ''
      });

      // Fonction pour créer un AvailabilityDetail avec time_slots
      const toDetail = (member: Membre, role: string): AvailabilityDetail => {
        const avail = dateAvailabilities.find(
          a => a.membre_id === member.id && a.role === role && a.available
        );
        return {
          membre_id: member.id,
          membre_nom: getLastName(member) || '',
          membre_prenom: getFirstName(member) || '',
          time_slots: avail?.time_slots
        };
      };

      // Trier les membres accueil
      const accueilAvailableIds = dateAvailabilities
        .filter(a => a.role === 'accueil' && a.available)
        .map(a => a.membre_id);
      const accueilUnavailableIds = dateAvailabilities
        .filter(a => a.role === 'accueil' && !a.available)
        .map(a => a.membre_id);
      const accueilIndicatedIds = [...accueilAvailableIds, ...accueilUnavailableIds];

      // Trier les membres encadrants
      const encadrantsAvailableIds = dateAvailabilities
        .filter(a => a.role === 'encadrant' && a.available)
        .map(a => a.membre_id);
      const encadrantsUnavailableIds = dateAvailabilities
        .filter(a => a.role === 'encadrant' && !a.available)
        .map(a => a.membre_id);
      const encadrantsIndicatedIds = [...encadrantsAvailableIds, ...encadrantsUnavailableIds];

      // Trier les membres gonflage
      const gonflageAvailableIds = dateAvailabilities
        .filter(a => a.role === 'gonflage' && a.available)
        .map(a => a.membre_id);
      const gonflageUnavailableIds = dateAvailabilities
        .filter(a => a.role === 'gonflage' && !a.available)
        .map(a => a.membre_id);
      const gonflageIndicatedIds = [...gonflageAvailableIds, ...gonflageUnavailableIds];

      // Trier les membres théorie
      const theorieAvailableIds = dateAvailabilities
        .filter(a => a.role === 'theorie' && a.available)
        .map(a => a.membre_id);
      const theorieUnavailableIds = dateAvailabilities
        .filter(a => a.role === 'theorie' && !a.available)
        .map(a => a.membre_id);
      const theorieIndicatedIds = [...theorieAvailableIds, ...theorieUnavailableIds];

      return {
        date: tuesday,
        accueil: {
          available: accueilMembers
            .filter(m => accueilAvailableIds.includes(m.id))
            .map(toAssignment),
          unavailable: accueilMembers
            .filter(m => accueilUnavailableIds.includes(m.id))
            .map(toAssignment),
          notIndicated: accueilMembers
            .filter(m => !accueilIndicatedIds.includes(m.id))
            .map(toAssignment)
        },
        encadrants: {
          available: encadrantMembers
            .filter(m => encadrantsAvailableIds.includes(m.id))
            .map(m => toDetail(m, 'encadrant')),
          unavailable: encadrantMembers
            .filter(m => encadrantsUnavailableIds.includes(m.id))
            .map(toAssignment),
          notIndicated: encadrantMembers
            .filter(m => !encadrantsIndicatedIds.includes(m.id))
            .map(toAssignment)
        },
        gonflage: {
          available: gonflageMembers
            .filter(m => gonflageAvailableIds.includes(m.id))
            .map(m => toDetail(m, 'gonflage')),
          unavailable: gonflageMembers
            .filter(m => gonflageUnavailableIds.includes(m.id))
            .map(toAssignment),
          notIndicated: gonflageMembers
            .filter(m => !gonflageIndicatedIds.includes(m.id))
            .map(toAssignment)
        },
        theorie: {
          available: theorieMembers
            .filter(m => theorieAvailableIds.includes(m.id))
            .map(m => toDetail(m, 'theorie')),
          unavailable: theorieMembers
            .filter(m => theorieUnavailableIds.includes(m.id))
            .map(toAssignment),
          notIndicated: theorieMembers
            .filter(m => !theorieIndicatedIds.includes(m.id))
            .map(toAssignment)
        }
      };
    });

    return {
      year,
      month,
      tuesdays,
      availabilitiesByDate
    };
  }
}
