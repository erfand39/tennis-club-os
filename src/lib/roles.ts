export const roles = {
  owner: 'مالک',
  admin: 'مدیر',
  receptionist: 'پذیرش',
  coach: 'مربی',
  accountant: 'حسابدار',
  student: 'شاگرد',
} as const;
export type ClubRole = keyof typeof roles;
