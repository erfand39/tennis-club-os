import { notFound, redirect } from 'next/navigation';
import { calendarCourts, courtFreeWindows } from '@/lib/calendar';
import { branchDateTime } from '@/lib/calendar-dates';
import { branches, clubFor, clubOverviewCounts, clubTodaySessions } from '@/lib/club';
import { currentUser } from '@/lib/session';
import { DashboardView } from './dashboard-view';

export default async function Dashboard({ params, searchParams }: {
  params: Promise<{ org: string }>;
  searchParams: Promise<{ branch?: string }>;
}) {
  const [{ org }, { branch: requestedBranch }] = await Promise.all([params, searchParams]);
  const user = await currentUser();
  if (!user) redirect('/');
  const club = await clubFor(user.id, org);
  if (!club) notFound();

  const [scope, counts] = await Promise.all([
    branches(user.id, org),
    clubOverviewCounts(user.id, org),
  ]);
  const branch = scope.find(item => item.id === requestedBranch) ?? scope.find(item => item.active) ?? scope[0];
  const now = new Date();
  const today = branch && branchDateTime(branch.timezone, now);
  const [todaySessions, courts, free] = await Promise.all([
    clubTodaySessions(user.id, org, branch ? [branch] : []),
    branch ? calendarCourts(user.id, org, branch.id) : [],
    branch && today ? courtFreeWindows(user.id, org, branch, today.date) : [],
  ]);
  return <DashboardView org={org} club={club} scope={scope} branch={branch} counts={counts}
    todaySessions={todaySessions} courts={courts} free={free} now={now} />;
}
