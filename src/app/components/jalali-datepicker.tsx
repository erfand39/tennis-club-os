'use client';

import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  JALALI_MONTH_NAMES,
  type JalaliDate,
  clampIsoDate,
  formatToPersianDigits,
  getJalaliMonthDays,
  gregorianToJalali,
  jalaliToGregorian,
  toIsoDate,
} from '@/lib/jalali';
import { Icon } from './icon';

export {
  JALALI_MONTH_NAMES,
  clampIsoDate,
  formatToPersianDigits,
  getJalaliMonthDays,
  gregorianToJalali,
  jalaliToGregorian,
  toIsoDate,
};

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

function normalizeDateBound(bound?: string): string | undefined {
  if (!bound) return undefined;
  const dateOnly = bound.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(dateOnly) ? dateOnly : undefined;
}

function formatJalaliLabel(j: JalaliDate): string {
  return `${formatToPersianDigits(j.year)}/${formatToPersianDigits(String(j.month).padStart(2, '0'))}/${formatToPersianDigits(String(j.day).padStart(2, '0'))}`;
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
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const minDate = normalizeDateBound(min);
  const maxDate = normalizeDateBound(max);
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const initialIso = useMemo(() => {
    if (defaultValue === '' && !required) return '';
    return clampIsoDate(defaultValue || todayIso, minDate, maxDate);
  }, [defaultValue, maxDate, minDate, required, todayIso]);

  const [isoDate, setIsoDate] = useState<string>(initialIso);
  const [jalali, setJalali] = useState<JalaliDate>(() =>
    gregorianToJalali(initialIso || clampIsoDate(todayIso, minDate, maxDate)),
  );
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (defaultValue !== undefined) {
      if (defaultValue === '' && !required) {
        setIsoDate('');
        setJalali(gregorianToJalali(clampIsoDate(todayIso, minDate, maxDate)));
      } else {
        const clamped = clampIsoDate(defaultValue || todayIso, minDate, maxDate);
        setIsoDate(clamped);
        setJalali(gregorianToJalali(clamped));
      }
    }
  }, [defaultValue, maxDate, minDate, required, todayIso]);

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  const commitDate = (nextIso: string, closePopover = false) => {
    const clamped = clampIsoDate(nextIso, minDate, maxDate);
    setIsoDate(clamped);
    setJalali(gregorianToJalali(clamped));
    if (closePopover) {
      setIsOpen(false);
      triggerRef.current?.focus();
    }
    onChange?.(clamped);
  };

  const handleSelectDay = (day: number) => {
    const { gy, gm, gd } = jalaliToGregorian(jalali.year, jalali.month, day);
    commitDate(toIsoDate(gy, gm, gd), true);
  };

  const handleMonthChange = (month: number) => {
    const maxDay = getJalaliMonthDays(jalali.year, month);
    const nextDay = Math.min(jalali.day, maxDay);
    const { gy, gm, gd } = jalaliToGregorian(jalali.year, month, nextDay);
    commitDate(toIsoDate(gy, gm, gd));
  };

  const handleYearChange = (year: number) => {
    const maxDay = getJalaliMonthDays(year, jalali.month);
    const nextDay = Math.min(jalali.day, maxDay);
    const { gy, gm, gd } = jalaliToGregorian(year, jalali.month, nextDay);
    commitDate(toIsoDate(gy, gm, gd));
  };

  const handleStepMonth = (delta: -1 | 1) => {
    let nextMonth = jalali.month + delta;
    let nextYear = jalali.year;
    if (nextMonth < 1) {
      nextMonth = 12;
      nextYear -= 1;
    } else if (nextMonth > 12) {
      nextMonth = 1;
      nextYear += 1;
    }
    const maxDay = getJalaliMonthDays(nextYear, nextMonth);
    const nextDay = Math.min(jalali.day, maxDay);
    const { gy, gm, gd } = jalaliToGregorian(nextYear, nextMonth, nextDay);
    commitDate(toIsoDate(gy, gm, gd));
  };

  const daysInMonth = getJalaliMonthDays(jalali.year, jalali.month);
  const currentJalaliYear = useMemo(() => gregorianToJalali(todayIso).year, [todayIso]);
  const yearOptions = useMemo(() => {
    const list: number[] = [];
    const minYear = Math.min(currentJalaliYear - 15, jalali.year);
    const maxYear = Math.max(currentJalaliYear + 5, jalali.year);
    for (let y = minYear; y <= maxYear; y++) list.push(y);
    return list;
  }, [currentJalaliYear, jalali.year]);

  const formattedJalali = isoDate ? formatJalaliLabel(jalali) : '';
  const todayOutOfRange = Boolean((minDate && todayIso < minDate) || (maxDate && todayIso > maxDate));

  return (
    <div
      ref={containerRef}
      className={`jalali-datepicker-container ${className}`.trim()}
      data-jalali-picker="true"
      data-jalali-date={formattedJalali || undefined}
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
          ref={triggerRef}
          type="button"
          className="jalali-display-button button subtle"
          aria-expanded={isOpen}
          aria-haspopup="dialog"
          onClick={() => setIsOpen(prev => !prev)}
        >
          <Icon name="calendar" size={16} />
          {isoDate ? (
            <>
              <span className="jalali-date-text">{formattedJalali}</span>
              <span className="jalali-month-name">({JALALI_MONTH_NAMES[jalali.month - 1]})</span>
            </>
          ) : (
            <span className="jalali-date-text">انتخاب تاریخ</span>
          )}
        </button>
      </div>

      {isOpen && (
        <div className="jalali-popover panel" role="dialog" aria-label="انتخاب تاریخ شمسی">
          <div className="jalali-header">
            <button
              type="button"
              className="jalali-nav-btn button subtle"
              aria-label="ماه قبل"
              onClick={() => handleStepMonth(-1)}
            >
              <Icon name="chevron-right" size={14} />
            </button>
            <select
              aria-label="انتخاب ماه"
              value={jalali.month}
              onChange={e => handleMonthChange(parseInt(e.target.value, 10))}
            >
              {JALALI_MONTH_NAMES.map((m, idx) => (
                <option key={idx + 1} value={idx + 1}>{m}</option>
              ))}
            </select>
            <select
              aria-label="انتخاب سال"
              value={jalali.year}
              onChange={e => handleYearChange(parseInt(e.target.value, 10))}
            >
              {yearOptions.map(y => (
                <option key={y} value={y}>{formatToPersianDigits(y)}</option>
              ))}
            </select>
            <button
              type="button"
              className="jalali-nav-btn button subtle"
              aria-label="ماه بعد"
              onClick={() => handleStepMonth(1)}
            >
              <Icon name="chevron-left" size={14} />
            </button>
          </div>

          <div className="jalali-days-grid" role="grid" aria-label="روزهای ماه">
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => {
              const { gy, gm, gd } = jalaliToGregorian(jalali.year, jalali.month, d);
              const cellIso = toIsoDate(gy, gm, gd);
              const disabled = Boolean((minDate && cellIso < minDate) || (maxDate && cellIso > maxDate));
              const isSelected = Boolean(isoDate && cellIso === isoDate);
              return (
                <button
                  key={d}
                  type="button"
                  disabled={disabled}
                  className={`jalali-day-cell ${isSelected ? 'is-selected' : ''} ${disabled ? 'is-disabled' : ''}`.trim()}
                  onClick={() => handleSelectDay(d)}
                  aria-selected={isSelected}
                >
                  {formatToPersianDigits(d)}
                </button>
              );
            })}
          </div>

          <div className="jalali-footer">
            <button
              type="button"
              className="button subtle jalali-today-btn"
              disabled={todayOutOfRange}
              onClick={() => commitDate(todayIso, true)}
            >
              امروز
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function JalaliDateTimePicker({
  name,
  defaultValue,
  min,
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
  const minDate = normalizeDateBound(min);

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
    <div className={`jalali-datetime-picker ${className}`.trim()}>
      {label && (
        <label htmlFor={inputId} className="field-label">
          {label} {required && <span aria-hidden="true">*</span>}
        </label>
      )}
      <div className="datetime-fields">
        <JalaliDatePicker
          name={`${name}_date_shim`}
          defaultValue={datePart}
          min={minDate}
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
