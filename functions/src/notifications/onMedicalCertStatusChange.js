/**
 * Cloud Function: Send push notification when medical certificate status changes
 *
 * Triggers on: clubs/{clubId}/members/{memberId}/medical_certificates/{certId} (onUpdate)
 *
 * This function sends push notifications when:
 * - Certificate is approved (status: pending → approved)
 * - Certificate is rejected (status: pending → rejected)
 *
 * Uses Firebase Functions v2 API (Gen2)
 */

const { onDocumentUpdated } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');

/**
 * Format date to French locale string
 */
function formatDate(date) {
  if (!date) return '-';
  const d = date.toDate ? date.toDate() : new Date(date);
  return d.toLocaleDateString('fr-BE');
}

/**
 * Firestore trigger for medical certificate status changes (Gen2)
 */
exports.onMedicalCertStatusChange = onDocumentUpdated(
  {
    document: 'clubs/{clubId}/members/{memberId}/medical_certificates/{certId}',
    region: 'europe-west1',
  },
  async (event) => {
    const { clubId, memberId, certId } = event.params;
    const beforeData = event.data.before.data();
    const afterData = event.data.after.data();

    const oldStatus = beforeData.status;
    const newStatus = afterData.status;

    // Only process status changes from pending
    if (oldStatus !== 'pending' || (newStatus !== 'approved' && newStatus !== 'rejected')) {
      console.log(`[onMedicalCertStatusChange] No notification needed: ${oldStatus} → ${newStatus}`);
      return null;
    }

    console.log(`🏥 [onMedicalCertStatusChange] Status changed: ${oldStatus} → ${newStatus} for cert ${certId}`);
    console.log(`   Member: ${memberId}, Club: ${clubId}`);

    const db = admin.firestore();

    try {
      // 1. Get member data to get FCM token
      const memberDoc = await db
        .collection('clubs')
        .doc(clubId)
        .collection('members')
        .doc(memberId)
        .get();

      if (!memberDoc.exists) {
        console.log(`⚠️ [onMedicalCertStatusChange] Member ${memberId} not found`);
        return null;
      }

      const member = memberDoc.data();
      const fcmToken = member.fcm_token;
      const fcmTokens = member.fcm_tokens || [];

      // Combine tokens (use array if available, fallback to single token)
      const tokens = fcmTokens.length > 0 ? fcmTokens : (fcmToken ? [fcmToken] : []);

      if (tokens.length === 0) {
        console.log(`⚠️ [onMedicalCertStatusChange] No FCM token for member ${memberId}`);
        return null;
      }

      // Check if notifications are enabled
      if (member.notifications_enabled === false) {
        console.log(`⚠️ [onMedicalCertStatusChange] Notifications disabled for member ${memberId}`);
        return null;
      }

      // 2. Prepare notification content based on status
      let title, body;
      const reviewerName = afterData.reviewed_by_nom || 'Un administrateur';

      if (newStatus === 'approved') {
        const validUntil = formatDate(afterData.valid_until);
        title = '✅ Certificat médical approuvé';
        body = `Votre certificat a été validé par ${reviewerName}. Valide jusqu'au ${validUntil}.`;
      } else {
        // rejected
        const reason = afterData.rejection_reason || 'Raison non spécifiée';
        title = '❌ Certificat médical refusé';
        body = `${reviewerName}: ${reason}`;
      }

      console.log(`📱 [onMedicalCertStatusChange] Sending to ${tokens.length} device(s): ${title}`);

      // 3. Prepare the notification payload
      const payload = {
        notification: {
          title,
          body: body.length > 150 ? body.substring(0, 147) + '...' : body,
        },
        data: {
          type: 'medical_certificate',
          club_id: clubId,
          member_id: memberId,
          cert_id: certId,
          status: newStatus,
          click_action: 'FLUTTER_NOTIFICATION_CLICK',
        },
        android: {
          notification: {
            channelId: 'medical_certificates',
            priority: 'high',
            sound: 'default',
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
            },
          },
        },
      };

      // 4. Send notification
      const result = await admin.messaging().sendEachForMulticast({
        tokens,
        ...payload,
      });

      console.log(`✅ [onMedicalCertStatusChange] Sent: ${result.successCount} success, ${result.failureCount} failures`);

      // 5. Log any token errors
      result.responses.forEach((response, index) => {
        if (!response.success) {
          const error = response.error;
          if (error.code === 'messaging/invalid-registration-token' ||
              error.code === 'messaging/registration-token-not-registered') {
            console.log(`   Invalid token at index ${index}: ${tokens[index]?.substring(0, 20)}...`);
          } else {
            console.log(`   Error at index ${index}: ${error.code} - ${error.message}`);
          }
        }
      });

      // 6. Log to audit collection
      await db
        .collection('clubs')
        .doc(clubId)
        .collection('members')
        .doc(memberId)
        .collection('medical_certificates')
        .doc(certId)
        .collection('audit_log')
        .add({
          action: newStatus === 'approved' ? 'certificate_approved' : 'certificate_rejected',
          performed_by: afterData.reviewed_by,
          performed_by_nom: afterData.reviewed_by_nom,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          details: {
            status: newStatus,
            ...(newStatus === 'approved' && { valid_until: afterData.valid_until }),
            ...(newStatus === 'rejected' && { rejection_reason: afterData.rejection_reason }),
          },
          notification_sent: result.successCount > 0,
        });

      return { success: result.successCount, failure: result.failureCount };

    } catch (error) {
      console.error('❌ [onMedicalCertStatusChange] Error:', error);
      throw error;
    }
  }
);

/**
 * Cloud Function: Log medical certificate uploads for audit
 *
 * Triggers on: clubs/{clubId}/members/{memberId}/medical_certificates/{certId} (onCreate)
 */
exports.onMedicalCertCreated = require('firebase-functions/v2/firestore').onDocumentCreated(
  {
    document: 'clubs/{clubId}/members/{memberId}/medical_certificates/{certId}',
    region: 'europe-west1',
  },
  async (event) => {
    const { clubId, memberId, certId } = event.params;
    const certData = event.data.data();

    console.log(`🏥 [onMedicalCertCreated] New certificate uploaded: ${certId}`);
    console.log(`   Member: ${memberId}, Club: ${clubId}`);

    const db = admin.firestore();

    try {
      // Log the upload to audit collection
      await db
        .collection('clubs')
        .doc(clubId)
        .collection('members')
        .doc(memberId)
        .collection('medical_certificates')
        .doc(certId)
        .collection('audit_log')
        .add({
          action: 'certificate_uploaded',
          performed_by: memberId,
          performed_by_nom: certData.member_id === memberId ? 'Membre (self)' : 'Unknown',
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          details: {
            document_type: certData.document_type,
            file_name: certData.file_name,
            status: certData.status,
          },
        });

      console.log(`✅ [onMedicalCertCreated] Audit log created for upload`);
      return { success: true };

    } catch (error) {
      console.error('❌ [onMedicalCertCreated] Error:', error);
      // Don't throw - this is just logging, don't fail the upload
      return { success: false, error: error.message };
    }
  }
);
