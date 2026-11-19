'use client';

import { useSearchParams } from 'next/navigation';
import type { Branch } from '@/lib/club';

export function MobileBranchBadge({
  branches,
  fallbackName,
}: {
  branches: Branch[];
  fallbackName: string;
}) {
  const searchParams = useSearchParams();
  const branchParam = searchParams.get('branch');
  const matched = branchParam ? branches.find(item => item.id === branchParam) : undefined;
  return <span className="mobile-branch-badge">{matched ? matched.name : fallbackName}</span>;
}
