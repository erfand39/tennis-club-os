import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildClassRosterCsvData,
  buildCsv,
  buildFinanceLedgerCsvData,
  escapeCsvCell,
} from '../src/lib/csv.ts';

test('escapeCsvCell handles commas, quotes, newlines, nullish, and formula injection', () => {
  assert.equal(escapeCsvCell(null), '');
  assert.equal(escapeCsvCell(undefined), '');
  assert.equal(escapeCsvCell('سارا راد'), 'سارا راد');
  assert.equal(escapeCsvCell('نیاوران, تهران'), '"نیاوران, تهران"');
  assert.equal(escapeCsvCell('متن "نقل‌قول"'), '"متن ""نقل‌قول"""');
  assert.equal(escapeCsvCell('خط۱\nخط۲'), '"خط۱\nخط۲"');
  assert.equal(escapeCsvCell('=SUM(A1:A2)'), "'=SUM(A1:A2)");
  assert.equal(escapeCsvCell('+cmd'), "'+cmd");
  assert.equal(escapeCsvCell('@evil'), "'@evil");
  assert.equal(escapeCsvCell('-cmd'), "'-cmd");
  assert.equal(escapeCsvCell('-800000'), '-800000');
});

test('buildCsv outputs UTF-8 BOM and CRLF line endings by default', () => {
  const csv = buildCsv(['نام', 'وضعیت'], [['سارا راد', 'حاضر'], ['کیان, مریم', 'غایب']]);
  assert.equal(csv.startsWith('\uFEFF'), true);
  const lines = csv.slice(1).split('\r\n');
  assert.deepEqual(lines, ['نام,وضعیت', 'سارا راد,حاضر', '"کیان, مریم",غایب']);

  const plain = buildCsv(['A'], [['1']], { bom: false });
  assert.equal(plain, 'A\r\n1');
});

test('buildClassRosterCsvData orders active entries before withdrawn and fills fallbacks', () => {
  const { headers, rows } = buildClassRosterCsvData(
    [
      { studentName: 'مریم بهرامی', withdrawnAtLabel: '۱۴۰۵/۰۸/۲۰', attendanceLabel: null },
      { studentName: 'سارا راد', withdrawnAtLabel: null, attendanceLabel: 'حاضر' },
      { studentName: null, withdrawnAtLabel: null, attendanceLabel: null },
    ],
    {
      classTitle: 'کلاس گروهی',
      branchName: 'شعبه مرکزی',
      coachName: 'آرمان کیانی',
      courtName: 'زمین ۱',
      sessionDateLabel: 'شنبه ۲۳ آبان ۱۴۰۵',
    },
  );

  assert.equal(headers.length, 10);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], [
    1,
    'سارا راد',
    'ثبت‌نام فعال',
    'حاضر',
    '—',
    'کلاس گروهی',
    'شعبه مرکزی',
    'آرمان کیانی',
    'زمین ۱',
    'شنبه ۲۳ آبان ۱۴۰۵',
  ]);
  assert.equal(rows[1][1], 'پروندهٔ شاگرد');
  assert.equal(rows[1][3], 'ثبت‌نشده');
  assert.equal(rows[2][1], 'مریم بهرامی');
  assert.equal(rows[2][2], 'لغو ثبت‌نام');
  assert.equal(rows[2][4], '۱۴۰۵/۰۸/۲۰');
});

test('buildFinanceLedgerCsvData interleaves payments with linked refunds', () => {
  const { headers, rows } = buildFinanceLedgerCsvData(
    [
      {
        id: 'pay-1',
        methodLabel: 'کارت‌خوان',
        amount: '6800000',
        available: '6000000',
        reference: 'کارتخوان-۱۹۰۴',
        effectiveAtLabel: '۱۴۰۵/۰۸/۲۲',
      },
      {
        id: 'pay-2',
        methodLabel: 'نقدی',
        amount: '1000000',
        available: '1000000',
        reference: null,
        effectiveAtLabel: '۱۴۰۵/۰۸/۲۳',
      },
    ],
    [
      {
        paymentId: 'pay-1',
        amount: '800000',
        reason: 'تعدیل هزینه',
        effectiveAtLabel: '۱۴۰۵/۰۸/۲۳',
      },
    ],
    {
      invoiceNumber: '1043',
      currencyLabel: 'ریال',
    },
  );

  assert.equal(headers.length, 9);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], [1, '1043', 'دریافت', 'کارت‌خوان', '6800000', 'ریال', '۱۴۰۵/۰۸/۲۲', 'کارتخوان-۱۹۰۴', '6000000']);
  assert.deepEqual(rows[1], [2, '1043', 'بازپرداخت', 'تعدیل هزینه', '-800000', 'ریال', '۱۴۰۵/۰۸/۲۳', '—', '0']);
  assert.deepEqual(rows[2], [3, '1043', 'دریافت', 'نقدی', '1000000', 'ریال', '۱۴۰۵/۰۸/۲۳', '—', '1000000']);
});
