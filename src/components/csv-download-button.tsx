'use client';

import { Download } from 'lucide-react';
import { buildCsv, type CsvCell } from '@/lib/csv';

type CsvDownloadButtonProps = {
  filename: string;
  headers: readonly string[];
  rows: readonly (readonly CsvCell[])[];
  label?: string;
  ariaLabel?: string;
  className?: string;
};

export function CsvDownloadButton({
  filename,
  headers,
  rows,
  label = 'دانلود CSV',
  ariaLabel,
  className,
}: CsvDownloadButtonProps) {
  const isEmpty = rows.length === 0;

  function handleDownload() {
    if (isEmpty) return;
    const csvContent = buildCsv(headers, rows);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <button
      type="button"
      className={['button subtle csv-download-btn', className].filter(Boolean).join(' ')}
      onClick={handleDownload}
      disabled={isEmpty}
      aria-label={ariaLabel ?? label}
      data-csv-rows={rows.length}
      data-csv-filename={filename}
    >
      <Download size={16} aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}
