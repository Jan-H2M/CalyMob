'use strict';

// Explicit flags only: never hide a real member by guessing from their name.
function excludedFromDirectory(data = {}) {
  return data.exclude_from_directory === true || data.is_test_account === true ||
    data.isTestUser === true || data.metadata?.isTestUser === true;
}

module.exports = { excludedFromDirectory };
