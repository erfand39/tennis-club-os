import { icon } from './icons.mjs';

const menu = [
  { id:'dashboard', title:'نمای کلی', href:'./', icon:'dashboard', panel:true },
  { id:'calendar', title:'تقویم سانس‌ها', href:'./#calendar', icon:'calendar', panel:true },
  { id:'classes', title:'کلاس‌ها و حضور', href:'./#classes', icon:'people', panel:true },
  { id:'courts', title:'زمین‌ها', href:'./#courts', icon:'court', panel:true },
  { id:'people', title:'مربیان و شاگردان', href:'./#people', icon:'people', panel:true },
  { id:'manage', title:'مدیریت پرونده‌ها', href:'./manage.html', icon:'people' },
  { id:'finance', title:'امور مالی', href:'./finance.html', icon:'dashboard' },
  { id:'operations', title:'بسته، هزینه و تسویه', href:'./operations.html', icon:'dashboard' },
  { id:'reports', title:'گزارش‌ها', href:'./reports.html', icon:'dashboard' },
  { id:'notifications', title:'اعلان‌ها', href:'./notifications.html', icon:'info' },
  { id:'access', title:'نمونهٔ ورود و دسترسی', href:'./access.html', icon:'people' },
  { id:'install', title:'نصب برنامه', href:'./install.html', icon:'info' },
];

export const previewPanels = menu.filter(item => item.panel);

export function previewSidebar(current) {
  const links = menu.map(item =>
    `<a href="${item.href}" data-nav="${item.id}"${item.id === current ? ' aria-current="page"' : ''}>
      ${icon(item.icon, 18)}<span>${item.title}</span></a>`).join('\n');
  return `<aside class="local-sidebar preview-sidebar">
    <a href="./" class="local-brand">
      <img src="./assets/court-icon.svg" width="38" height="38" alt="">
      <span><strong>باشگاه تنیس سام</strong><small dir="ltr">SAM TENNIS CLUB</small></span>
    </a>
    <nav class="club-nav" aria-label="ناوبری باشگاه">
      ${links}
    </nav>
  </aside>`;
}
