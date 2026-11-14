'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon, type IconName } from '@/app/components/icon';

export interface NavLinkItem {
  href: string;
  label: string;
  icon?: IconName;
}

export function ClubNav({ links }: { links: NavLinkItem[] }) {
  const pathname = usePathname();
  const home = links[0]?.href;
  const current = links.filter(({ href }) => pathname === href || (href !== home && pathname.startsWith(href + '/')))
    .reduce<string | undefined>((match, { href }) => !match || href.length > match.length ? href : match, undefined);
  return <nav className="club-nav" aria-label="ناوبری باشگاه">
    {links.map(({ href, label, icon }) => (
      <Link key={href} href={href} aria-current={current === href ? 'page' : undefined}>
        {icon && <Icon name={icon} size={17} aria-hidden />}
        <span>{label}</span>
      </Link>
    ))}
  </nav>;
}
