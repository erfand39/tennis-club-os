export type CsvCell = string | number | bigint | boolean | null | undefined;

const FORMULA_PREFIX_RE = /^[=+\-@\t\r]/;
const SAFE_NEGATIVE_NUMBER_RE = /^-\d+(?:\.\d+)?$/;
const NEEDS_QUOTING_RE = /[",\r\n]/;

export function escapeCsvCell(value: CsvCell): string {
  if (value === null || value === undefined) return '';
  const raw = String(value);
  const safe =
    FORMULA_PREFIX_RE.test(raw) && !SAFE_NEGATIVE_NUMBER_RE.test(raw)
      ? `'${raw}`
      : raw;
  if (!NEEDS_QUOTING_RE.test(safe)) return safe;
  return `"${safe.replaceAll('"', '""')}"`;
}

export function buildCsv(
  headers: readonly string[],
  rows: readonly (readonly CsvCell[])[],
  options: { bom?: boolean } = {},
): string {
  const lines = [
    headers.map(escapeCsvCell).join(','),
    ...rows.map((row) => row.map(escapeCsvCell).join(',')),
  ];
  const body = lines.join('\r\n');
  return options.bom === false ? body : `\uFEFF${body}`;
}

export type ClassRosterCsvEntry = {
  studentName: string | null;
  withdrawnAtLabel: string | null;
  attendanceLabel: string | null;
};

export type ClassRosterCsvMeta = {
  classTitle: string;
  branchName: string;
  coachName: string | null;
  courtName: string;
  sessionDateLabel: string;
};

export function buildClassRosterCsvData(
  entries: readonly ClassRosterCsvEntry[],
  meta: ClassRosterCsvMeta,
): { headers: string[]; rows: CsvCell[][] } {
  const headers = [
    'ردیف',
    'نام شاگرد',
    'وضعیت ثبت‌نام',
    'وضعیت حضور',
    'تاریخ لغو',
    'کلاس',
    'شعبه',
    'مربی',
    'زمین',
    'تاریخ جلسه',
  ];

  const sorted = [
    ...entries.filter((item) => !item.withdrawnAtLabel),
    ...entries.filter((item) => Boolean(item.withdrawnAtLabel)),
  ];

  const rows: CsvCell[][] = sorted.map((item, index) => [
    index + 1,
    item.studentName ?? 'پروندهٔ شاگرد',
    item.withdrawnAtLabel ? 'لغو ثبت‌نام' : 'ثبت‌نام فعال',
    item.attendanceLabel ?? 'ثبت‌نشده',
    item.withdrawnAtLabel ?? '—',
    meta.classTitle,
    meta.branchName,
    meta.coachName ?? '—',
    meta.courtName,
    meta.sessionDateLabel,
  ]);

  return { headers, rows };
}

export type FinanceLedgerCsvPayment = {
  id: string;
  methodLabel: string;
  amount: string;
  available: string;
  reference: string | null;
  effectiveAtLabel: string;
};

export type FinanceLedgerCsvRefund = {
  paymentId: string;
  amount: string;
  reason: string;
  effectiveAtLabel: string;
};

export type FinanceLedgerCsvMeta = {
  invoiceNumber: string;
  currencyLabel: string;
};

export function buildFinanceLedgerCsvData(
  payments: readonly FinanceLedgerCsvPayment[],
  refunds: readonly FinanceLedgerCsvRefund[],
  meta: FinanceLedgerCsvMeta,
): { headers: string[]; rows: CsvCell[][] } {
  const headers = [
    'ردیف',
    'شماره فاکتور',
    'نوع تراکنش',
    'روش / علت',
    'مبلغ',
    'واحد پول',
    'تاریخ ثبت',
    'شماره پیگیری',
    'مانده قابل برگشت',
  ];

  const rows: CsvCell[][] = [];
  let rowNumber = 1;

  for (const payment of payments) {
    rows.push([
      rowNumber++,
      meta.invoiceNumber,
      'دریافت',
      payment.methodLabel,
      payment.amount,
      meta.currencyLabel,
      payment.effectiveAtLabel,
      payment.reference ?? '—',
      payment.available,
    ]);

    const linkedRefunds = refunds.filter((refund) => refund.paymentId === payment.id);
    for (const refund of linkedRefunds) {
      const signedRefund = refund.amount.startsWith('-') ? refund.amount : `-${refund.amount}`;
      rows.push([
        rowNumber++,
        meta.invoiceNumber,
        'بازپرداخت',
        refund.reason,
        signedRefund,
        meta.currencyLabel,
        refund.effectiveAtLabel,
        '—',
        '0',
      ]);
    }
  }

  return { headers, rows };
}
