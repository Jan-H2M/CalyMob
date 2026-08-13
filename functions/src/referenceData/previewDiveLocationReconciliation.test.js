const { buildReconciliationSummary } = require('./previewDiveLocationReconciliation');

describe('dive-location reconciliation preview', () => {
  test('separates linked, safe, ambiguous and unmatched records without writes', () => {
    const summary = buildReconciliationSummary({
      locations: [
        { id: 'canonical-a', name: 'Grevelingen', country: 'NL' },
        { id: 'canonical-b', name: 'Grevelingen', country: 'BE' },
      ],
      operations: [
        { id: 'operation-1', location_id: 'canonical-a', source: 'calycompta' },
        { id: 'operation-2', lieu: 'texte libre' },
      ],
      logbookEntries: [
        { id: 'entry-1', location_id: 'canonical-a', location_name: 'Grevelingen' },
        { id: 'entry-2', location_name: 'Grevelingen' },
        { id: 'entry-3', location_name: 'Unknown site' },
      ],
    });

    expect(summary.totals).toMatchObject({ canonical_locations: 2, operations: 2, logbook_entries: 3, linked_operations: 1, linked_logbook_entries: 1 });
    expect(summary.backfill_preview).toMatchObject({ safe: 0, ambiguous: 1, no_match: 1 });
    expect(summary.source_breakdown.calycompta).toBe(1);
  });
});
