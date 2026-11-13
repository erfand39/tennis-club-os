import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { PwaStatus } from './pwa-status';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'باشگاه تنیس سام',
  description: 'سامانهٔ محلی مدیریت باشگاه تنیس سام',
  manifest:'/pwa/manifest.webmanifest',
  icons:{apple:'/pwa/apple-icon.png',icon:'/pwa/icon-192.png'},
  appleWebApp:{capable:true,title:'تنیس سام',statusBarStyle:'default'},
  robots: { index: false, follow: false },
};

export const viewport:Viewport={width:'device-width',initialScale:1,viewportFit:'cover',themeColor:'#174c3c'};

export default function Layout({ children }: { children: ReactNode }) {
  return <html lang="fa" dir="rtl"><body><PwaStatus />{children}</body></html>;
}
