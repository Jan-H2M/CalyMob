import { db } from '@/lib/firebase';
import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  Timestamp,
  onSnapshot
} from 'firebase/firestore';
import { PiscineSession, SessionAssignment, LevelAssignment, PiscineLevel, PiscineSessionStatus } from '@/types';
import { GONFLAGE_SLOTS, type GonflageSlot } from '@/types/piscineSlots';

/**
 * Service voor het beheren van piscine sessies (admin functies)
 */
export class PiscineSessionService {
  private static sessionsCollection(clubId: string) {
    return collection(db, 'clubs', clubId, 'piscine_sessions');
  }

  /**
   * Ophalen van alle sessies voor een maand
   */
  static async getSessionsForMonth(
    clubId: string,
    year: number,
    month: number
  ): Promise<PiscineSession[]> {
    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 1);

    const q = query(
      this.sessionsCollection(clubId),
      where('date', '>=', Timestamp.fromDate(startOfMonth)),
      where('date', '<', Timestamp.fromDate(endOfMonth)),
      orderBy('date', 'asc')
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => this.docToSession(doc));
  }

  /**
   * Real-time luisteren naar sessies voor een maand
   */
  static subscribeToSessionsForMonth(
    clubId: string,
    year: number,
    month: number,
    callback: (sessions: PiscineSession[]) => void
  ): () => void {
    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 1);

    const q = query(
      this.sessionsCollection(clubId),
      where('date', '>=', Timestamp.fromDate(startOfMonth)),
      where('date', '<', Timestamp.fromDate(endOfMonth)),
      orderBy('date', 'asc')
    );

    return onSnapshot(q, (snapshot) => {
      const sessions = snapshot.docs.map(doc => this.docToSession(doc));
      callback(sessions);
    });
  }

  /**
   * Real-time luisteren naar sessies binnen een datumbereik
   * Gebruikt voor de horizontale datumband (alle sessies van verleden tot toekomst)
   */
  static subscribeToSessionsRange(
    clubId: string,
    startDate: Date,
    endDate: Date,
    callback: (sessions: PiscineSession[]) => void
  ): () => void {
    const q = query(
      this.sessionsCollection(clubId),
      where('date', '>=', Timestamp.fromDate(startDate)),
      where('date', '<', Timestamp.fromDate(endDate)),
      orderBy('date', 'asc')
    );

    return onSnapshot(q, (snapshot) => {
      const sessions = snapshot.docs.map(doc => this.docToSession(doc));
      callback(sessions);
    });
  }

  /**
   * Ophalen van een specifieke sessie
   */
  static async getSession(clubId: string, sessionId: string): Promise<PiscineSession | null> {
    const docRef = doc(this.sessionsCollection(clubId), sessionId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) return null;
    return this.docToSession(docSnap);
  }

  /**
   * Nieuwe sessie aanmaken
   */
  static async createSession(
    clubId: string,
    data: Omit<PiscineSession, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<string> {
    const now = new Date();

    const sessionData: Record<string, unknown> = {
      operation_id: data.operationId,
      type: data.type || 'piscine',
      date: Timestamp.fromDate(data.date),
      lieu: data.lieu,
      horaire_debut: data.horaireDebut,
      horaire_fin: data.horaireFin,
      accueil: data.accueil.map(a => this.assignmentToMap(a)),
      baptemes: data.baptemes.map(a => this.assignmentToMap(a)),
      gonflage: this.gonflageToMap(data.gonflage),
      niveaux: this.niveauxToMap(data.niveaux),
      statut: data.statut,
      created_at: Timestamp.fromDate(now),
      updated_at: Timestamp.fromDate(now),
      created_by: data.createdBy
    };

    // Ajouter théorie si présent
    if (data.theorie) {
      sessionData.theorie = this.niveauxToMap(data.theorie);
    }

    const docRef = await addDoc(this.sessionsCollection(clubId), sessionData);
    return docRef.id;
  }

  /**
   * Sessie updaten
   */
  static async updateSession(
    clubId: string,
    sessionId: string,
    data: Partial<PiscineSession>
  ): Promise<void> {
    const docRef = doc(this.sessionsCollection(clubId), sessionId);

    const updateData: Record<string, unknown> = {
      updated_at: Timestamp.fromDate(new Date())
    };

    if (data.operationId !== undefined) updateData.operation_id = data.operationId;
    if (data.type !== undefined) updateData.type = data.type;
    if (data.date !== undefined) updateData.date = Timestamp.fromDate(data.date);
    if (data.lieu !== undefined) updateData.lieu = data.lieu;
    if (data.horaireDebut !== undefined) updateData.horaire_debut = data.horaireDebut;
    if (data.horaireFin !== undefined) updateData.horaire_fin = data.horaireFin;
    if (data.accueil !== undefined) updateData.accueil = data.accueil.map(a => this.assignmentToMap(a));
    if (data.baptemes !== undefined) updateData.baptemes = data.baptemes.map(a => this.assignmentToMap(a));
    if (data.gonflage !== undefined) updateData.gonflage = this.gonflageToMap(data.gonflage);
    if (data.niveaux !== undefined) updateData.niveaux = this.niveauxToMap(data.niveaux);
    if (data.theorie !== undefined) updateData.theorie = this.niveauxToMap(data.theorie);
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.statut !== undefined) updateData.statut = data.statut;

    await updateDoc(docRef, updateData);
  }

  /**
   * Lid toewijzen aan accueil
   */
  static async assignToAccueil(
    clubId: string,
    sessionId: string,
    member: SessionAssignment
  ): Promise<void> {
    const session = await this.getSession(clubId, sessionId);
    if (!session) throw new Error('Session not found');

    // Check of lid al is toegewezen (single slot — check only by member id)
    // Rétrocompatibilité: old heure values ('20h15', '21h15') are treated as equivalent
    const isDuplicate = session.accueil.some(a => a.membre_id === member.membre_id);
    if (isDuplicate) {
      return; // Al toegewezen
    }

    const newAccueil = [...session.accueil, member];
    await this.updateSession(clubId, sessionId, { accueil: newAccueil });
  }

  /**
   * Lid verwijderen uit accueil
   */
  static async removeFromAccueil(
    clubId: string,
    sessionId: string,
    membreId: string,
    slot?: string
  ): Promise<void> {
    const session = await this.getSession(clubId, sessionId);
    if (!session) throw new Error('Session not found');

    // Single accueil slot — remove by member id (slot param ignored for retrocompat)
    const newAccueil = session.accueil.filter(a => a.membre_id !== membreId);
    await this.updateSession(clubId, sessionId, { accueil: newAccueil });
  }

  /**
   * Lid toewijzen aan baptêmes
   */
  static async assignToBaptemes(
    clubId: string,
    sessionId: string,
    member: SessionAssignment
  ): Promise<void> {
    const session = await this.getSession(clubId, sessionId);
    if (!session) throw new Error('Session not found');

    if (session.baptemes.some(a => a.membre_id === member.membre_id)) {
      return;
    }

    const newBaptemes = [...session.baptemes, member];
    await this.updateSession(clubId, sessionId, { baptemes: newBaptemes });
  }

  /**
   * Lid verwijderen uit baptêmes
   */
  static async removeFromBaptemes(
    clubId: string,
    sessionId: string,
    membreId: string
  ): Promise<void> {
    const session = await this.getSession(clubId, sessionId);
    if (!session) throw new Error('Session not found');

    const newBaptemes = session.baptemes.filter(a => a.membre_id !== membreId);
    await this.updateSession(clubId, sessionId, { baptemes: newBaptemes });
  }

  /**
   * Lid toewijzen aan gonflage voor een specifiek tijdslot
   */
  static async assignToGonflage(
    clubId: string,
    sessionId: string,
    member: SessionAssignment,
    slot: GonflageSlot = '19h45'
  ): Promise<void> {
    const session = await this.getSession(clubId, sessionId);
    if (!session) throw new Error('Session not found');

    const currentSlotMembers = session.gonflage[slot] || [];
    if (currentSlotMembers.some(a => a.membre_id === member.membre_id)) {
      return; // Al toegewezen aan dit slot
    }

    const newGonflage = { ...session.gonflage };
    newGonflage[slot] = [...currentSlotMembers, member];
    await this.updateSession(clubId, sessionId, { gonflage: newGonflage });
  }

  /**
   * Lid verwijderen uit gonflage voor een specifiek tijdslot
   */
  static async removeFromGonflage(
    clubId: string,
    sessionId: string,
    membreId: string,
    slot: GonflageSlot = '19h45'
  ): Promise<void> {
    const session = await this.getSession(clubId, sessionId);
    if (!session) throw new Error('Session not found');

    const currentSlotMembers = session.gonflage[slot] || [];
    const newGonflage = { ...session.gonflage };
    newGonflage[slot] = currentSlotMembers.filter(a => a.membre_id !== membreId);
    await this.updateSession(clubId, sessionId, { gonflage: newGonflage });
  }

  /**
   * Encadrant toewijzen aan een théorie tijdslot
   */
  static async assignToTheorie(
    clubId: string,
    sessionId: string,
    slot: string,
    member: SessionAssignment
  ): Promise<void> {
    const session = await this.getSession(clubId, sessionId);
    if (!session) throw new Error('Session not found');

    const theorie = session.theorie || {};
    const currentSlot = theorie[slot] || { encadrants: [] };

    if (currentSlot.encadrants.some(a => a.membre_id === member.membre_id)) {
      return;
    }

    const newTheorie = { ...theorie };
    newTheorie[slot] = {
      ...currentSlot,
      encadrants: [...currentSlot.encadrants, member]
    };
    await this.updateSession(clubId, sessionId, { theorie: newTheorie });
  }

  /**
   * Encadrant verwijderen uit een théorie tijdslot
   */
  static async removeFromTheorie(
    clubId: string,
    sessionId: string,
    slot: string,
    membreId: string
  ): Promise<void> {
    const session = await this.getSession(clubId, sessionId);
    if (!session) throw new Error('Session not found');

    const theorie = session.theorie || {};
    const currentSlot = theorie[slot];
    if (!currentSlot) return;

    const newTheorie = { ...theorie };
    newTheorie[slot] = {
      ...currentSlot,
      encadrants: currentSlot.encadrants.filter(a => a.membre_id !== membreId)
    };
    await this.updateSession(clubId, sessionId, { theorie: newTheorie });
  }

  /**
   * Thema updaten voor een théorie tijdslot
   */
  static async updateTheorieTheme(
    clubId: string,
    sessionId: string,
    slot: string,
    theme: string,
    updatedBy: string
  ): Promise<void> {
    const session = await this.getSession(clubId, sessionId);
    if (!session) throw new Error('Session not found');

    const theorie = session.theorie || {};
    const currentSlot = theorie[slot] || { encadrants: [] };

    const newTheorie = { ...theorie };
    newTheorie[slot] = {
      ...currentSlot,
      theme,
      themeUpdatedBy: updatedBy,
      themeUpdatedAt: new Date()
    };
    await this.updateSession(clubId, sessionId, { theorie: newTheorie });
  }

  /**
   * Note/commentaire bijwerken voor een cel
   * @param cellKey - Identifier van de cel (bv. 'accueil', 'baptemes', 'gonflage_19h45', etc.)
   */
  static async updateNote(
    clubId: string,
    sessionId: string,
    cellKey: string,
    note: string
  ): Promise<void> {
    const session = await this.getSession(clubId, sessionId);
    if (!session) throw new Error('Session not found');

    const notes = { ...(session.notes || {}) };
    if (note.trim()) {
      notes[cellKey] = note.trim();
    } else {
      delete notes[cellKey];
    }
    await this.updateSession(clubId, sessionId, { notes });
  }

  /**
   * Encadrant toewijzen aan een niveau (met optioneel uur-créneau)
   */
  static async assignEncadrantToLevel(
    clubId: string,
    sessionId: string,
    level: string,
    member: SessionAssignment
  ): Promise<void> {
    const session = await this.getSession(clubId, sessionId);
    if (!session) throw new Error('Session not found');

    const levelAssignment = session.niveaux[level];
    if (!levelAssignment) throw new Error('Level not found');

    // Check duplicaat: zelfde lid + zelfde uur
    // Rétrocompatibilité: encadrants zonder heure worden beschouwd als '1ere_heure'
    if (levelAssignment.encadrants.some(a =>
      a.membre_id === member.membre_id && ((a.heure || '1ere_heure') === (member.heure || '1ere_heure'))
    )) {
      return;
    }

    const newNiveaux = { ...session.niveaux };
    newNiveaux[level] = {
      ...levelAssignment,
      encadrants: [...levelAssignment.encadrants, member]
    };

    await this.updateSession(clubId, sessionId, { niveaux: newNiveaux });
  }

  /**
   * Encadrant verwijderen uit een niveau (op basis van membre_id + heure)
   */
  static async removeEncadrantFromLevel(
    clubId: string,
    sessionId: string,
    level: string,
    membreId: string,
    heure?: string
  ): Promise<void> {
    const session = await this.getSession(clubId, sessionId);
    if (!session) throw new Error('Session not found');

    const levelAssignment = session.niveaux[level];
    if (!levelAssignment) throw new Error('Level not found');

    const newNiveaux = { ...session.niveaux };
    newNiveaux[level] = {
      ...levelAssignment,
      encadrants: levelAssignment.encadrants.filter(a => {
        if (a.membre_id !== membreId) return true;
        // Als heure meegegeven, filter op specifiek uur; anders verwijder alle
        if (heure) {
          // Match ook encadrants zonder heure veld als we 1ere_heure verwijderen
          const effectiveHeure = a.heure || '1ere_heure';
          return effectiveHeure !== heure;
        }
        return false;
      })
    };

    await this.updateSession(clubId, sessionId, { niveaux: newNiveaux });
  }

  /**
   * Thema updaten voor een niveau
   * Note: We moeten het hele niveaux object updaten omdat Firestore
   * geen speciale tekens (zoals *) toestaat in dot notation field paths
   */
  static async updateTheme(
    clubId: string,
    sessionId: string,
    level: string,
    theme: string,
    updatedBy: string
  ): Promise<void> {
    const docRef = doc(this.sessionsCollection(clubId), sessionId);

    // Eerst de huidige sessie ophalen
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) {
      throw new Error('Session not found');
    }

    const sessionData = docSnap.data();
    const niveaux = { ...sessionData.niveaux };

    // Update het specifieke niveau (initialiseer als het nog niet bestaat)
    if (!niveaux[level]) {
      niveaux[level] = { encadrants: [] };
    }
    niveaux[level] = {
      ...niveaux[level],
      theme: theme,
      theme_updated_by: updatedBy,
      theme_updated_at: Timestamp.fromDate(new Date())
    };

    // Schrijf het hele niveaux object terug
    await updateDoc(docRef, {
      niveaux: niveaux,
      updated_at: Timestamp.fromDate(new Date())
    });
  }

  /**
   * Thema per uur updaten voor een niveau (1ere_heure / 2eme_heure)
   */
  static async updateThemePerHeure(
    clubId: string,
    sessionId: string,
    level: string,
    heure: string,
    theme: string,
    updatedBy: string
  ): Promise<void> {
    const docRef = doc(this.sessionsCollection(clubId), sessionId);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) {
      throw new Error('Session not found');
    }

    const sessionData = docSnap.data();
    const niveaux = { ...sessionData.niveaux };

    // Initialiseer niveau als het nog niet bestaat
    if (!niveaux[level]) {
      niveaux[level] = { encadrants: [] };
    }
    niveaux[level] = {
      ...niveaux[level],
      [`theme_${heure}`]: theme,
      [`theme_${heure}_updated_by`]: updatedBy,
      [`theme_${heure}_updated_at`]: Timestamp.fromDate(new Date())
    };

    await updateDoc(docRef, {
      niveaux: niveaux,
      updated_at: Timestamp.fromDate(new Date())
    });
  }

  /**
   * Sessie status wijzigen
   */
  static async updateStatus(
    clubId: string,
    sessionId: string,
    status: string
  ): Promise<void> {
    await this.updateSession(clubId, sessionId, { statut: status });
  }

  /**
   * Sessie publiceren
   */
  static async publishSession(clubId: string, sessionId: string): Promise<void> {
    await this.updateStatus(clubId, sessionId, PiscineSessionStatus.publie);
  }

  /**
   * Sessie verwijderen
   */
  static async deleteSession(clubId: string, sessionId: string): Promise<void> {
    const docRef = doc(this.sessionsCollection(clubId), sessionId);
    await deleteDoc(docRef);
  }

  /**
   * Alle dinsdagen van een maand ophalen
   * Tijd wordt op 12:00 gezet om timezone problemen te voorkomen
   */
  static getTuesdaysOfMonth(year: number, month: number): Date[] {
    const tuesdays: Date[] = [];
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);

    let current = new Date(firstDay);
    while (current.getDay() !== 2) {
      current.setDate(current.getDate() + 1);
    }

    while (current <= lastDay) {
      // Zet tijd op 12:00 om timezone verschuiving te voorkomen
      const tuesday = new Date(current);
      tuesday.setHours(12, 0, 0, 0);
      tuesdays.push(tuesday);
      current.setDate(current.getDate() + 7);
    }

    return tuesdays;
  }

  /**
   * Sessies aanmaken voor alle dinsdagen van een maand
   */
  static async createSessionsForMonth(
    clubId: string,
    year: number,
    month: number,
    defaultLieu: string,
    createdBy: string
  ): Promise<string[]> {
    const tuesdays = this.getTuesdaysOfMonth(year, month);
    const existingSessions = await this.getSessionsForMonth(clubId, year, month);

    const sessionIds: string[] = [];

    for (const tuesday of tuesdays) {
      // Check of er al een sessie bestaat voor deze datum
      const existingSession = existingSessions.find(s => {
        const sDate = s.date;
        return sDate.getFullYear() === tuesday.getFullYear() &&
               sDate.getMonth() === tuesday.getMonth() &&
               sDate.getDate() === tuesday.getDate();
      });

      if (!existingSession) {
        // Maak lege niveaux aan
        const niveaux: Record<string, LevelAssignment> = {};
        for (const level of PiscineLevel.all) {
          niveaux[level] = { encadrants: [] };
        }

        // Créer les slots gonflage vides
        const gonflage: Record<string, SessionAssignment[]> = {};
        for (const slot of GONFLAGE_SLOTS) {
          gonflage[slot] = [];
        }

        const sessionId = await this.createSession(clubId, {
          operationId: '',
          type: 'piscine',
          date: tuesday,
          lieu: defaultLieu,
          horaireDebut: '20:30',
          horaireFin: '21:30',
          accueil: [],
          baptemes: [],
          gonflage: gonflage as Record<GonflageSlot, SessionAssignment[]>,
          niveaux,
          statut: PiscineSessionStatus.brouillon,
          createdBy
        });

        sessionIds.push(sessionId);
      }
    }

    return sessionIds;
  }

  // Helper methodes

  private static docToSession(doc: any): PiscineSession {
    const data = doc.data();

    // Parse niveaux
    const niveauxData = data.niveaux as Record<string, any> || {};
    const niveaux: Record<string, LevelAssignment> = {};

    for (const level of PiscineLevel.all) {
      if (niveauxData[level]) {
        niveaux[level] = this.parseLevelAssignment(niveauxData[level]);
      } else {
        niveaux[level] = { encadrants: [] };
      }
    }

    // Parse gonflage — rétrocompatible (ancien: Array, nouveau: Map par slot)
    const gonflage = this.parseGonflage(data.gonflage);

    // Parse théorie (optionnel)
    let theorie: Record<string, LevelAssignment> | undefined;
    if (data.theorie && typeof data.theorie === 'object') {
      theorie = {};
      for (const [slot, slotData] of Object.entries(data.theorie)) {
        theorie[slot] = this.parseLevelAssignment(slotData as any);
      }
    }

    return {
      id: doc.id,
      operationId: data.operation_id || '',
      type: data.type || 'piscine',
      date: data.date?.toDate() || new Date(),
      lieu: data.lieu || '',
      horaireDebut: data.horaire_debut || '20:30',
      horaireFin: data.horaire_fin || '21:30',
      accueil: (data.accueil || []).map((a: any) => this.parseAssignment(a)),
      baptemes: (data.baptemes || []).map((a: any) => this.parseAssignment(a)),
      gonflage,
      niveaux,
      theorie,
      notes: data.notes || {},
      statut: data.statut || PiscineSessionStatus.brouillon,
      createdAt: data.created_at?.toDate() || new Date(),
      updatedAt: data.updated_at?.toDate() || new Date(),
      createdBy: data.created_by || ''
    };
  }

  /**
   * Parse gonflage — rétrocompatible
   * Ancien format: Array de SessionAssignment → placé dans le slot 19h45
   * Nouveau format: Map par slot { "19h45": [...], "20h15": [...], "21h30": [...] }
   */
  private static parseGonflage(rawData: any): Record<GonflageSlot, SessionAssignment[]> {
    const defaultSlots: Record<string, SessionAssignment[]> = {};
    for (const slot of GONFLAGE_SLOTS) {
      defaultSlots[slot] = [];
    }

    if (!rawData) return defaultSlots as Record<GonflageSlot, SessionAssignment[]>;

    // Ancien format: Array
    if (Array.isArray(rawData)) {
      const members = rawData.map((a: any) => this.parseAssignment(a));
      if (members.length > 0) {
        defaultSlots['19h45'] = members;
      }
      return defaultSlots as Record<GonflageSlot, SessionAssignment[]>;
    }

    // Nouveau format: Map par slot
    if (typeof rawData === 'object') {
      for (const slot of GONFLAGE_SLOTS) {
        if (Array.isArray(rawData[slot])) {
          defaultSlots[slot] = rawData[slot].map((a: any) => this.parseAssignment(a));
        }
      }
      // Rétrocompatibilité: lire l'ancien slot '21h15' et le mapper vers '21h30'
      if (Array.isArray(rawData['21h15']) && rawData['21h15'].length > 0 && defaultSlots['21h30']?.length === 0) {
        defaultSlots['21h30'] = rawData['21h15'].map((a: any) => this.parseAssignment(a));
      }
    }

    return defaultSlots as Record<GonflageSlot, SessionAssignment[]>;
  }

  private static parseAssignment(a: any): SessionAssignment {
    const assignment: SessionAssignment = {
      membre_id: a.membre_id || '',
      membre_nom: a.membre_nom || '',
      membre_prenom: a.membre_prenom || ''
    };
    // Bewaar heure veld indien aanwezig (voor encadrants per uur)
    if (a.heure) assignment.heure = a.heure;
    return assignment;
  }

  private static parseLevelAssignment(data: any): LevelAssignment {
    return {
      encadrants: (data.encadrants || []).map((e: any) => this.parseAssignment(e)),
      theme: data.theme,
      themeUpdatedBy: data.theme_updated_by,
      themeUpdatedAt: data.theme_updated_at?.toDate(),
      // Per-uur thema's
      theme_1ere_heure: data.theme_1ere_heure,
      theme_1ere_heure_updated_by: data.theme_1ere_heure_updated_by,
      theme_1ere_heure_updated_at: data.theme_1ere_heure_updated_at?.toDate(),
      theme_2eme_heure: data.theme_2eme_heure,
      theme_2eme_heure_updated_by: data.theme_2eme_heure_updated_by,
      theme_2eme_heure_updated_at: data.theme_2eme_heure_updated_at?.toDate(),
    };
  }

  private static assignmentToMap(assignment: SessionAssignment): Record<string, string> {
    const map: Record<string, string> = {
      membre_id: assignment.membre_id,
      membre_nom: assignment.membre_nom,
      membre_prenom: assignment.membre_prenom
    };
    // Bewaar heure veld indien aanwezig (voor encadrants per uur)
    if (assignment.heure) map.heure = assignment.heure;
    return map;
  }

  private static gonflageToMap(gonflage: Record<string, SessionAssignment[]>): Record<string, any[]> {
    const result: Record<string, any[]> = {};
    for (const [slot, members] of Object.entries(gonflage)) {
      result[slot] = members.map(m => this.assignmentToMap(m));
    }
    return result;
  }

  private static niveauxToMap(niveaux: Record<string, LevelAssignment>): Record<string, any> {
    const result: Record<string, any> = {};

    for (const [level, assignment] of Object.entries(niveaux)) {
      const levelMap: Record<string, any> = {
        encadrants: assignment.encadrants.map(e => this.assignmentToMap(e)),
      };

      // Thème global
      if (assignment.theme) levelMap.theme = assignment.theme;
      if (assignment.themeUpdatedBy) levelMap.theme_updated_by = assignment.themeUpdatedBy;
      if (assignment.themeUpdatedAt) levelMap.theme_updated_at = Timestamp.fromDate(assignment.themeUpdatedAt);

      // Thèmes per-heure (1ere_heure / 2eme_heure)
      if (assignment.theme_1ere_heure) levelMap.theme_1ere_heure = assignment.theme_1ere_heure;
      if (assignment.theme_1ere_heure_updated_by) levelMap.theme_1ere_heure_updated_by = assignment.theme_1ere_heure_updated_by;
      if (assignment.theme_1ere_heure_updated_at) levelMap.theme_1ere_heure_updated_at = Timestamp.fromDate(assignment.theme_1ere_heure_updated_at);
      if (assignment.theme_2eme_heure) levelMap.theme_2eme_heure = assignment.theme_2eme_heure;
      if (assignment.theme_2eme_heure_updated_by) levelMap.theme_2eme_heure_updated_by = assignment.theme_2eme_heure_updated_by;
      if (assignment.theme_2eme_heure_updated_at) levelMap.theme_2eme_heure_updated_at = Timestamp.fromDate(assignment.theme_2eme_heure_updated_at);

      result[level] = levelMap;
    }

    return result;
  }
}

export default PiscineSessionService;
