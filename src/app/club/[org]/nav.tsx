'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function ClubNav({ links }: { links: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return <nav aria-label="ناوبری باشگاه">{links.map(({href,label},index) =>
    <Link key={href} href={href} aria-current={pathname === href || (index > 0 && pathname.startsWith(href + '/')) ? 'page' : undefined}>{label}</Link>)}</nav>;
}
