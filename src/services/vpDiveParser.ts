import { Evenement, InscriptionEvenement, Membre, Operation, ParticipantOperation } from '@/types';
import { generateId, generateEventHash } from '@/utils/utils';
import * as XLSX from 'xlsx';

// Structure des données VP Dive
export interface VPDiveParticipant {
  nom: string;
  plan_tarifaire: string;
  role: string;
  nbr_participants: number;
  numero_licence: string;
  pratique: string;
  pratique_en_cours: string;
  enseignement: string;
  qualification: string;
  date_naissance?: Date;
  portable?: string;
  montant?: number;
  etat_paiement?: string;
  inscrit_le?: Date;
  inscrit_par?: string;
  nom_contact_urgence?: string;
  prenom_contact_urgence?: string;
  portable_contact_urgence?: string;
}

export interface VPDiveEvent {
  titre: string;
  titre_complet?: string;
  date_debut: Date;
  date_fin: Date;
  lieu: string;
  responsable?: string;
  telephone_responsable?: string;
  participants: VPDiveParticipant[];
  total_participants: number;
  source_filename?: string; // Nom du fichier Excel source pour traçabilité
}

// Données extraites du titre
interface VPDiveTitleInfo {
  titre_complet: string;
  titre_court: string;  // Ex: "Barrage"
  lieu: string;         // Ex: "Barrage"
  responsable?: string;  // Ex: "Denis"
  date_debut: Date;
  date_fin: Date;
  telephone_responsable?: string; // Ex: "0498 42 16 80"
}

/**
 * Parser pour les exports VP Dive (.xls)
 * VP Dive est le système de gestion des sorties plongée utilisé par les clubs belges
 *
 * NOUVEAU: Parsing réel du fichier Excel avec SheetJS (xlsx)
 */
export class VPDiveParser {

  /**
   * Parse le fichier Excel VP Dive avec extraction réelle des données
   *
   * Structure attendue:
   * - Row 0: Titre complet avec dates
   * - Row 1: Sous-titre (ignoré)
   * - Row 2: En-têtes colonnes (36 colonnes)
   * - Row 3+: Données participants
   */
  static async parseVPDiveFile(file: File): Promise<VPDiveEvent> {
    try {
      const fileName = file.name; // Capturer le nom du fichier pour traçabilité
      console.log(`📄 Parsing fichier VP Dive: ${fileName}`);

      // 1. Lire fichier en ArrayBuffer
      const arrayBuffer = await file.arrayBuffer();

      // 2. Parser avec SheetJS
      const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];

      console.log(`📊 Sheet trouvé: "${sheetName}"`);

      // 3. Convertir en JSON (array of arrays)
      const data: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });

      console.log(`📋 ${data.length} lignes trouvées`);

      // 4. Parser Row 0 (titre avec dates)
      const titleRow = data[0]?.[0] || '';
      const titleInfo = this.parseTitleRow(titleRow);

      console.log(`📌 Titre: "${titleInfo.titre_court}", Responsable: ${titleInfo.responsable}, Dates: ${titleInfo.date_debut.toLocaleDateString()} - ${titleInfo.date_fin.toLocaleDateString()}`);

      // 5. Parser Row 3+ (participants - Row 2 est headers)
      const participants: VPDiveParticipant[] = [];
      for (let i = 3; i < data.length; i++) {
        const row = data[i];
        if (!row || !row[0]) continue; // Ligne vide

        const participant = this.parseParticipantRow(row);
        if (participant.nom) { // Seulement si nom valide
          participants.push(participant);
        }
      }

      console.log(`👥 ${participants.length} participants extraits`);

      return {
        titre: titleInfo.titre_court,
        titre_complet: titleInfo.titre_complet,
        date_debut: titleInfo.date_debut,
        date_fin: titleInfo.date_fin,
        lieu: titleInfo.lieu,
        responsable: titleInfo.responsable,
        telephone_responsable: titleInfo.telephone_responsable,
        participants,
        total_participants: participants.length,
        source_filename: fileName
      };

    } catch (error) {
      console.error('❌ Erreur parsing VP Dive:', error);
      throw new Error(`Impossible de parser le fichier VP Dive: ${error.message}`);
    }
  }

  /**
   * Parse le titre complet (Row 0) pour extraire les informations
   *
   * Format: "Détail des membres inscrits pour : Barrage - rdv 13:30 - responsable Denis 0498 42 16 80 du 12/10/2025 au 12/10/2025"
   */
  static parseTitleRow(titleRow: string): VPDiveTitleInfo {
    console.log(`🔍 Parsing titre: "${titleRow}"`);

    // Regex pour extraire: titre, responsable (optionnel), téléphone (optionnel), dates
    const regex = /pour\s*:\s*(.+?)\s*(?:-\s*.*responsable\s+([A-Za-zÀ-ÿ\s]+?))?(?:\s+(\d{4}\s*\d{2}\s*\d{2}\s*\d{2}))?\s+du\s+(\d{2}\/\d{2}\/\d{4})\s+au\s+(\d{2}\/\d{2}\/\d{4})/i;

    const match = titleRow.match(regex);

    if (!match) {
      console.warn('⚠️ Format titre non reconnu, utilisation données par défaut');
      return {
        titre_complet: titleRow,
        titre_court: 'Événement VP Dive',
        lieu: 'Inconnu',
        date_debut: new Date(),
        date_fin: new Date()
      };
    }

    // Extraction des groupes regex
    const titreComplet = match[1]?.trim() || 'Événement VP Dive';
    const responsable = match[2]?.trim();
    const telephone = match[3]?.replace(/\s/g, ' '); // Nettoyer espaces
    const dateDebut = this.parseDateFR(match[4]);
    const dateFin = this.parseDateFR(match[5]);

    // Extraire lieu du titre (premier mot généralement)
    const lieu = titreComplet.split(/\s*-\s*/)[0]?.trim() || titreComplet;

    return {
      titre_complet: titreComplet,
      titre_court: lieu,
      lieu,
      responsable,
      telephone_responsable: telephone,
      date_debut: dateDebut,
      date_fin: dateFin
    };
  }

  /**
   * Parse une row participant (36 colonnes)
   *
   * Colonnes importantes:
   * - Col 0: Nom
   * - Col 1: Plan tarifaire
   * - Col 2: Rôle
   * - Col 4: Numéro licence (LIFRAS/FEBRAS)
   * - Col 5: Pratique (niveau)
   * - Col 15: Portable
   * - Col 17: Montant
   * - Col 18: État paiement
   * - Col 23-26: Contact urgence
   */
  static parseParticipantRow(row: any[]): VPDiveParticipant {
    return {
      nom: row[0] || '',
      plan_tarifaire: row[1] || '',
      role: row[2] || '',
      nbr_participants: parseFloat(row[3]) || 1,
      numero_licence: this.cleanLicenceNumber(row[4] || ''),
      pratique: row[5] || '',
      pratique_en_cours: row[6] || '',
      enseignement: row[7] || '',
      qualification: row[8] || '',
      date_naissance: this.parseDateOrExcel(row[13]),
      inscrit_le: this.parseDateOrExcel(row[14]),
      portable: this.formatPhone(row[15]),
      montant: parseFloat(row[17]) || 0,
      etat_paiement: row[18] || '',
      nom_contact_urgence: row[23] || '',
      prenom_contact_urgence: row[24] || '',
      portable_contact_urgence: this.formatPhone(row[26])
    };
  }

  /**
   * Nettoyer numéro de licence (garder LIFRAS uniquement)
   *
   * Format multi-lignes:
   * "55950 (Li.F.R.A.S.)
   *  75382 (Fe.B.R.A.S.)
   *  2503US3677 (P.A.D.I.)"
   *
   * Retourne: "55950 (Li.F.R.A.S.)"
   */
  static cleanLicenceNumber(raw: string): string {
    if (!raw) return '';

    // Chercher ligne LIFRAS
    const match = raw.match(/(\d+)\s*\(Li\.F\.R\.A\.S\.\)/i);
    if (match) {
      return `${match[1]} (Li.F.R.A.S.)`;
    }

    // Sinon prendre première ligne
    return raw.split('\n')[0]?.trim() || raw.trim();
  }

  /**
   * Formater numéro de téléphone
   * Excel stocke parfois comme float: 32484993498.0
   *
   * Formats acceptés:
   * - 32484993498 (float Excel)
   * - "0484993498" (string)
   * - "+32 484 99 34 98" (déjà formaté)
   *
   * Retourne: "+32 484993498" ou vide si invalide
   */
  static formatPhone(raw: any): string {
    if (!raw) return '';

    // Convertir en string et enlever .0 si présent
    let phone = String(raw).replace(/\.0+$/, '').trim();

    // Enlever espaces/tirets
    phone = phone.replace(/[\s\-]/g, '');

    // Si commence par 32, remplacer par +32
    if (phone.startsWith('32') && phone.length >= 10) {
      return `+32 ${phone.substring(2)}`;
    }

    // Si commence par 0, remplacer par +32
    if (phone.startsWith('0') && phone.length >= 9) {
      return `+32 ${phone.substring(1)}`;
    }

    // Déjà au bon format ou invalide
    return phone;
  }

  /**
   * Parser date française DD/MM/YYYY ou DD/MM/YYYY HH:MM:SS (timestamp)
   */
  static parseDateFR(dateStr: string): Date {
    if (!dateStr) return new Date();

    // Séparer date et heure si timestamp complet (ex: "23/06/2025 23:08:48")
    const datePart = dateStr.includes(' ') ? dateStr.split(' ')[0] : dateStr;
    const timePart = dateStr.includes(' ') ? dateStr.split(' ')[1] : undefined;

    const parts = datePart.split('/');
    if (parts.length !== 3) return new Date();

    const day = parseInt(parts[0]);
    const month = parseInt(parts[1]) - 1; // Mois 0-indexé
    const year = parseInt(parts[2]);

    // Si on a une partie heure, la parser aussi (HH:MM:SS)
    let hours = 0;
    let minutes = 0;
    let seconds = 0;
    if (timePart) {
      const timeParts = timePart.split(':');
      hours = parseInt(timeParts[0]) || 0;
      minutes = parseInt(timeParts[1]) || 0;
      seconds = parseInt(timeParts[2]) || 0;
    }

    const date = new Date(year, month, day, hours, minutes, seconds);

    // Valider date
    if (isNaN(date.getTime())) {
      console.warn(`⚠️ Date invalide: "${dateStr}", utilisation date actuelle`);
      return new Date();
    }

    return date;
  }

  /**
   * Parser date Excel (serial number) ou string (timestamp)
   * Gère:
   * - Date objects (SheetJS avec cellDates: true)
   * - Strings DD/MM/YYYY ou DD/MM/YYYY HH:MM:SS (timestamps VP Dive)
   * - Serial numbers Excel (nombre de jours depuis 1900)
   */
  static parseDateOrExcel(raw: any): Date | undefined {
    if (!raw) return undefined;

    // Si déjà une Date (SheetJS avec cellDates: true)
    if (raw instanceof Date) {
      return isNaN(raw.getTime()) ? undefined : raw;
    }

    // Si string format DD/MM/YYYY ou DD/MM/YYYY HH:MM:SS (timestamps)
    if (typeof raw === 'string' && raw.includes('/')) {
      const date = this.parseDateFR(raw);
      // Ne pas retourner undefined si parsing échoue, parseDateFR retourne new Date()
      return isNaN(date.getTime()) ? undefined : date;
    }

    // Si serial number Excel (nombre de jours depuis 1900)
    if (typeof raw === 'number' || !isNaN(Number(raw))) {
      const serialNumber = Number(raw);
      // Excel epoch: 1 Jan 1900 (mais bug année 1900, donc -2)
      const date = new Date((serialNumber - 25569) * 86400 * 1000);
      return isNaN(date.getTime()) ? undefined : date;
    }

    return undefined;
  }

  /**
   * Convertir les données VP Dive en événement CalyCompta
   */
  static convertToEvenement(vpDiveEvent: VPDiveEvent): Evenement {
    // Calculer le budget basé sur les participants
    const montants = vpDiveEvent.participants.map(p => p.montant || 0);
    const budgetRevenus = montants.reduce((sum, m) => sum + m, 0);
    const budgetDepenses = budgetRevenus * 0.7; // Estimation 70% de coûts
    const prixMoyen = montants.length > 0
      ? montants.reduce((sum, m) => sum + m, 0) / montants.length
      : 30;

    // Construire la description avec toutes les informations disponibles
    let description = `Sortie plongée à ${vpDiveEvent.lieu}`;
    if (vpDiveEvent.responsable) {
      description += ` - Responsable: ${vpDiveEvent.responsable}`;
    }
    if (vpDiveEvent.source_filename) {
      description += `\n\nImporté depuis: ${vpDiveEvent.source_filename}`;
    }

    // Générer le hash de déduplication
    const sourceHash = generateEventHash({
      titre: vpDiveEvent.titre,
      date_debut: vpDiveEvent.date_debut,
      lieu: vpDiveEvent.lieu,
      source_filename: vpDiveEvent.source_filename
    });

    return {
      id: generateId(),
      titre: vpDiveEvent.titre,
      description,
      date_debut: vpDiveEvent.date_debut,
      date_fin: vpDiveEvent.date_fin,
      lieu: vpDiveEvent.lieu,
      organisateur_id: '',
      organisateur_nom: vpDiveEvent.responsable || this.extractOrganisateur(vpDiveEvent.participants),
      budget_prevu_revenus: budgetRevenus,
      budget_prevu_depenses: budgetDepenses,
      statut: 'ouvert',
      prix_membre: prixMoyen,
      prix_non_membre: prixMoyen + 10,
      capacite_max: vpDiveEvent.total_participants + 5, // +5 places supplémentaires
      vp_dive_source_hash: sourceHash,
      created_at: new Date(),
      updated_at: new Date()
    };
  }

  /**
   * Convertir les participants VP Dive en inscriptions
   */
  static convertToInscriptions(
    vpDiveEvent: VPDiveEvent,
    evenementId: string,
    membres: Membre[]
  ): InscriptionEvenement[] {
    return vpDiveEvent.participants.map(participant => {
      // Essayer de matcher avec un membre existant
      const membre = this.matchMembre(participant, membres);

      const isPaye = participant.etat_paiement?.toLowerCase().includes('payé') || false;

      const inscription: any = {
        id: generateId(),
        evenement_id: evenementId,
        evenement_titre: vpDiveEvent.titre,
        membre_id: membre?.id || generateId(),
        membre_nom: this.extractNom(participant.nom),
        membre_prenom: this.extractPrenom(participant.nom),
        prix: participant.montant || 0,
        paye: isPaye,
        date_inscription: participant.inscrit_le || vpDiveEvent.date_debut, // Fallback: date de l'événement
        notes: this.buildParticipantNotes(participant)
      };

      // Ajouter date_paiement seulement si payé (éviter undefined dans Firestore)
      if (isPaye) {
        inscription.date_paiement = new Date();
      }

      return inscription as InscriptionEvenement;
    });
  }

  /**
   * Construire notes participant
   */
  private static buildParticipantNotes(participant: VPDiveParticipant): string {
    const notes: string[] = [];

    if (participant.pratique) notes.push(`Niveau: ${participant.pratique}`);
    if (participant.numero_licence) notes.push(`Licence: ${participant.numero_licence}`);
    if (participant.role) notes.push(`Rôle: ${participant.role}`);
    if (participant.portable) notes.push(`Tél: ${participant.portable}`);
    if (participant.nom_contact_urgence && participant.prenom_contact_urgence) {
      notes.push(`Contact urgence: ${participant.prenom_contact_urgence} ${participant.nom_contact_urgence}`);
      if (participant.portable_contact_urgence) {
        notes.push(`Tél urgence: ${participant.portable_contact_urgence}`);
      }
    }

    return notes.join(' | ');
  }

  /**
   * NOUVEAU: Convertir VP Dive en Operation (type='evenement')
   */
  static convertToOperation(vpDiveEvent: VPDiveEvent): Operation {
    // Calculer le budget basé sur les participants
    const montants = vpDiveEvent.participants.map(p => p.montant || 0);
    const budgetRevenus = montants.reduce((sum, m) => sum + m, 0);
    const prixMoyen = montants.length > 0
      ? montants.reduce((sum, m) => sum + m, 0) / montants.length
      : 30;

    // Construire la description
    let description = `Sortie plongée à ${vpDiveEvent.lieu}`;
    if (vpDiveEvent.responsable) {
      description += ` - Responsable: ${vpDiveEvent.responsable}`;
    }
    if (vpDiveEvent.source_filename) {
      description += `\n\nImporté depuis: ${vpDiveEvent.source_filename}`;
    }

    // Générer le hash de déduplication
    const sourceHash = generateEventHash({
      titre: vpDiveEvent.titre,
      date_debut: vpDiveEvent.date_debut,
      lieu: vpDiveEvent.lieu,
      source_filename: vpDiveEvent.source_filename
    });

    return {
      id: generateId(),
      type: 'evenement', // ⭐ NOUVEAU - Toujours 'evenement' pour VP Dive
      titre: vpDiveEvent.titre,
      description,
      montant_prevu: budgetRevenus, // ⭐ NOUVEAU - Remplace budget_prevu_revenus
      statut: 'ouvert',
      organisateur_id: '',
      organisateur_nom: vpDiveEvent.responsable || this.extractOrganisateur(vpDiveEvent.participants),

      // Champs spécifiques événements
      date_debut: vpDiveEvent.date_debut,
      date_fin: vpDiveEvent.date_fin,
      lieu: vpDiveEvent.lieu,
      prix_membre: prixMoyen,
      prix_non_membre: prixMoyen + 10,
      capacite_max: vpDiveEvent.total_participants + 5,
      vp_dive_source_hash: sourceHash,

      created_at: new Date(),
      updated_at: new Date()
    };
  }

  /**
   * NOUVEAU: Convertir participants en ParticipantOperation
   */
  static convertToParticipantOperations(
    vpDiveEvent: VPDiveEvent,
    operationId: string,
    membres: Membre[]
  ): ParticipantOperation[] {
    return vpDiveEvent.participants.map(participant => {
      // Essayer de matcher avec un membre existant
      const membre = this.matchMembre(participant, membres);

      const isPaye = participant.etat_paiement?.toLowerCase().includes('payé') || false;

      const participantOp: any = {
        id: generateId(),
        operation_id: operationId, // ⭐ NOUVEAU
        operation_titre: vpDiveEvent.titre,
        operation_type: 'evenement' as const, // ⭐ NOUVEAU
        membre_id: membre?.id || generateId(),
        membre_nom: this.extractNom(participant.nom),
        membre_prenom: this.extractPrenom(participant.nom),
        lifras_id: membre?.lifras_id, // ⭐ NOUVEAU
        prix: participant.montant || 0,
        paye: isPaye,
        date_inscription: participant.inscrit_le || vpDiveEvent.date_debut,
        notes: this.buildParticipantNotes(participant),
        created_at: new Date(),
        updated_at: new Date()
      };

      // Ajouter date_paiement si payé
      if (isPaye) {
        participantOp.date_paiement = new Date();
      }

      return participantOp as ParticipantOperation;
    });
  }

  /**
   * Analyser les statistiques de l'événement
   */
  static analyzeEventStats(vpDiveEvent: VPDiveEvent): {
    totalParticipants: number;
    niveauxRepartition: Record<string, number>;
    rolesRepartition: Record<string, number>;
    tauxPaiement: number;
    montantTotal: number;
    montantPaye: number;
  } {
    const stats = {
      totalParticipants: vpDiveEvent.total_participants,
      niveauxRepartition: {} as Record<string, number>,
      rolesRepartition: {} as Record<string, number>,
      tauxPaiement: 0,
      montantTotal: 0,
      montantPaye: 0
    };

    let paidCount = 0;

    vpDiveEvent.participants.forEach(p => {
      // Niveaux
      if (p.pratique) {
        stats.niveauxRepartition[p.pratique] = (stats.niveauxRepartition[p.pratique] || 0) + 1;
      }

      // Rôles
      if (p.role) {
        stats.rolesRepartition[p.role] = (stats.rolesRepartition[p.role] || 0) + 1;
      }

      // Paiements
      const montant = p.montant || 0;
      stats.montantTotal += montant;

      if (p.etat_paiement?.toLowerCase().includes('payé')) {
        paidCount++;
        stats.montantPaye += montant;
      }
    });

    stats.tauxPaiement = vpDiveEvent.total_participants > 0
      ? (paidCount / vpDiveEvent.total_participants) * 100
      : 0;

    return stats;
  }

  // === Méthodes utilitaires privées ===

  private static capitalizeFirst(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }

  private static extractNom(nomComplet: string): string {
    const parts = nomComplet.split(' ');
    return parts[0] || '';
  }

  private static extractPrenom(nomComplet: string): string {
    const parts = nomComplet.split(' ');
    return parts.slice(1).join(' ') || '';
  }

  private static extractLifrasId(numeroLicence: string): string {
    // Format: "54791 (Li.F.R.A.S.)"
    const match = numeroLicence.match(/^(\d+)/);
    return match ? match[1] : '';
  }

  private static extractOrganisateur(participants: VPDiveParticipant[]): string {
    const responsable = participants.find(p =>
      p.role?.toLowerCase().includes('responsable') ||
      p.role?.toLowerCase().includes('directeur')
    );
    return responsable ? responsable.nom : '';
  }

  private static matchMembre(participant: VPDiveParticipant, membres: Membre[]): Membre | undefined {
    // Matcher par licence LIFRAS
    if (participant.numero_licence) {
      const lifrasId = this.extractLifrasId(participant.numero_licence);
      const membreByLicence = membres.find(m => m.lifras_id === lifrasId);
      if (membreByLicence) return membreByLicence;
    }

    // Matcher par nom
    const nom = this.extractNom(participant.nom);
    const prenom = this.extractPrenom(participant.nom);
    return membres.find(m =>
      m.nom.toLowerCase() === nom.toLowerCase() &&
      m.prenom.toLowerCase() === prenom.toLowerCase()
    );
  }
}

// Export de la fonction pour utilisation directe
export async function parseVPDiveFile(file: File): Promise<{
  event: Evenement;
  eventId: string;
  participants: VPDiveParticipant[];
}> {
  const vpDiveEvent = await VPDiveParser.parseVPDiveFile(file);
  const evenement = VPDiveParser.convertToEvenement(vpDiveEvent);

  return {
    event: evenement,
    eventId: generateId(),
    participants: vpDiveEvent.participants
  };
}
