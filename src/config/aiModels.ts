/**
 * Centralized AI Model Configuration
 *
 * Uses Anthropic's snapshot IDs (e.g. 'claude-haiku-4-5-20251001').
 * Aliases like 'claude-haiku-4-5' also work but '-latest' suffixes do NOT.
 *
 * To upgrade to a newer model, simply update the ID here —
 * all services will pick it up automatically.
 *
 * @see https://docs.anthropic.com/en/docs/about-claude/models
 */

/**
 * Fast & cheap model — for quick tasks like email generation,
 * categorization, connection tests, and simple completions.
 */
export const CLAUDE_MODEL_FAST = 'claude-haiku-4-5-20251001';

/**
 * Smart & capable model — for complex tasks like document generation,
 * Skills API calls, report writing, and detailed analysis.
 */
export const CLAUDE_MODEL_SMART = 'claude-sonnet-4-5-20250929';

/**
 * Model configuration by use case.
 * Import the specific constant you need, or use this object for dynamic lookup.
 */
export const AI_MODELS = {
  /** Email template generation */
  emailTemplate: CLAUDE_MODEL_FAST,
  /** Transaction categorization */
  categorization: CLAUDE_MODEL_FAST,
  /** Connection testing */
  connectionTest: CLAUDE_MODEL_FAST,
  /** Document generation (Excel, PowerPoint, PDF, Word) */
  documentGeneration: CLAUDE_MODEL_SMART,
  /** Skills API calls */
  skills: CLAUDE_MODEL_SMART,
  /** AI Chat assistant */
  chat: CLAUDE_MODEL_SMART,
} as const;
