'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function ClubNav({ links }: { links: { href: string; label: string }[] }) {
  const pathname = usePathname();
  const home = links[0]?.href;
  const current = links.filter(({ href }) => pathname === href || (href !== home && pathname.startsWith(href + '/')))
    .reduce<string | undefined>((match, { href }) => !match || href.length > match.length ? href : match, undefined);
  return <nav className="club-nav" aria-label="ناوبری باشگاه">
    {links.map(({ href, label }) => <Link key={href} href={href} aria-current={current === href ? 'page' : undefined}>{label}</Link>)}
  </nav>;
}
