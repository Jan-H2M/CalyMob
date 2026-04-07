/**
 * Types voor het Palanquée Assignment System
 *
 * Firestore path: clubs/{clubId}/operations/{operationId}/palanquees/assignments
 *
 * Eén document per operatie met alle palanquées.
 * Klein genoeg (max ~15 groepen × 6 personen) om in één document te passen.
 */

export interface PalanqueeParticipant {
  membre_id: string;
  membre_nom: string;       // Snapshot: "DUPONT"
  membre_prenom: string;    // Snapshot: "Jean"
  niveau: string;           // Snapshot: "2*", "MC", etc.
  ordre: number;            // Volgorde binnen de palanquée (0-based)
}

export interface Palanquee {
  numero: number;           // 1, 2, 3... (display nummer)
  participants: PalanqueeParticipant[];
}

export interface PalanqueeAssignments {
  palanquees: Palanquee[];
  updated_at?: Date;
  updated_by?: string;      // UID van laatste bewerker
}
