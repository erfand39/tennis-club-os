export const today = '2026-11-11';
export const previewMinute = 15 * 60;
export const opening = 8 * 60;
export const closing = 22 * 60;

export const courts = [
  { id: 'one', name: 'زمین ۱', surface: 'خاک رس', color: 'clay', active: true },
  { id: 'two', name: 'زمین ۲', surface: 'هاردکورت', color: 'hard', active: true },
  { id: 'three', name: 'زمین ۳', surface: 'هاردکورت', color: 'grass', active: true },
  { id: 'four', name: 'زمین ۴', surface: 'خاک رس', color: 'clay', active: false },
];

export const coaches = [
  { id: 'kiani', name: 'آرمان کیانی', initials: 'آک', note: 'کلاس خصوصی و تکنیک', active: true },
  { id: 'moradi', name: 'نیلوفر مرادی', initials: 'نم', note: 'آموزش پایه و گروهی', active: true },
  { id: 'rostami', name: 'کیان رستمی', initials: 'کر', note: 'تمرین مسابقه', active: false },
];

export const students = [
  { id: 'rad', name: 'سارا راد', initials: 'سر', note: 'سطح متوسط', active: true },
  { id: 'amini', name: 'پارسا امینی', initials: 'پا', note: 'سطح مقدماتی', active: true },
  { id: 'rahimi', name: 'مهسا رحیمی', initials: 'مر', note: 'سطح پیشرفته', active: true },
  { id: 'salehi', name: 'بردیا صالحی', initials: 'بص', note: 'سطح متوسط', active: false },
];

export const kinds = {
  rental: 'اجارهٔ زمین',
  private: 'تمرین خصوصی',
  group: 'کلاس گروهی',
};

export const attendanceLabels = { present:'حاضر',late:'با تأخیر',absent:'غایب',excused:'غیبت موجه' };
export const classRoster = booking => booking.roster ?? (booking.student ? [booking.student] : []);
export const durations = [30, 60, 90, 120];
export const statuses = { confirmed: 'تأییدشده', completed: 'برگزارشده', cancelled: 'لغوشده' };
const dateFormatter = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
  timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
});
const monthFormatter = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
  timeZone: 'UTC', month: 'long', year: 'numeric',
});
const shortFormatter = new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
  timeZone: 'UTC', month: 'long', day: 'numeric',
});
const dayFormatter = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { timeZone: 'UTC', day: 'numeric' });
const weekdayFormatter = new Intl.DateTimeFormat('fa-IR', { timeZone: 'UTC', weekday: 'short' });
const numberFormatter = new Intl.NumberFormat('fa-IR');

export function dateObject(date) {
  return new Date(`${date}T00:00:00Z`);
}
export function addDays(date, amount) {
  const result = dateObject(date);
  result.setUTCDate(result.getUTCDate() + amount);
  return result.toISOString().slice(0, 10);
}
export function weekStart(date) {
  return addDays(date, -((dateObject(date).getUTCDay() + 1) % 7));
}
export function monthStart(date) {
  let start = date;
  while (monthLabel(addDays(start, -1)) === monthLabel(date)) start = addDays(start, -1);
  return start;
}
export function monthDays(date) {
  const month = monthLabel(date);
  const dates = [];
  for (let day = monthStart(date); monthLabel(day) === month; day = addDays(day, 1)) dates.push(day);
  return dates;
}
function parts(formatter, date) {
  return Object.fromEntries(formatter.formatToParts(dateObject(date)).map(part => [part.type, part.value]));
}
export function monthLabel(date) {
  const { month, year } = parts(monthFormatter, date);
  return `${month} ${year}`;
}
export function shortDate(date) {
  const { day, month } = parts(shortFormatter, date);
  return `${day} ${month}`;
}
export function dayNumber(date) {
  return dayFormatter.format(dateObject(date));
}
export function weekday(date) {
  return weekdayFormatter.format(dateObject(date));
}
export function longDate(date) {
  const { weekday, day, month, year } = parts(dateFormatter, date);
  return `${weekday}، ${day} ${month} ${year}`;
}
export function number(value) {
  return numberFormatter.format(value);
}
export function time(minute) {
  const hours = String(Math.floor(minute / 60)).padStart(2, '0');
  const minutes = String(minute % 60).padStart(2, '0');
  return `${hours}:${minutes}`.replace(/\d/g, digit => '۰۱۲۳۴۵۶۷۸۹'[Number(digit)]);
}
function makeBooking(id, date, court, start, duration, kind, name, status = 'confirmed', coach = '', student = '') {
  const item = { id, date, court, start, duration, kind, name, status, coach, student };
  return kind!=='rental' && status==='completed'
    ? { ...item,actualStart:start,actualEnd:start+duration,attendance:{[student]:'present'} }
    : item;
}

export const seedBookings = [
  makeBooking('today-1', today, 'one', 480, 60, 'rental', 'امیر احمدی', 'completed'),
  makeBooking('today-2', today, 'two', 540, 90, 'private', '', 'completed', 'kiani', 'amini'),
  makeBooking('today-3', today, 'one', 570, 90, 'group', '', 'completed', 'moradi', 'rahimi'),
  makeBooking('today-4', today, 'three', 600, 60, 'rental', 'مینا آقایی', 'completed'),
  makeBooking('today-5', today, 'one', 720, 90, 'rental', 'بهنام رضایی', 'completed'),
  makeBooking('today-6', today, 'two', 780, 60, 'rental', 'هومن ساعی', 'completed'),
  makeBooking('today-7', today, 'two', 960, 90, 'private', '', 'confirmed', 'kiani', 'rad'),
  makeBooking('today-8', today, 'one', 990, 60, 'rental', 'محمد شریفی'),
  makeBooking('today-9', today, 'three', 1050, 90, 'group', '', 'confirmed', 'moradi', 'amini'),
  makeBooking('today-10', today, 'one', 1080, 120, 'private', '', 'confirmed', 'kiani', 'rahimi'),
  makeBooking('today-11', today, 'two', 1140, 60, 'rental', 'مهرداد همتی'),
  makeBooking('today-12', today, 'one', 1200, 120, 'rental', 'مهتاب کمالی'),
  makeBooking('tomorrow-1', addDays(today, 1), 'one', 540, 60, 'private', '', 'confirmed', 'kiani', 'amini'),
  makeBooking('tomorrow-2', addDays(today, 1), 'three', 960, 90, 'group', '', 'confirmed', 'moradi', 'rahimi'),
  makeBooking('day-after-1', addDays(today, 2), 'two', 1050, 120, 'rental', 'مهدی نوروزی'),
  makeBooking('next-week-1', addDays(today, 6), 'one', 840, 60, 'rental', 'سام خسروی'),
  makeBooking('yesterday-1', addDays(today, -1), 'two', 810, 60, 'private', '', 'confirmed', 'kiani', 'rad'),
];

export function bookingName(booking) {
  return booking.kind === 'rental'
    ? booking.name
    : students.find(student => student.id === booking.student)?.name ?? '';
}

export function bookingsOn(bookings, date) {
  return bookings.filter(booking => booking.date === date).sort((a, b) => a.start - b.start);
}

export function occupied(bookings, court) {
  return bookings
    .filter(booking => booking.status !== 'cancelled' && (!court || booking.court === court))
    .reduce((sum, booking) => sum + booking.duration, 0);
}

export function validateBooking(draft, bookings) {
  const date = dateObject(draft.date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date) || !Number.isFinite(date.valueOf()) ||
      date.toISOString().slice(0, 10) !== draft.date || draft.date < today) {
    return { field: 'date', message: 'یک تاریخ معتبر از امروز به بعد انتخاب کنید.' };
  }
  if (!courts.some(court => court.id === draft.court && court.active)) {
    return { field: 'court', message: 'یک زمین فعال انتخاب کنید.' };
  }
  if (!Object.hasOwn(kinds, draft.kind)) return { field: 'kind', message: 'نوع سانس را انتخاب کنید.' };
  if (!Number.isInteger(draft.start) || draft.start % 30 !== 0 ||
      !durations.includes(draft.duration) || draft.start < opening || draft.start + draft.duration > closing) {
    return { field: 'start', message: 'سانس باید بین ۰۸:۰۰ تا ۲۲:۰۰ و روی گام ۳۰ دقیقه باشد.' };
  }
  if (draft.date === today && draft.start < previewMinute) {
    return { field: 'start', message: 'ساعت شروع این سانس گذشته است. ساعت دیگری انتخاب کنید.' };
  }
  if (draft.kind === 'rental' && (draft.name.trim().length < 2 || draft.name.trim().length > 50)) {
    return { field: 'name', message: 'نام رزروکننده باید بین ۲ تا ۵۰ نویسه باشد.' };
  }
  if (draft.kind !== 'rental' && !coaches.some(coach => coach.id === draft.coach && coach.active)) {
    return { field: 'coach', message: 'یک مربی فعال انتخاب کنید.' };
  }
  const roster = classRoster(draft);
  if ((draft.kind === 'private' && roster.length!==1) || roster.some(id=>!students.some(student=>student.id===id && student.active))) {
    return { field: 'student', message: 'یک شاگرد فعال انتخاب کنید.' };
  }

  const overlaps = bookings.filter(booking =>
    booking.id !== draft.id && booking.date === draft.date && booking.status !== 'cancelled' &&
    booking.start < draft.start + draft.duration && draft.start < booking.start + booking.duration,
  );
  const resources = [
    { field: 'court', label: 'زمین', id: draft.court },
    { field: 'coach', label: 'مربی', id: draft.coach },
    ...roster.map(id=>({ field:'student',label:'شاگرد',id })),
  ];
  for (const resource of resources) {
    if (!resource.id) continue;
    const conflict = overlaps.find(booking => resource.field==='student' ? classRoster(booking).includes(resource.id) : booking[resource.field]===resource.id);
    if (conflict) {
      return {
        field: resource.field,
        message: `${resource.label} در بازهٔ ${time(conflict.start)} تا ${time(conflict.start + conflict.duration)} رزرو شده است.`,
      };
    }
  }
  return null;
}

export function defaultStart(bookings, date, court) {
  const limit = date === today ? previewMinute : opening;
  for (let start = limit; start < closing; start += 30) {
    const occupied = bookings.some(booking =>
      booking.date === date && booking.court === court && booking.status !== 'cancelled' &&
      booking.start < start + 60 && start < booking.start + booking.duration,
    );
    if (!occupied && start + 60 <= closing) return start;
  }
  return limit;
}

export function storedBookings(value) {
  if (!Array.isArray(value) || value.length > 250) return null;
  const ids = new Set();
  for (const row of value) {
    if (!row || typeof row !== 'object' || typeof row.id !== 'string' || ids.has(row.id) ||
        typeof row.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(row.date) ||
        !Number.isFinite(dateObject(row.date).valueOf()) || dateObject(row.date).toISOString().slice(0, 10) !== row.date ||
        !courts.some(court => court.id === row.court && court.active) || !Object.hasOwn(kinds, row.kind) ||
        !Number.isInteger(row.start) || row.start < opening || row.start % 30 !== 0 ||
        !durations.includes(row.duration) || row.start + row.duration > closing ||
        typeof row.name !== 'string' || row.name.length > 50 || !Object.hasOwn(statuses, row.status) ||
        typeof row.coach !== 'string' || typeof row.student !== 'string' ||
        (row.reason !== undefined && (row.status !== 'cancelled' || typeof row.reason !== 'string' || !row.reason.trim() || row.reason.length>250)) ||
        (row.kind === 'rental' && (row.coach || row.student || row.name.trim().length < 2)) ||
        (row.kind !== 'rental' && (!coaches.some(coach => coach.id === row.coach) ||
          (row.student ? !students.some(student => student.id === row.student) : row.kind==='private')))) return null;
    if (row.roster !== undefined && (row.kind!=='group' || !Array.isArray(row.roster) || row.roster.length>6 ||
        new Set(row.roster).size!==row.roster.length || row.roster.some(id=>!students.some(student=>student.id===id)) ||
        (row.roster[0] ?? '')!==row.student)) return null;
    if (row.attendance !== undefined && (row.kind==='rental' || row.status!=='completed' || !row.attendance ||
        typeof row.attendance!=='object' || Array.isArray(row.attendance) ||
        Object.keys(row.attendance).length!==classRoster(row).length ||
        classRoster(row).some(id=>!Object.hasOwn(attendanceLabels,row.attendance[id])) ||
        !Number.isInteger(row.actualStart) || !Number.isInteger(row.actualEnd) || row.actualStart<0 ||
        row.actualEnd<=row.actualStart || row.actualEnd>1440 ||
        (row.attendanceReason!==undefined && (typeof row.attendanceReason!=='string' || row.attendanceReason.length>250)))) return null;
    ids.add(row.id);
  }
  return value;
}
