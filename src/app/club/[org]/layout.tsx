import { notFound, redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { clubShellData } from '@/lib/club';
import { currentUser } from '@/lib/session';
import { ClubShell } from './club-shell';

export const dynamic = 'force-dynamic';

export default async function ClubLayout({ children, params }: { children: ReactNode; params: Promise<{ org: string }> }) {
  const [{ org }, user] = await Promise.all([params, currentUser()]);
  if (!user) redirect('/');
  const { club, name, branchList } = await clubShellData(user.id, org);
  if (!club) notFound();
  const activeBranch = branchList.find(b => b.active) ?? branchList[0];
  const activeBranchName = activeBranch ? activeBranch.name : club.name;

  return <ClubShell org={org} club={club} name={name} activeBranchName={activeBranchName} branches={branchList}>{children}</ClubShell>;
}
