import { notFound, redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { branches, clubFor, displayName } from '@/lib/club';
import { currentUser } from '@/lib/session';
import { ClubShell } from './club-shell';

export const dynamic = 'force-dynamic';

export default async function ClubLayout({ children, params }: { children: ReactNode; params: Promise<{ org: string }> }) {
  const { org } = await params;
  const user = await currentUser();
  if (!user) redirect('/');
  const club = await clubFor(user.id, org);
  if (!club) notFound();
  const name = await displayName(user.id);
  const branchList = await branches(user.id, org);
  const activeBranch = branchList.find(b => b.active) ?? branchList[0];
  const activeBranchName = activeBranch ? activeBranch.name : club.name;

  return <ClubShell org={org} club={club} name={name} activeBranchName={activeBranchName}>{children}</ClubShell>;
}
