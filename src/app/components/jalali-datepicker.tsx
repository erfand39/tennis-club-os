'use client';

import React, { useState, useEffect, useId } from 'react';
import { Icon } from './icon';

export interface JalaliDatePickerProps {
  name: string;
  defaultValue?: string; // YYYY-MM-DD (Gregorian)
  min?: string;
  max?: string;
  required?: boolean;
  label?: string;
  id?: string;
  onChange?: (isoDate: string) => void;
  className?: string;
}

export interface JalaliDateTimePickerProps {
  name: string;
  defaultValue?: string; // YYYY-MM-DDTHH:mm
  min?: string;
  required?: boolean;
  label?: string;
  id?: string;
  onChange?: (isoDateTime: string) => void;
  className?: string;
}

// Jalali month names in Persian
export const JALALI_MONTH_NAMES = [
  'فروردین', 'اردیبهشت', 'خرداد',
  'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر',
  'دی', 'بهمن', 'اسفند'
] as const;

export function gregorianToJalali(dateStr: string): { year: number; month: number; day: number } {
  const d = new Date(dateStr.slice(0, 10) + 'T12:00:00Z');
  if (isNaN(d.getTime())) {
    const today = new Date();
    return gregorianToJalali(today.toISOString().slice(0, 10));
  }
  const parts = new Intl.DateTimeFormat('en-US-u-ca-persian', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'UTC',
  }).formatToParts(d);

  const y = parts.find(p => p.type === 'year')?.value ?? '1404';
  const m = parts.find(p => p.type === 'month')?.value ?? '01';
  const day = parts.find(p => p.type === 'day')?.value ?? '01';

  return {
    year: parseInt(y, 10),
    month: parseInt(m, 10),
    day: parseInt(day, 10),
  };
}

export function jalaliToGregorian(jy: number, jm: number, jd: number): { gy: number; gm: number; gd: number } {
  let gy: number;
  if (jy > 979) {
    gy = 1600;
    jy -= 979;
  } else {
    gy = 621;
  }
  let days = 365 * jy + Math.floor(jy / 33) * 8 + Math.floor(((jy % 33) + 3) / 4) + 78 + jd + ((jm < 7) ? (jm - 1) * 31 : ((jm - 7) * 30) + 186);
  gy += 400 * Math.floor(days / 146097);
  days %= 146097;
  if (days > 36524) {
    gy += 100 * Math.floor(--days / 36524);
    days %= 36524;
    if (days >= 365) days++;
  }
  gy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    gy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  let gd = days + 1;
  const sal_a = [0, 31, ((gy % 4 === 0 && gy % 100 !== 0) || (gy % 400 === 0)) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm: number;
  for (gm = 0; gm < 13 && gd > sal_a[gm]; gm++) gd -= sal_a[gm];
  return { gy, gm, gd };
}

export function formatToPersianDigits(n: number | string): string {
  const f = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  return String(n).replace(/[0-9]/g, d => f[+d]);
}

export function toIsoDate(gy: number, gm: number, gd: number): string {
  const m = String(gm).padStart(2, '0');
  const d = String(gd).padStart(2, '0');
  return `${gy}-${m}-${d}`;
}

export function JalaliDatePicker({
  name,
  defaultValue,
  min,
  max,
  required = false,
  label,
  id: explicitId,
  onChange,
  className = '',
}: JalaliDatePickerProps): React.JSX.Element {
  const generatedId = useId();
  const inputId = explicitId || generatedId;
  const todayIso = new Date().toISOString().slice(0, 10);
  const initialIso = defaultValue || todayIso;

  const [isoDate, setIsoDate] = useState<string>(initialIso);
  const [jalali, setJalali] = useState(gregorianToJalali(initialIso));
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (defaultValue) {
      setIsoDate(defaultValue);
      setJalali(gregorianToJalali(defaultValue));
    }
  }, [defaultValue]);

  const handleSelectDay = (day: number) => {
    const { gy, gm, gd } = jalaliToGregorian(jalali.year, jalali.month, day);
    const newIso = toIsoDate(gy, gm, gd);
    setIsoDate(newIso);
    setJalali({ ...jalali, day });
    setIsOpen(false);
    onChange?.(newIso);
  };

  const handleMonthChange = (month: number) => {
    const { gy, gm, gd } = jalaliToGregorian(jalali.year, month, Math.min(jalali.day, month > 6 ? 30 : 31));
    const newIso = toIsoDate(gy, gm, gd);
    setIsoDate(newIso);
    setJalali({ ...jalali, month });
    onChange?.(newIso);
  };

  const handleYearChange = (year: number) => {
    const { gy, gm, gd } = jalaliToGregorian(year, jalali.month, jalali.day);
    const newIso = toIsoDate(gy, gm, gd);
    setIsoDate(newIso);
    setJalali({ ...jalali, year });
    onChange?.(newIso);
  };

  const formattedJalali = `${formatToPersianDigits(jalali.year)}/${formatToPersianDigits(String(jalali.month).padStart(2, '0'))}/${formatToPersianDigits(String(jalali.day).padStart(2, '0'))}`;

  return (
    <div
      className={`jalali-datepicker-container ${className}`}
      data-jalali-picker="true"
      data-jalali-date={formattedJalali}
    >
      {label && (
        <label htmlFor={inputId} className="field-label">
          {label} {required && <span aria-hidden="true">*</span>}
        </label>
      )}

      {/* Hidden standard input holding ISO Gregorian value for form submission */}
      <input
        type="hidden"
        name={name}
        id={inputId}
        value={isoDate}
        required={required}
        aria-required={required ? 'true' : undefined}
      />

      <div className="jalali-input-wrapper">
        <button
          type="button"
          className="jalali-display-button button subtle"
          aria-expanded={isOpen}
          aria-haspopup="dialog"
          onClick={() => setIsOpen(!isOpen)}
        >
          <Icon name="calendar" size={16} />
          <span className="jalali-date-text">{formattedJalali}</span>
          <span className="jalali-month-name">({JALALI_MONTH_NAMES[jalali.month - 1]})</span>
        </button>
      </div>

      {isOpen && (
        <div className="jalali-popover panel" role="dialog" aria-label="انتخاب تاریخ شمسی">
          <div className="jalali-header">
            <select
              aria-label="انتخاب سال"
              value={jalali.year}
              onChange={e => handleYearChange(parseInt(e.target.value, 10))}
            >
              {[jalali.year - 2, jalali.year - 1, jalali.year, jalali.year + 1, jalali.year + 2].map(y => (
                <option key={y} value={y}>{formatToPersianDigits(y)}</option>
              ))}
            </select>
            <select
              aria-label="انتخاب ماه"
              value={jalali.month}
              onChange={e => handleMonthChange(parseInt(e.target.value, 10))}
            >
              {JALALI_MONTH_NAMES.map((m, idx) => (
                <option key={idx + 1} value={idx + 1}>{m}</option>
              ))}
            </select>
          </div>

          <div className="jalali-days-grid" role="grid" aria-label="روزهای ماه">
            {Array.from({ length: jalali.month <= 6 ? 31 : jalali.month <= 11 ? 30 : 29 }, (_, i) => i + 1).map(d => (
              <button
                key={d}
                type="button"
                className={`jalali-day-cell ${d === jalali.day ? 'is-selected' : ''}`}
                onClick={() => handleSelectDay(d)}
                aria-selected={d === jalali.day}
              >
                {formatToPersianDigits(d)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function JalaliDateTimePicker({
  name,
  defaultValue,
  required = false,
  label,
  id: explicitId,
  onChange,
  className = '',
}: JalaliDateTimePickerProps): React.JSX.Element {
  const generatedId = useId();
  const inputId = explicitId || generatedId;
  const initialIso = defaultValue || new Date().toISOString().slice(0, 16);
  const initialDate = initialIso.slice(0, 10);
  const initialTime = initialIso.slice(11, 16) || '08:00';

  const [datePart, setDatePart] = useState(initialDate);
  const [timePart, setTimePart] = useState(initialTime);

  const handleDateChange = (newDate: string) => {
    setDatePart(newDate);
    onChange?.(`${newDate}T${timePart}`);
  };

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = e.target.value;
    setTimePart(newTime);
    onChange?.(`${datePart}T${newTime}`);
  };

  return (
    <div className={`jalali-datetime-picker ${className}`}>
      {label && (
        <label htmlFor={inputId} className="field-label">
          {label} {required && <span aria-hidden="true">*</span>}
        </label>
      )}
      <div className="datetime-fields" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <JalaliDatePicker
          name={`${name}_date_shim`}
          defaultValue={datePart}
          required={required}
          onChange={handleDateChange}
        />
        <input
          type="time"
          className="time-field"
          value={timePart}
          onChange={handleTimeChange}
          required={required}
          aria-label="ساعت سانس"
        />
        <input
          type="hidden"
          name={name}
          id={inputId}
          value={`${datePart}T${timePart}`}
          required={required}
          aria-required={required ? 'true' : undefined}
        />
      </div>
    </div>
  );
}
