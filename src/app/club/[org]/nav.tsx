'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function ClubNav({ links }: { links: { href: string; label: string }[] }) {
  const pathname=usePathname();
  const home=links[0]?.href;
  const selected=(href:string)=>pathname===href||href!==home&&pathname.startsWith(href+'/');
  const main=(href:string)=>href===home||['calendar','finance','notifications'].some(part=>href.endsWith('/'+part));
  const item=({href,label}:{href:string;label:string})=>
    <Link key={href} href={href} aria-current={selected(href)?'page':undefined}>{label}</Link>;
  return <>
    <nav className="club-nav-desktop" aria-label="ناوبری باشگاه">{links.map(item)}</nav>
    <nav className="club-nav-mobile" aria-label="ناوبری باشگاه">
      <div className="club-nav-main">{links.filter(({href})=>main(href)).map(item)}</div>
      <details>
        <summary>{links.find(({href})=>!main(href)&&selected(href))?.label??'بخش‌های بیشتر'}</summary>
        <div className="club-nav-more">{links.filter(({href})=>!main(href)).map(item)}</div>
      </details>
    </nav>
  </>;
}
