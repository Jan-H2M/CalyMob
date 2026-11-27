const { execFileSync } = require('node:child_process');

// Firebase deployment names are part of the public contract.
const deployedFunctions = [
  'acknowledgeVisibleUnreadCursorV1',
  'addGuestToEvent',
  'analyzeLogbookDictation',
  'analyzeLogbookPage',
  'assignDiveNumber',
  'autoClosePoolSessions',
  'backfillMyDiveNumbers',
  'birthdayNotification',
  'bootstrapUnreadCursorV1',
  'cancelBoutiqueOrder',
  'checkNodaPaymentStatus',
  'cleanupOldMessages',
  'confirmReferenceDiveSiteLocation',
  'createBoutiqueOrder',
  'createCotisationPayment',
  'createInscriptionRefund',
  'createNodaPayment',
  'dailyExerciseDeclarationDigest',
  'decideExerciseEvaluation',
  'deleteDiveLocationSafely',
  'ensurePiscineSessionChatAcl',
  'eventPaymentReminder',
  'expireBoutiqueOrders',
  'getBoutiqueOrderPayment',
  'getMaterialLoanPaymentQr',
  'getMedicalCertificateUrl',
  'joinEventWaitlist',
  'leaveEventWaitlist',
  'listBoutiqueOrders',
  'listReferenceDiveSites',
  'materialLoanOverdueTransition',
  'materialLoanPendingExpiry',
  'mergeDiveLocations',
  'milImpactPreview',
  'milSyncWeekly',
  'mirrorCanonicalToLegacy',
  'mirrorLegacyExpenseClaim',
  'nodaWebhook',
  'onAnnouncementReplyDeleted',
  'onAnnouncementReplyUnreadTimestampCreated',
  'onAnnouncementUnreadTimestampCreated',
  'onAnnouncementWritten',
  'onBuddyConfirmationTask',
  'onClaimAccepted',
  'onClaimRejected',
  'onClaimResubmitted',
  'onClaimSubmitted',
  'onEventMessageUnreadTimestampCreated',
  'onEventTariffConfigurationWritten',
  'onExerciceDeclared',
  'onExercicesValidesWriteSnapshot',
  'onExerciseClaimWriteSnapshot',
  'onExpenseCreated',
  'onExpenseStatusChange',
  'onFormationGoalsWriteSnapshot',
  'onInscriptionChangeAudit',
  'onInscriptionPaidMarkPresent',
  'onInscriptionPaymentAudit',
  'onInscriptionPaymentChange',
  'onLogbookDiveBuddiesChanged',
  'onLogbookEntryGroupChanged',
  'onLogbookEntryWriteSnapshot',
  'onMedicalCertCreated',
  'onMedicalCertStatusChange',
  'onMemberCarnetPreferenceChanged',
  'onMemberFormationFieldsWriteSnapshot',
  'onMemberObservationWriteSnapshot',
  'onMonitorObservationCompleted',
  'onNewAnnouncement',
  'onNewAnnouncementReply',
  'onNewEventMessage',
  'onNewOperation',
  'onNewSessionMessage',
  'onNewTeamMessage',
  'onObservationAcquis',
  'onOperationFinished',
  'onOperationPalanqueeSaved',
  'onPalanqueeSaved',
  'onPiscineAttendeeCreated',
  'onPiscineSessionChatAclWritten',
  'onPiscineTaskAssigned',
  'onPlongeurCodeChanged',
  'onPoolCheckinCompleted',
  'onPoolSessionClosed',
  'onReadStateScopeWritten',
  'onReadStateWritten',
  'onSessionMessageUnreadTimestampCreated',
  'onTargetLevelChanged',
  'onTeamMessageUnreadTimestampCreated',
  'previewDiveLocationMerge',
  'previewDiveLocationReconciliation',
  'processFormationTaskReminders',
  'processStaleDraftClaims',
  'promoteEventWaitlistEntry',
  'rebuildStaleSnapshots',
  'recordInstallmentPayment',
  'recordOnSitePayment',
  'recordPaymentCommunication',
  'registerForEvent',
  'requestExerciseEvaluation',
  'resolveCanonicalDiveLocation',
  'resolveReferenceDiveSiteLocation',
  'respondToLogbookDiveConfirmation',
  'reviewMilProposal',
  'runMilSyncNow',
  'sendBoutiqueOrderPaymentEmail',
  'sendMaterialLoanHandoverReceipt',
  'sendMaterialLoanPaymentQrEmail',
  'sendPaymentQrEmail',
  'sendPaymentReminder',
  'sessionReminder',
  'setBoutiqueGlobalAccess',
  'syncMemberProjections',
  'unregisterFromEvent',
  'updateBirthdaySharing',
];

function loadFunctions(target) {
  const env = { ...process.env };
  delete env.FUNCTION_TARGET;
  delete env.FUNCTION_DEBUG_MODE;
  if (target) env.FUNCTION_TARGET = target;

  const output = execFileSync(process.execPath, ['-e', `
    const functions = require('./index.js');
    process.stdout.write(JSON.stringify({
      endpoints: Object.fromEntries(Object.entries(functions)
        .map(([name, fn]) => [name, fn.__endpoint ?? null])),
      loadedModules: Object.keys(require.cache),
    }));
  `], { cwd: __dirname, env, encoding: 'utf8' });
  return JSON.parse(output);
}

test('Firebase discovery exposes every deployed entry point', () => {
  const { endpoints } = loadFunctions();
  expect(Object.keys(endpoints).sort()).toEqual(deployedFunctions);
  expect(Object.values(endpoints)).not.toContain(null);
});

test('the registration instance loads only its function and dependencies', () => {
  const { endpoints, loadedModules } = loadFunctions('registerForEvent');
  expect(Object.keys(endpoints)).toEqual(['registerForEvent']);
  expect(endpoints.registerForEvent).toMatchObject({
    platform: 'gcfv2',
    region: ['europe-west1'],
    callableTrigger: {},
    minInstances: 1,
  });
  const modulePaths = loadedModules.map(path => path.replaceAll('\\', '/'));
  expect(modulePaths.some(path => path.includes('/src/payment/'))).toBe(false);
  expect(modulePaths.some(path =>
    /\/node_modules\/(googleapis|pdfkit|handlebars|qrcode)\//.test(path)
  )).toBe(false);
});
