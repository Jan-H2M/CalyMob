/**
 * Session Plannings — Planning annuel par niveau
 * Collection: clubs/{clubId}/session_plannings/{planningId}
 */

export interface PlanningEntry {
  date: string;              // "2025-09-09" (ISO format)
  themeId?: string;          // Référence vers session_themes
  themeTitle: string;        // Snapshot: "Rôle du serre-file"
  theoryTopic?: string;      // "Administration", "Physique", etc.
  moniteur1?: string;
  moniteur2?: string;
  notes?: string;            // "Examen" ou notes spéciales
}

export interface SessionPlanning {
  id: string;
  season: string;            // "2025-2026"
  niveau: string;            // "2*" — un planning par niveau

  entries: PlanningEntry[];

  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}