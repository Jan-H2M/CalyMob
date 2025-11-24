/**
 * Email History Types
 * Tracks all emails sent (manual and automated)
 */

import { Timestamp } from 'firebase/firestore';
import { EmailTemplateType } from './emailTemplates';

/**
 * Email send status
 */
export type EmailStatus = 'sent' | 'failed' | 'pending';

/**
 * Email send type
 */
export type EmailSendType = 'manual' | 'automated';

/**
 * Email History Entry
 * Stored in Firestore: /clubs/{clubId}/email_history/{emailId}
 */
export interface EmailHistoryEntry {
  id: string;

  // Recipient info
  recipientEmail: string;
  recipientName?: string;
  recipientId?: string;           // User ID if sent to a user

  // Email content
  subject: string;
  htmlContent: string;
  textContent?: string;

  // Template info (if used)
  templateId?: string;
  templateType?: EmailTemplateType;
  templateName?: string;

  // Sending info
  sendType: EmailSendType;        // manual or automated
  sentBy?: string;                // User ID who sent (for manual emails)
  sentByName?: string;            // Display name of sender
  status: EmailStatus;
  statusMessage?: string;         // Error message if failed

  // Timestamps
  createdAt: Date | Timestamp;
  sentAt?: Date | Timestamp;

  // Job info (for automated emails)
  jobId?: string;
  jobName?: string;

  // Metadata
  clubId: string;
}

/**
 * Email history filter options
 */
export interface EmailHistoryFilters {
  recipientEmail?: string;
  templateType?: EmailTemplateType;
  sendType?: EmailSendType;
  status?: EmailStatus;
  startDate?: Date;
  endDate?: Date;
}
