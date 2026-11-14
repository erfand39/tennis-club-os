import React from 'react';

export type IconName =
  | 'calendar'
  | 'court'
  | 'clock'
  | 'user'
  | 'users'
  | 'credit-card'
  | 'dollar'
  | 'bell'
  | 'chevron-right'
  | 'chevron-left'
  | 'check'
  | 'close'
  | 'alert'
  | 'trash'
  | 'menu';

export interface IconProps {
  name: IconName;
  className?: string;
  size?: number;
  'aria-hidden'?: boolean;
}

function renderIconPaths(name: IconName): React.ReactNode {
  switch (name) {
    case 'calendar':
      return (
        <>
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </>
      );
    case 'court':
      return (
        <>
          <rect x="3" y="2" width="18" height="20" rx="1.5" />
          <line x1="3" y1="12" x2="21" y2="12" strokeWidth="2.5" />
          <line x1="6" y1="2" x2="6" y2="22" />
          <line x1="18" y1="2" x2="18" y2="22" />
          <line x1="6" y1="7" x2="18" y2="7" />
          <line x1="6" y1="17" x2="18" y2="17" />
          <line x1="12" y1="7" x2="12" y2="17" />
        </>
      );
    case 'clock':
      return (
        <>
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </>
      );
    case 'user':
      return (
        <>
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </>
      );
    case 'users':
      return (
        <>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </>
      );
    case 'credit-card':
      return (
        <>
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <line x1="2" y1="10" x2="22" y2="10" />
          <line x1="6" y1="15" x2="10" y2="15" />
        </>
      );
    case 'dollar':
      return (
        <>
          <line x1="12" y1="1" x2="12" y2="23" />
          <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </>
      );
    case 'bell':
      return (
        <>
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </>
      );
    case 'chevron-right':
      return <polyline points="9 18 15 12 9 6" />;
    case 'chevron-left':
      return <polyline points="15 18 9 12 15 6" />;
    case 'check':
      return <polyline points="20 6 9 17 4 12" />;
    case 'close':
      return (
        <>
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </>
      );
    case 'alert':
      return (
        <>
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </>
      );
    case 'trash':
      return (
        <>
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          <line x1="10" y1="11" x2="10" y2="17" />
          <line x1="14" y1="11" x2="14" y2="17" />
        </>
      );
    case 'menu':
      return (
        <>
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </>
      );
    default:
      return null;
  }
}

export function Icon({
  name,
  className,
  size = 18,
  'aria-hidden': ariaHidden = true,
}: IconProps): React.JSX.Element {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={ariaHidden}
    >
      {renderIconPaths(name)}
    </svg>
  );
}

export default function DefaultIcon(): Response {
  return new Response(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#174c3c" stroke-width="2"><circle cx="12" cy="12" r="10"/></svg>',
    {
      headers: {
        'Content-Type': 'image/svg+xml',
      },
    }
  );
}

