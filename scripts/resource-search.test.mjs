import assert from 'node:assert/strict';
import test from 'node:test';
import { filterAndRankResources, formatSearchMeta, normalizeSearchText } from '../src/lib/resource-search.ts';

test('normalizeSearchText normalizes Arabic/Persian variants and whitespace', () => {
  assert.equal(normalizeSearchText('  كريم   علي  '), 'کریم علی');
  assert.equal(normalizeSearchText('   '), '');
});

test('filterAndRankResources ranks active and prefix matches first across students, coaches, and courts', () => {
  const sample = [
    { id: '1', kind: 'students', name: 'زهرا کریمی', status: 'archived', subtitle: 'متوسط', branch_names: ['شعبهٔ مرکزی'] },
    { id: '2', kind: 'coaches', name: 'سارا کریمیان', status: 'active', subtitle: 'خصوصی', branch_names: ['شعبهٔ مرکزی'] },
    { id: '3', kind: 'students', name: 'کریم احمدی', status: 'active', subtitle: 'مبتدی', branch_names: ['شعبهٔ غرب'] },
    { id: '4', kind: 'courts', name: 'زمین کریمی', status: 'inactive', subtitle: 'خاک رس', branch_names: ['شعبهٔ مرکزی'] },
    { id: '5', kind: 'courts', name: 'زمین شماره ۱', status: 'active', subtitle: 'هاردکورت', branch_names: ['شعبهٔ مرکزی'] },
  ];
  const results = filterAndRankResources(sample, 'كريم');
  assert.deepEqual(
    results.map(item => [item.kind, item.id]),
    [
      ['students', '3'],
      ['coaches', '2'],
      ['courts', '4'],
      ['students', '1'],
    ],
  );
  assert.deepEqual(filterAndRankResources(sample, '   '), []);
});

test('formatSearchMeta formats subtitle, branches, and non-active status', () => {
  assert.equal(
    formatSearchMeta({ id: '1', kind: 'courts', name: 'زمین ۱', status: 'active', subtitle: 'خاک رس', branch_names: ['شعبهٔ مرکزی'] }),
    'خاک رس · شعبهٔ مرکزی',
  );
  assert.equal(
    formatSearchMeta({ id: '2', kind: 'students', name: 'سارا', status: 'archived', subtitle: null, branch_names: ['شعبهٔ غرب'] }),
    'شعبهٔ غرب · آرشیوشده',
  );
});
