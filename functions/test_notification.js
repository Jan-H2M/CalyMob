#!/usr/bin/env node
/**
 * Test script to send a push notification via Firebase Admin SDK
 *
 * Usage: node test_notification.js
 */

const admin = require('firebase-admin');

// Initialize with default credentials
admin.initializeApp({
  projectId: 'calycompta'
});

async function getTokensAndTest() {
  try {
    // Get members with fcm_tokens
    const membersSnapshot = await admin.firestore()
      .collection('clubs')
      .doc('calypso')
      .collection('members')
      .limit(20)
      .get();

    let foundToken = null;
    let memberName = '';

    for (const doc of membersSnapshot.docs) {
      const data = doc.data();
      if (data.fcm_tokens && data.fcm_tokens.length > 0) {
        foundToken = data.fcm_tokens[0];
        memberName = (data.prenom || '') + ' ' + (data.nom || '');
        console.log('Found member:', memberName);
        console.log('Token (first 50 chars):', foundToken.substring(0, 50) + '...');
        break;
      }
    }

    if (!foundToken) {
      console.log('No FCM tokens found in Firestore');
      return;
    }

    // Send test notification
    console.log('\nSending test notification...');

    const notificationTitle = 'Test - Push Notification';
    const notificationBody = 'Dit is een test vanuit het terminal script!';

    const message = {
      token: foundToken,
      notification: {
        title: notificationTitle,
        body: notificationBody,
      },
      data: {
        type: 'test_notification',
        click_action: 'FLUTTER_NOTIFICATION_CLICK',
      },
      android: {
        priority: 'high',
        notification: {
          channelId: 'event_messages',
          priority: 'high',
          sound: 'default',
        },
      },
      apns: {
        headers: {
          'apns-priority': '10',
          'apns-expiration': '0',
        },
        payload: {
          aps: {
            alert: {
              title: notificationTitle,
              body: notificationBody,
            },
            sound: 'default',
            badge: 1,
            'content-available': 1,
          },
        },
      },
    };

    const response = await admin.messaging().send(message);
    console.log('✅ Success! Message ID:', response);
    console.log('\n📱 Check ' + memberName + "'s device for the notification!");

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.code) console.error('Error code:', error.code);
  }
}

getTokensAndTest().then(() => process.exit(0));
