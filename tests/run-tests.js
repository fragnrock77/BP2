const assert = require('assert');

const {
  tokenizeQuery,
  toPostfix,
  evaluateQuery,
  convertRowsToCsv,
  buildCaches,
 codex/develop-web-app-for-importing-and-searching-files-vnhkkj

 codex/develop-web-app-for-importing-and-searching-files-ig2zav
  aggregateDatasets,

 codex/develop-web-app-for-importing-and-searching-files-1kckq0
  aggregateDatasets,

 main
 main
 main
  __setTestState,
  __getTestState,
} = require('../app.js');

const results = [];

function test(name, fn) {
  try {
    fn();
    results.push({ name, status: 'passed' });
  } catch (error) {
    results.push({ name, status: 'failed', error });
  }
}

const SAMPLE_ROWS = [
  ['Alice', 'Premium', 'Active'],
  ['Bob', 'Standard', 'Inactive'],
  ['Charlie', 'Premium', 'Active'],
  ['Dora', 'Premium', 'Inactive'],
];

function resetStateForTests() {
  __setTestState({
    headers: ['Name', 'Plan', 'Status'],
    rawRows: SAMPLE_ROWS,
    filteredRows: SAMPLE_ROWS.slice(),
    rowTextCache: [],
    lowerRowTextCache: [],
    currentPage: 1,
    currentFileName: 'sample',
  });
  buildCaches();
}

resetStateForTests();

test('tokenizeQuery extracts operands, operators and quoted expressions', () => {
  const tokens = tokenizeQuery('premium AND "active user" OR (NOT standard)');
  const values = tokens.map((token) => token.value);
  assert.deepStrictEqual(values, [
    'premium',
    'AND',
    'active user',
    'OR',
    '(',
    'NOT',
    'standard',
    ')',
  ]);
});

resetStateForTests();

test('toPostfix throws on unbalanced parentheses', () => {
  const tokens = tokenizeQuery('(premium AND standard');
  assert.throws(() => toPostfix(tokens), /Parenthèses déséquilibrées/);
});

resetStateForTests();

test('toPostfix respects operator precedence', () => {
  const tokens = tokenizeQuery('premium AND NOT inactive OR standard');
  const postfix = toPostfix(tokens).map((token) => token.value);
  assert.deepStrictEqual(postfix, ['premium', 'inactive', 'NOT', 'AND', 'standard', 'OR']);
});

resetStateForTests();

test('evaluateQuery filters rows using boolean logic', () => {
  const options = { caseSensitive: false, exactMatch: false };
  const indexes = evaluateQuery(tokenizeQuery('premium AND NOT Bob'), options);
  assert.deepStrictEqual(indexes, [0, 2, 3]);
});

resetStateForTests();

test('evaluateQuery supports case sensitive and exact matches', () => {
  let indexes = evaluateQuery(tokenizeQuery('premium'), {
    caseSensitive: true,
    exactMatch: true,
  });
  assert.deepStrictEqual(indexes, []);

  indexes = evaluateQuery(tokenizeQuery('Active'), {
    caseSensitive: false,
    exactMatch: true,
  });
  assert.deepStrictEqual(indexes, [0, 2]);

  indexes = evaluateQuery(tokenizeQuery('Premium'), {
    caseSensitive: true,
    exactMatch: true,
  });
  assert.deepStrictEqual(indexes, [0, 2, 3]);
});

resetStateForTests();

test('convertRowsToCsv quotes separators and quotes', () => {
  const csv = convertRowsToCsv(['Name', 'Comment'], [
    ['Alice', 'simple'],
    ['Bob', 'needs, comma'],
    ['Charlie', 'He said "hello"'],
  ]);

  assert.strictEqual(
    csv,
    'Name,Comment\n' +
      'Alice,simple\n' +
      'Bob,"needs, comma"\n' +
      'Charlie,"He said ""hello"""'
  );
});

resetStateForTests();

test('buildCaches keeps caches synchronised', () => {
  const state = __getTestState();
  assert.strictEqual(state.rawRows.length, 4);
  assert.strictEqual(state.rowTextCache.length, 4);
  assert.ok(state.lowerRowTextCache[0].includes('alice'));
});

 codex/develop-web-app-for-importing-and-searching-files-vnhkkj

 codex/develop-web-app-for-importing-and-searching-files-ig2zav

 codex/develop-web-app-for-importing-and-searching-files-1kckq0
 main
test('aggregateDatasets merges multiple selections with file origin column', () => {
  const datasetA = {
    id: 'dataset-a',
    displayName: 'clients.csv',
    baseName: 'clients',
    resolvedHeaders: ['Nom', 'Statut'],
    rows: [
      ['Alice', 'Active'],
      ['Bob', 'Inactif'],
    ],
  };

  const datasetB = {
    id: 'dataset-b',
    displayName: 'scores.xlsx',
    baseName: 'scores',
    resolvedHeaders: ['Nom', 'Score'],
    rows: [['Alice', 42]],
  };

  const { headers, rows, fileName, selectedCount } = aggregateDatasets(
    [datasetA, datasetB],
    new Set(['dataset-a', 'dataset-b'])
  );

  assert.deepStrictEqual(headers, ['Fichier', 'Nom', 'Statut', 'Score']);
  assert.strictEqual(rows.length, 3);
  assert.deepStrictEqual(rows[0], ['clients.csv', 'Alice', 'Active', '']);
  assert.deepStrictEqual(rows[2], ['scores.xlsx', 'Alice', '', 42]);
  assert.strictEqual(fileName, 'multi_fichiers');
  assert.strictEqual(selectedCount, 2);
});

test('aggregateDatasets keeps metadata when a single dataset is selected', () => {
  const dataset = {
    id: 'dataset-unique',
    displayName: 'unique.csv',
    baseName: 'unique',
    resolvedHeaders: ['Nom'],
    rows: [['Alice']],
  };

  const { headers, rows, fileName, selectedCount } = aggregateDatasets(
    [dataset],
    new Set(['dataset-unique'])
  );

  assert.deepStrictEqual(headers, ['Fichier', 'Nom']);
  assert.deepStrictEqual(rows, [['unique.csv', 'Alice']]);
  assert.strictEqual(fileName, 'unique');
  assert.strictEqual(selectedCount, 1);
});

test('aggregateDatasets returns empty payload when nothing is selected', () => {
  const dataset = {
    id: 'dataset-ignored',
    displayName: 'ignored.csv',
    baseName: 'ignored',
    resolvedHeaders: ['Nom'],
    rows: [['Alice']],
  };

  const result = aggregateDatasets([dataset], new Set());

  assert.deepStrictEqual(result.headers, []);
  assert.deepStrictEqual(result.rows, []);
  assert.strictEqual(result.fileName, '');
  assert.strictEqual(result.selectedCount, 0);
});

 codex/develop-web-app-for-importing-and-searching-files-ig2zav


 main
 main
 main
const failed = results.filter((result) => result.status === 'failed');
results.forEach((result) => {
  if (result.status === 'passed') {
    console.log(`✔ ${result.name}`);
  } else {
    console.error(`✖ ${result.name}`);
    console.error(result.error);
  }
});

if (failed.length) {
  process.exitCode = 1;
  console.error(`\n${failed.length} test(s) failed.`);
} else {
  console.log(`\n${results.length} test(s) passed.`);
}
