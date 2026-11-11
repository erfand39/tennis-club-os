export const attendanceStates = { present:'حاضر', late:'با تأخیر', absent:'غایب', excused:'غیبت موجه' } as const;
export type AttendanceState = keyof typeof attendanceStates;

export const classStates = { scheduled:'برنامه‌ریزی‌شده', completed:'برگزارشده', cancelled:'لغوشده' } as const;
export type ClassState = keyof typeof classStates;

export function classesPath(org: string, session?: string, filters?: Record<string,string>) {
  const query = new URLSearchParams(filters);
  return `/club/${org}/classes${session ? '/'+session : ''}${query.size ? '?'+query.toString() : ''}`;
}
