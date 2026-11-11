export const roles = {
  owner: 'مالک',
  admin: 'مدیر شعبه',
} as const;
export type ClubRole = keyof typeof roles;
