'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function source(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, '..', relativePath), 'utf8');
}

test('all CalyCompta event and announcement creates send canonical server timestamps', () => {
  const eventSource = source('src/services/eventMessageService.ts');
  const announcementSource = source('src/services/annonceService.ts');

  assert.match(
    eventSource,
    /created_at:\s*serverTimestamp\(\),\s*unread_created_at:\s*serverTimestamp\(\)/,
  );
  assert.match(
    announcementSource,
    /created_at:\s*serverTimestamp\(\),\s*unread_created_at:\s*serverTimestamp\(\),\s*unread_activity_at:\s*serverTimestamp\(\)/,
  );
  assert.equal(
    (announcementSource.match(
      /unread_created_at:\s*serverTimestamp\(\)/g,
    ) || []).length,
    2,
  );
});

test('CalyCompta announcement creates use the authenticated Firebase uid as sender', () => {
  const announcementSource = source('src/services/annonceService.ts');
  const announcementPageSource = source('src/pages/PushNotificationsPage.tsx');

  assert.match(
    announcementSource,
    /createAnnonce\([\s\S]*?annonce:\s*Omit<Annonce,\s*'id'\s*\|\s*'created_at'>/,
  );
  assert.match(
    announcementPageSource,
    /createAnnonce\(clubId,\s*\{[\s\S]*?sender_id:\s*user\.uid,/,
  );
});
