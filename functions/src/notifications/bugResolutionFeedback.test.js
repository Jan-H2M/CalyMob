const {
  MAX_SCREENSHOTS,
  feedbackScreenshotPath,
  validFeedbackScreenshots,
} = require('./bugResolutionFeedback');

describe('resolution feedback attachment contract', () => {
  const input = (screenshots) => ({
    clubId: 'calypso', reportId: 'report-1', feedbackId: 'resolution_report-1', screenshots,
  });

  test('uses an isolated, deterministic reporter-feedback prefix', () => {
    expect(feedbackScreenshotPath('calypso', 'r', 'f', 2))
      .toBe('clubs/calypso/bug_reports/r/resolution_feedback/f/screenshot_2.png');
  });

  test('accepts ordered bounded screenshots only', () => {
    const path = feedbackScreenshotPath('calypso', 'report-1', 'resolution_report-1', 0);
    const url = `https://firebasestorage.googleapis.com/v0/b/calycompta/o/${encodeURIComponent(path)}?alt=media`;
    expect(validFeedbackScreenshots(input([{ storagePath: path, url }])))
      .toEqual([{ storagePath: path, url, storageIndex: 0 }]);
  });

  test('rejects a screenshot from the original report prefix', () => {
    expect(() => validFeedbackScreenshots(input([
      { storagePath: 'clubs/calypso/bug_reports/report-1/screenshot_0.png', url: 'https://firebasestorage.googleapis.com/a' },
    ]))).toThrow('Chemin de capture invalide');
  });

  test('rejects more than five screenshots', () => {
    expect(() => validFeedbackScreenshots(input(Array.from({ length: MAX_SCREENSHOTS + 1 }, () => ({})))))
      .toThrow('Au plus');
  });
});
