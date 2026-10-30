const { excludedFromDirectory } = require('./memberDirectoryVisibility');

test('explicit flags hide accounts, names and absent flags never do', () => {
  for (const data of [{is_test_account:true}, {exclude_from_directory:true},
    {isTestUser:true}, {metadata:{isTestUser:true}}]) {
    expect(excludedFromDirectory(data)).toBe(true);
  }
  for (const data of [{}, {nom:'TEST', email:'test@example.invalid'},
    {is_test_account:false}, {is_test_account:'true'}]) {
    expect(excludedFromDirectory(data)).toBe(false);
  }
});
