/**
 * Cloud Function: Sync new bug reports to Linear
 *
 * Triggers on: clubs/{clubId}/bug_reports/{reportId}
 * Creates a Linear issue with all bug report details, then updates the
 * Firestore document with the Linear issue ID and URL.
 *
 * Uses Firebase Functions v2 API (Gen2)
 * Linear API key stored in .env file (LINEAR_API_KEY=lin_api_...)
 * or as Firebase secret: firebase functions:secrets:set LINEAR_API_KEY
 */

const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');
const axios = require('axios');

// Linear workspace configuration
const LINEAR_CONFIG = {
  teamId: '30aa62b8-55f7-47dd-ac57-c99201a71fa0', // Calypso (h2m workspace)
  projects: {
    CalyMob: '2229f67d-c0d1-486e-a78b-50446fe49863',
    CalyCompta: '74d743a8-7a1a-48df-888d-3938b8d7d024',
  },
  labelId: '7fae27f0-59ba-4d09-a90a-d90e7fea8573', // Bug
  // Priority mapping: bug report priority → Linear priority
  // Linear: 0=None, 1=Urgent, 2=High, 3=Normal, 4=Low
  priorityMap: {
    blocking: 1, // Urgent
    annoying: 2, // High
    minor: 4,    // Low
  },
};

/**
 * Firestore trigger — new bug report created
 */
exports.onNewBugReport = onDocumentCreated(
  {
    document: 'clubs/{clubId}/bug_reports/{reportId}',
    region: 'europe-west1',
  },
  async (event) => {
    const { clubId, reportId } = event.params;
    const report = event.data.data();

    console.log(`🐛 New bug report: ${reportId} (club: ${clubId})`);
    console.log('Report data:', JSON.stringify({
      title: report.title,
      app: report.app,
      priority: report.priority,
      reporter: report.reporter?.name,
    }));

    const apiKey = process.env.LINEAR_API_KEY;
    if (!apiKey) {
      console.error('❌ LINEAR_API_KEY not configured. Add it to functions/.env');
      return null;
    }

    try {
      // Build Linear issue description (Markdown)
      const description = buildDescription(report, clubId, reportId);

      // Determine project based on app field
      const app = report.app || 'CalyMob';
      const projectId = LINEAR_CONFIG.projects[app] || LINEAR_CONFIG.projects.CalyMob;

      // Map priority
      const linearPriority = LINEAR_CONFIG.priorityMap[report.priority] || 3;

      // Create Linear issue via GraphQL API
      const mutation = `
        mutation CreateIssue($input: IssueCreateInput!) {
          issueCreate(input: $input) {
            success
            issue {
              id
              identifier
              url
            }
          }
        }
      `;

      const variables = {
        input: {
          teamId: LINEAR_CONFIG.teamId,
          projectId,
          title: `[${app}] ${report.title}`,
          description,
          priority: linearPriority,
          labelIds: [LINEAR_CONFIG.labelId],
        },
      };

      const response = await axios.post(
        'https://api.linear.app/graphql',
        { query: mutation, variables },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: apiKey,
          },
          timeout: 10000,
        }
      );

      const result = response.data?.data?.issueCreate;

      if (!result?.success) {
        console.error('❌ Linear API error:', JSON.stringify(response.data));
        return null;
      }

      const issue = result.issue;
      console.log(`✅ Linear issue created: ${issue.identifier} (${issue.url})`);

      // Update Firestore document with Linear issue info
      await admin.firestore()
        .collection('clubs')
        .doc(clubId)
        .collection('bug_reports')
        .doc(reportId)
        .update({
          linearIssueId: issue.identifier,
          linearIssueUrl: issue.url,
          linearSyncedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

      console.log(`📝 Firestore updated with Linear issue: ${issue.identifier}`);

      // If there's a screenshot, add it as a comment with a link
      if (report.screenshotUrl) {
        const commentMutation = `
          mutation CreateComment($input: CommentCreateInput!) {
            commentCreate(input: $input) {
              success
            }
          }
        `;

        await axios.post(
          'https://api.linear.app/graphql',
          {
            query: commentMutation,
            variables: {
              input: {
                issueId: issue.id,
                body: `📸 **Screenshot**\n\n![Screenshot](${report.screenshotUrl})`,
              },
            },
          },
          {
            headers: {
              'Content-Type': 'application/json',
              Authorization: apiKey,
            },
            timeout: 10000,
          }
        );
        console.log('📸 Screenshot comment added to Linear issue');
      }

      return { issueId: issue.identifier, url: issue.url };
    } catch (error) {
      console.error('❌ Error creating Linear issue:', error.message);
      if (error.response?.data) {
        console.error('Response:', JSON.stringify(error.response.data));
      }
      return null;
    }
  }
);

/**
 * Build a Markdown description for the Linear issue.
 */
function buildDescription(report, clubId, reportId) {
  const lines = [];

  // User description
  if (report.description) {
    lines.push(report.description);
    lines.push('');
  }

  lines.push('---');
  lines.push('');

  // Reporter info
  lines.push('### Signalé par');
  lines.push(`- **Nom**: ${report.reporter?.name || 'Inconnu'}`);
  lines.push(`- **Email**: ${report.reporter?.email || '-'}`);
  lines.push(`- **User ID**: \`${report.reporter?.uid || '-'}\``);
  lines.push('');

  // Device info
  lines.push('### Appareil');
  lines.push(`- **Navigateur/Modèle**: ${report.device?.model || '-'}`);
  lines.push(`- **OS**: ${report.device?.osVersion || report.device?.os || '-'}`);
  lines.push(`- **App version**: ${report.device?.appVersion || '-'}`);
  lines.push(`- **Plateforme**: ${report.device?.platform || '-'}`);
  lines.push('');

  // Context
  lines.push('### Contexte');
  lines.push(`- **Route**: \`${report.currentRoute || '-'}\``);
  lines.push(`- **App**: ${report.app || '-'}`);
  lines.push(`- **Gravité**: ${formatPriority(report.priority)}`);
  lines.push('');

  // Sentry replay link
  if (report.sentryReplayId) {
    lines.push('### Sentry Session Replay');
    lines.push(`[Voir le replay](${report.sentryEventUrl || `https://h2m-ai.sentry.io/replays/?query=${report.sentryReplayId}`})`);
    lines.push('');
  }

  // Firestore reference
  lines.push('### Firestore');
  lines.push(`\`clubs/${clubId}/bug_reports/${reportId}\``);

  return lines.join('\n');
}

/**
 * Format priority for display.
 */
function formatPriority(priority) {
  switch (priority) {
    case 'blocking': return '🔴 Bloquant';
    case 'annoying': return '🟡 Gênant';
    case 'minor': return '🔵 Mineur';
    default: return priority || '-';
  }
}
