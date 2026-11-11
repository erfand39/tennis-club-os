'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export function RefreshInbox() {
  const router=useRouter();
  useEffect(()=>{
    const refresh=()=>{if (document.visibilityState==='visible'&&navigator.onLine) router.refresh();};
    const timer=window.setInterval(refresh,60000);
    return ()=>window.clearInterval(timer);
  },[router]);
  return null;
}
