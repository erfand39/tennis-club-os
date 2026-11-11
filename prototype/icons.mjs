const paths = {
  dashboard: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="16" rx="2.5"/><path d="M7.5 3v4m9-4v4M3.5 10h17M8 14h2m4 0h2m-8 3h2"/>',
  court: '<rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="M12 5v14M2.5 9h19m-19 6h19M7 9v6m10-6v6"/>',
  people: '<path d="M16 21v-1.5A4.5 4.5 0 0 0 11.5 15h-4A4.5 4.5 0 0 0 3 19.5V21m18 0v-1.5a4.5 4.5 0 0 0-3.5-4.4"/><circle cx="9.5" cy="7.5" r="3.5"/><path d="M16.5 4.2a3.5 3.5 0 0 1 0 6.7"/>',
  arrowLeft: '<path d="M19 12H5m6-6-6 6 6 6"/>',
  chevronLeft: '<path d="m14.5 6-6 6 6 6"/>',
  chevronRight: '<path d="m9.5 6 6 6-6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  chart: '<path d="M4 19.5h16m-13-3V12m5 4.5V7.5m5 9V4.5"/>',
  racket: '<ellipse cx="14.5" cy="8.8" rx="5.2" ry="6.4" transform="rotate(39 14.5 8.8)"/><path d="m10.6 13.9-5.8 7m-1.3-1.1 2.6 2.2m5.2-16 7.5 6.1m-9.3-3 7.3 6m-4.2-2.4 5.4-6.6"/>',
  pin: '<path d="M19 10c0 5-7 10.5-7 10.5S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.2"/>',
  check: '<path d="m5 12 4.5 4.5L19 7"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5m0-8h.01"/>',
  search: '<circle cx="10.5" cy="10.5" r="5.8"/><path d="m15 15 4.5 4.5"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.4 6.7M20 5v6h-6"/>',
  filter: '<path d="M4 7h16M7 12h10m-7 5h4"/><circle cx="9" cy="7" r="1" fill="currentColor"/><circle cx="15" cy="12" r="1" fill="currentColor"/>',
  edit: '<path d="m5 16-1 4 4-1L20 7l-3-3L5 16Zm10-10 3 3"/>',
};

export function icon(name, size = 20) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
}
